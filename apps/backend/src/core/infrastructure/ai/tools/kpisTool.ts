import { z } from 'zod';
import { createTool } from '@mastra/core/tools';
import { preciseAmountSchema } from '@kryptofolio/shared-types';
import { advisorRequestContextSchema } from '../advisorRequestContext.js';
import type { AssetKpiSummary, MetricsKpis } from '../../../domain/ports/IMetricsPort.js';
import type { GetKpisUseCase } from '../../../application/use-cases/GetKpisUseCase.js';
import { enforceBudget, type EnforceBudgetResult, type RunBudgetTracker } from './enforceBudget.js';

const assetKpiSummarySchema = z
  .object({
    symbol: z.string(),
    name: z.string(),
    allocationPct: z.number(),
    roiPct: z.number(),
  })
  .strict();

const kpisPayloadSchema = z
  .object({
    ratesIncomplete: z.boolean(),
    pricesIncomplete: z.boolean(),
    totalEquity: preciseAmountSchema,
    totalCostBasis: preciseAmountSchema,
    totalUnrealizedPnl: preciseAmountSchema,
    totalRealizedPnl: preciseAmountSchema,
    allTimeHigh: preciseAmountSchema,
    maxDrawdownPct: z.string(),
    annualizedVolatility: z.string(),
    sharpeRatio: z.string(),
    currency: z.string(),
    delta24hFiat: preciseAmountSchema.optional(),
    maxDrawdownFiat: preciseAmountSchema.optional(),
    recoveredFiat: preciseAmountSchema.optional(),
    winRatePercent: z.number().optional(),
    totalTrades: z.number().int().nonnegative().optional(),
    winningTrades: z.number().int().nonnegative().optional(),
    losingTrades: z.number().int().nonnegative().optional(),
    averageR: z.number().optional(),
    bestAsset: assetKpiSummarySchema.nullable().optional(),
    worstAsset: assetKpiSummarySchema.nullable().optional(),
    totalRoiPercent: z.number().optional(),
    totalRoiFiat: preciseAmountSchema.optional(),
    excludedFlaggedLots: z.number().int().nonnegative().optional(),
  })
  .strict();

export const kpisToolOutputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('ok'), payload: kpisPayloadSchema }).strict(),
  z
    .object({
      kind: z.literal('truncated'),
      maxChars: z.number().int().positive(),
      actualChars: z.number().int().positive(),
    })
    .strict(),
]);

export type KpisToolPayload = z.infer<typeof kpisPayloadSchema>;

function toAssetSummary(summary: AssetKpiSummary): AssetKpiSummary {
  return {
    symbol: summary.symbol,
    name: summary.name,
    allocationPct: summary.allocationPct,
    roiPct: summary.roiPct,
  };
}

export interface KpisToolConfig {
  maxChars: number;
  /** The run-wide cap tracker — one instance per advisor run, `undefined` for a metered run. */
  runBudgetTracker?: RunBudgetTracker;
}

/** Pure projection + budget gate. The fixed-shape response, no ranking or capping involved. */
export function buildKpisToolResult(
  kpis: MetricsKpis,
  config: KpisToolConfig,
): EnforceBudgetResult<KpisToolPayload> {
  const payload: KpisToolPayload = {
    ratesIncomplete: kpis.ratesIncomplete,
    pricesIncomplete: kpis.pricesIncomplete,
    totalEquity: kpis.totalEquity,
    totalCostBasis: kpis.totalCostBasis,
    totalUnrealizedPnl: kpis.totalUnrealizedPnl,
    totalRealizedPnl: kpis.totalRealizedPnl,
    allTimeHigh: kpis.allTimeHigh,
    maxDrawdownPct: kpis.maxDrawdownPct,
    annualizedVolatility: kpis.annualizedVolatility,
    sharpeRatio: kpis.sharpeRatio,
    currency: kpis.currency,
    delta24hFiat: kpis.delta24hFiat,
    maxDrawdownFiat: kpis.maxDrawdownFiat,
    recoveredFiat: kpis.recoveredFiat,
    winRatePercent: kpis.winRatePercent,
    totalTrades: kpis.totalTrades,
    winningTrades: kpis.winningTrades,
    losingTrades: kpis.losingTrades,
    averageR: kpis.averageR,
    bestAsset: kpis.bestAsset ? toAssetSummary(kpis.bestAsset) : kpis.bestAsset,
    worstAsset: kpis.worstAsset ? toAssetSummary(kpis.worstAsset) : kpis.worstAsset,
    totalRoiPercent: kpis.totalRoiPercent,
    totalRoiFiat: kpis.totalRoiFiat,
    excludedFlaggedLots: kpis.excludedFlaggedLots,
  };

  return enforceBudget(payload, config.maxChars, config.runBudgetTracker);
}

/** Structural, not the concrete class: the tool only ever calls `execute`. */
export type KpisUseCaseLike = Pick<GetKpisUseCase, 'execute'>;

/** Constructor takes only the wrapped use case plus pure configuration. */
export function kpisTool(useCase: KpisUseCaseLike, config: KpisToolConfig) {
  return createTool({
    id: 'kpis',
    description: 'Headline portfolio KPIs: equity, PnL, drawdown, best/worst asset, ROI, valued at the last daily close with flagged lots excluded. May differ from `portfolio_summary` by design, which values holdings at the live snapshot price. Read-only.',
    inputSchema: z.object({}).strict(),
    outputSchema: kpisToolOutputSchema,
    requestContextSchema: advisorRequestContextSchema,
    execute: async (_inputData, { requestContext }) => {
      const kpis = await useCase.execute(requestContext.get('baseCurrency'));
      return buildKpisToolResult(kpis, config);
    },
  });
}
