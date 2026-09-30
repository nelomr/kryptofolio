import { z } from 'zod';
import { createTool } from '@mastra/core/tools';
import { preciseAmountSchema } from '@kryptofolio/shared-types';
import { rankHoldingsByValue } from '@kryptofolio/core-domain';
import { advisorRequestContextSchema } from '../advisorRequestContext.js';
import type { AssetAllocationItem } from '../../../domain/ports/IMetricsPort.js';
import type { GetAssetAllocationUseCase } from '../../../application/use-cases/GetAssetAllocationUseCase.js';
import { enforceBudget, type EnforceBudgetResult, type RunBudgetTracker } from './enforceBudget.js';

const valuedAllocationSchema = z
  .object({
    kind: z.literal('valued'),
    assetId: z.string(),
    symbol: z.string(),
    color: z.string().optional(),
    amount: preciseAmountSchema,
    allocationPct: z.string(),
    valueFiat: preciseAmountSchema,
    currency: z.string(),
  })
  .strict();

const unvaluedAllocationSchema = z
  .object({
    kind: z.literal('unvalued'),
    assetId: z.string(),
    symbol: z.string(),
    amount: preciseAmountSchema,
  })
  .strict();

const assetAllocationPayloadSchema = z
  .object({
    ranked: z.array(valuedAllocationSchema),
    omittedCount: z.number().int().nonnegative(),
    unvalued: z.array(unvaluedAllocationSchema),
  })
  .strict();

export const assetAllocationToolOutputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('ok'), payload: assetAllocationPayloadSchema }).strict(),
  z
    .object({
      kind: z.literal('truncated'),
      maxChars: z.number().int().positive(),
      actualChars: z.number().int().positive(),
    })
    .strict(),
]);

export type AssetAllocationToolPayload = z.infer<typeof assetAllocationPayloadSchema>;

export const assetAllocationToolInputSchema = z.object({}).strict();

type ValuedItem = Extract<AssetAllocationItem, { kind: 'valued' }>;
type UnvaluedItem = Extract<AssetAllocationItem, { kind: 'unvalued' }>;

const isValued = (item: AssetAllocationItem): item is ValuedItem => item.kind === 'valued';
const isUnvalued = (item: AssetAllocationItem): item is UnvaluedItem => item.kind === 'unvalued';

function toValuedSummary(item: ValuedItem): AssetAllocationToolPayload['ranked'][number] {
  return {
    kind: 'valued',
    assetId: item.assetId,
    symbol: item.symbol,
    color: item.color,
    amount: item.amount,
    allocationPct: item.allocationPct,
    valueFiat: item.valueFiat,
    currency: item.currency,
  };
}

function toUnvaluedSummary(item: UnvaluedItem): AssetAllocationToolPayload['unvalued'][number] {
  return { kind: 'unvalued', assetId: item.assetId, symbol: item.symbol, amount: item.amount };
}

export interface AssetAllocationToolConfig {
  /** From the resolved execution profile's `topNHoldings` — 15 metered, 50 local by default. */
  topNHoldings: number;
  maxChars: number;
  /** The run-wide cap tracker — one instance per advisor run, `undefined` for a metered run. */
  runBudgetTracker?: RunBudgetTracker;
}

/**
 * Pure projection + budget gate. Ranking goes through `rankHoldingsByValue` only, on `valueFiat` —
 * this file orders nothing itself and compares no monetary value. A holding with no computable
 * value reaches the ranking as `undefined` and lands in its `unvalued` bucket.
 */
export function buildAssetAllocationToolResult(
  items: readonly AssetAllocationItem[],
  config: AssetAllocationToolConfig,
): EnforceBudgetResult<AssetAllocationToolPayload> {
  const { ranked, omittedCount, unvalued } = rankHoldingsByValue(
    items,
    (item) => (item.kind === 'valued' ? item.valueFiat : undefined),
    config.topNHoldings,
  );

  const payload: AssetAllocationToolPayload = {
    ranked: ranked.filter(isValued).map(toValuedSummary),
    omittedCount,
    unvalued: unvalued.filter(isUnvalued).map(toUnvaluedSummary),
  };

  return enforceBudget(payload, config.maxChars, config.runBudgetTracker);
}

/** Structural, not the concrete class: the tool only ever calls `execute`. */
export type AssetAllocationUseCaseLike = Pick<GetAssetAllocationUseCase, 'execute'>;

/** Constructor takes only the wrapped use case plus pure configuration. */
export function assetAllocationTool(
  useCase: AssetAllocationUseCaseLike,
  config: AssetAllocationToolConfig,
) {
  return createTool({
    id: 'asset_allocation',
    description:
      'Current portfolio allocation by asset across all of the user\'s accounts, ranked by value: quantity held (amount), value and percentage share in the base currency. Holdings whose value cannot be computed (no price or no exchange rate) are listed separately as unvalued, with their quantity only. Read-only; returns no more than the top holdings.',
    inputSchema: assetAllocationToolInputSchema,
    outputSchema: assetAllocationToolOutputSchema,
    requestContextSchema: advisorRequestContextSchema,
    execute: async (_inputData, { requestContext }) => {
      const items = await useCase.execute(requestContext.get('baseCurrency'));
      return buildAssetAllocationToolResult(items, config);
    },
  });
}
