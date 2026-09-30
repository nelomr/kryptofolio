import { z } from 'zod';
import { createTool } from '@mastra/core/tools';
import { downsampleSeries } from '@kryptofolio/core-domain';
import type { VolatilityHeatmapCell } from '../../../domain/ports/IMetricsPort.js';
import type { GetVolatilityHeatmapUseCase } from '../../../application/use-cases/GetVolatilityHeatmapUseCase.js';
import { enforceBudget, type EnforceBudgetResult, type RunBudgetTracker } from './enforceBudget.js';

/** The fixed downsample cap for every time-series tool in this catalogue. */
const MAX_POINTS = 120;

const heatmapCellSchema = z
  .object({
    date: z.string(),
    volatility: z.string(),
  })
  .strict();

const volatilityHeatmapPayloadSchema = z
  .object({
    cells: z.array(heatmapCellSchema),
    omittedCount: z.number().int().nonnegative(),
  })
  .strict();

export const volatilityHeatmapToolOutputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('ok'), payload: volatilityHeatmapPayloadSchema }).strict(),
  z
    .object({
      kind: z.literal('truncated'),
      maxChars: z.number().int().positive(),
      actualChars: z.number().int().positive(),
    })
    .strict(),
]);

export type VolatilityHeatmapToolPayload = z.infer<typeof volatilityHeatmapPayloadSchema>;

export const volatilityHeatmapToolInputSchema = z.object({ year: z.number().int().optional() }).strict();

export interface VolatilityHeatmapToolConfig {
  maxChars: number;
  /** The run-wide cap tracker — one instance per advisor run, `undefined` for a metered run. */
  runBudgetTracker?: RunBudgetTracker;
}

/** Pure projection + budget gate. Downsampled via `downsampleSeries`, never via `.filter`/re-sort. */
export function buildVolatilityHeatmapToolResult(
  cells: readonly VolatilityHeatmapCell[],
  config: VolatilityHeatmapToolConfig,
): EnforceBudgetResult<VolatilityHeatmapToolPayload> {
  const { sampled, omittedCount } = downsampleSeries(cells, MAX_POINTS);

  const payload: VolatilityHeatmapToolPayload = {
    cells: sampled.map((cell) => ({ date: cell.date, volatility: cell.volatility })),
    omittedCount,
  };

  return enforceBudget(payload, config.maxChars, config.runBudgetTracker);
}

/** Structural, not the concrete class: the tool only ever calls `execute`. */
export type VolatilityHeatmapUseCaseLike = Pick<GetVolatilityHeatmapUseCase, 'execute'>;

/** Constructor takes only the wrapped use case plus pure configuration. */
export function volatilityHeatmapTool(
  useCase: VolatilityHeatmapUseCaseLike,
  config: VolatilityHeatmapToolConfig,
) {
  return createTool({
    id: 'volatility_heatmap',
    description: 'Per-day volatility statistic across a year, downsampled. Not a monetary figure. Read-only.',
    inputSchema: volatilityHeatmapToolInputSchema,
    outputSchema: volatilityHeatmapToolOutputSchema,
    execute: async (inputData) => {
      const cells = await useCase.execute(inputData.year);
      return buildVolatilityHeatmapToolResult(cells, config);
    },
  });
}
