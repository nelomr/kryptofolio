import { z } from 'zod';
import { createTool } from '@mastra/core/tools';
import { preciseAmountSchema } from '@kryptofolio/shared-types';
import { downsampleSeries } from '@kryptofolio/core-domain';
import type { PerformanceHistoryPoint } from '../../../domain/ports/IMetricsPort.js';
import type { GetPerformanceHistoryUseCase } from '../../../application/use-cases/GetPerformanceHistoryUseCase.js';
import { advisorRequestContextSchema } from '../advisorRequestContext.js';
import { enforceBudget, type EnforceBudgetResult, type RunBudgetTracker } from './enforceBudget.js';

/** The fixed downsample cap for every time-series tool in this catalogue. */
const MAX_POINTS = 120;

const performancePointSchema = z
  .object({
    date: z.string(),
    portfolioValue: preciseAmountSchema.nullable(),
    btcValue: preciseAmountSchema.optional(),
    drawdownPct: z.string(),
  })
  .strict();

const performanceHistoryPayloadSchema = z
  .object({
    currency: z.string(),
    points: z.array(performancePointSchema),
    omittedCount: z.number().int().nonnegative(),
  })
  .strict();

export const performanceHistoryToolOutputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('ok'), payload: performanceHistoryPayloadSchema }).strict(),
  z
    .object({
      kind: z.literal('truncated'),
      maxChars: z.number().int().positive(),
      actualChars: z.number().int().positive(),
    })
    .strict(),
]);

export type PerformanceHistoryToolPayload = z.infer<typeof performanceHistoryPayloadSchema>;

export const performanceHistoryToolInputSchema = z
  .object({ days: z.number().int().positive().max(3650).optional() })
  .strict();

export interface PerformanceHistoryToolConfig {
  maxChars: number;
  /** The run-wide cap tracker — one instance per advisor run, `undefined` for a metered run. */
  runBudgetTracker?: RunBudgetTracker;
}

/** Pure projection + budget gate. Downsampled via `downsampleSeries`, never via `.filter`/re-sort. */
export function buildPerformanceHistoryToolResult(
  points: readonly PerformanceHistoryPoint[],
  currency: string,
  config: PerformanceHistoryToolConfig,
): EnforceBudgetResult<PerformanceHistoryToolPayload> {
  const { sampled, omittedCount } = downsampleSeries(points, MAX_POINTS);

  const payload: PerformanceHistoryToolPayload = {
    currency,
    points: sampled.map((point) => ({
      date: point.date,
      portfolioValue: point.portfolioValue,
      btcValue: point.btcValue,
      drawdownPct: point.drawdownPct,
    })),
    omittedCount,
  };

  return enforceBudget(payload, config.maxChars, config.runBudgetTracker);
}

/** Structural, not the concrete class: the tool only ever calls `execute`. */
export type PerformanceHistoryUseCaseLike = Pick<GetPerformanceHistoryUseCase, 'execute'>;

/** Constructor takes only the wrapped use case plus pure configuration. */
export function performanceHistoryTool(
  useCase: PerformanceHistoryUseCaseLike,
  config: PerformanceHistoryToolConfig,
) {
  return createTool({
    id: 'performance_history',
    description:
      "Portfolio value over time, downsampled. Values are in the result's `currency`, the user's base currency; a point whose value is null could not be converted. Read-only.",
    inputSchema: performanceHistoryToolInputSchema,
    outputSchema: performanceHistoryToolOutputSchema,
    requestContextSchema: advisorRequestContextSchema,
    execute: async (inputData, { requestContext }) => {
      const baseCurrency = requestContext.get('baseCurrency');
      const points = await useCase.execute(inputData.days, baseCurrency);
      return buildPerformanceHistoryToolResult(points, baseCurrency, config);
    },
  });
}
