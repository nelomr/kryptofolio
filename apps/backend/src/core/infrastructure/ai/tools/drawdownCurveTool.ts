import { z } from 'zod';
import { createTool } from '@mastra/core/tools';
import { downsampleSeries } from '@kryptofolio/core-domain';
import type { DrawdownPoint } from '../../../domain/ports/IMetricsPort.js';
import type { GetDrawdownCurveUseCase } from '../../../application/use-cases/GetDrawdownCurveUseCase.js';
import { enforceBudget, type EnforceBudgetResult, type RunBudgetTracker } from './enforceBudget.js';

/** The fixed downsample cap for every time-series tool in this catalogue. */
const MAX_POINTS = 120;

const drawdownPointSchema = z
  .object({
    date: z.string(),
    drawdownPct: z.string(),
  })
  .strict();

const drawdownCurvePayloadSchema = z
  .object({
    points: z.array(drawdownPointSchema),
    omittedCount: z.number().int().nonnegative(),
  })
  .strict();

export const drawdownCurveToolOutputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('ok'), payload: drawdownCurvePayloadSchema }).strict(),
  z
    .object({
      kind: z.literal('truncated'),
      maxChars: z.number().int().positive(),
      actualChars: z.number().int().positive(),
    })
    .strict(),
]);

export type DrawdownCurveToolPayload = z.infer<typeof drawdownCurvePayloadSchema>;

export const drawdownCurveToolInputSchema = z.object({ days: z.number().int().positive().max(3650).optional() }).strict();

export interface DrawdownCurveToolConfig {
  maxChars: number;
  /** The run-wide cap tracker — one instance per advisor run, `undefined` for a metered run. */
  runBudgetTracker?: RunBudgetTracker;
}

/** Pure projection + budget gate. Downsampled via `downsampleSeries`, never via `.filter`/re-sort. */
export function buildDrawdownCurveToolResult(
  points: readonly DrawdownPoint[],
  config: DrawdownCurveToolConfig,
): EnforceBudgetResult<DrawdownCurveToolPayload> {
  const { sampled, omittedCount } = downsampleSeries(points, MAX_POINTS);

  const payload: DrawdownCurveToolPayload = {
    points: sampled.map((point) => ({ date: point.date, drawdownPct: point.drawdownPct })),
    omittedCount,
  };

  return enforceBudget(payload, config.maxChars, config.runBudgetTracker);
}

/** Structural, not the concrete class: the tool only ever calls `execute`. */
export type DrawdownCurveUseCaseLike = Pick<GetDrawdownCurveUseCase, 'execute'>;

/** Constructor takes only the wrapped use case plus pure configuration. */
export function drawdownCurveTool(useCase: DrawdownCurveUseCaseLike, config: DrawdownCurveToolConfig) {
  return createTool({
    id: 'drawdown_curve',
    description: 'Portfolio drawdown percentages over time, downsampled. Percentages carry no currency. Read-only.',
    inputSchema: drawdownCurveToolInputSchema,
    outputSchema: drawdownCurveToolOutputSchema,
    execute: async (inputData) => {
      const points = await useCase.execute(inputData.days);
      return buildDrawdownCurveToolResult(points, config);
    },
  });
}
