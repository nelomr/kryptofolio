import { z } from 'zod';
import { createTool } from '@mastra/core/tools';
import { preciseAmountSchema } from '@kryptofolio/shared-types';
import { downsampleSeries } from '@kryptofolio/core-domain';
import type { PerformanceHistoryPoint } from '../../../domain/ports/IMetricsPort.js';
import type { GetPerformanceHistoryUseCase } from '../../../application/use-cases/GetPerformanceHistoryUseCase.js';
import { enforceBudget, type EnforceBudgetResult, type RunBudgetTracker } from './enforceBudget.js';

/** The fixed downsample cap for every time-series tool in this catalogue. */
const MAX_POINTS = 120;

/**
 * The daily valuation view sums assets whose price series are denominated differently, so it
 * reduces everything to EUR first, and the metrics adapter's history query reads it without the
 * per-date conversion its other queries apply. The use case accepts a target currency but the
 * adapter ignores it, so these values are EUR whatever the user's base currency is — the result
 * says so rather than letting the figures pass for the base currency.
 */
export const PERFORMANCE_HISTORY_CURRENCY = 'EUR';

const performancePointSchema = z
  .object({
    date: z.string(),
    portfolioValue: preciseAmountSchema,
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
  config: PerformanceHistoryToolConfig,
): EnforceBudgetResult<PerformanceHistoryToolPayload> {
  const { sampled, omittedCount } = downsampleSeries(points, MAX_POINTS);

  const payload: PerformanceHistoryToolPayload = {
    currency: PERFORMANCE_HISTORY_CURRENCY,
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
      "Portfolio value over time, downsampled. Values are in the result's own `currency`, which is not necessarily the user's base currency. Read-only.",
    inputSchema: performanceHistoryToolInputSchema,
    outputSchema: performanceHistoryToolOutputSchema,
    execute: async (inputData) => {
      const points = await useCase.execute(inputData.days);
      return buildPerformanceHistoryToolResult(points, config);
    },
  });
}
