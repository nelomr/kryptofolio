import { z } from 'zod';
import { createTool } from '@mastra/core/tools';
import { orderByIsoDateDescending } from '@kryptofolio/core-domain';
import { preciseAmountSchema, SYMBOL_REGEX } from '@kryptofolio/shared-types';
import type {
  GetTokenHistoryResponse,
  GetTokenHistoryUseCase,
  TokenLotDto,
} from '../../../application/use-cases/GetTokenHistoryUseCase.js';
import { enforceBudget, type EnforceBudgetResult, type RunBudgetTracker } from './enforceBudget.js';

export const tokenHistoryToolInputSchema = z
  .object({
    symbol: z.string().regex(SYMBOL_REGEX),
  })
  .strict();

const lotSummarySchema = z
  .object({
    id: z.string(),
    symbol: z.string(),
    date: z.string(),
    exchange: z.string(),
    originalQty: preciseAmountSchema,
    remainingQty: preciseAmountSchema,
    unitCost: preciseAmountSchema,
    totalCost: preciseAmountSchema,
    status: z.string(),
    historyCount: z.number().int().nonnegative(),
    relocationCount: z.number().int().nonnegative(),
  })
  .strict();

const tokenHistoryPayloadSchema = z
  .object({
    lots: z.array(lotSummarySchema),
    omittedCount: z.number().int().nonnegative(),
  })
  .strict();

export const tokenHistoryToolOutputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('ok'), payload: tokenHistoryPayloadSchema }).strict(),
  z
    .object({
      kind: z.literal('truncated'),
      maxChars: z.number().int().positive(),
      actualChars: z.number().int().positive(),
    })
    .strict(),
]);

export type TokenHistoryToolPayload = z.infer<typeof tokenHistoryPayloadSchema>;

function toLotSummary(
  lot: TokenLotDto,
  historyCount: number,
  relocationCount: number,
): TokenHistoryToolPayload['lots'][number] {
  return {
    id: lot.id,
    symbol: lot.symbol,
    date: lot.date,
    exchange: lot.exchange,
    originalQty: lot.original_qty,
    remainingQty: lot.remaining_qty,
    unitCost: lot.unit_cost,
    totalCost: lot.total_cost,
    status: lot.status,
    historyCount,
    relocationCount,
  };
}

export interface TokenHistoryToolConfig {
  /** From the resolved execution profile's `lotsPageSize` — 20 metered, 100 local by default. */
  lotsPageSize: number;
  maxChars: number;
  /** The run-wide cap tracker — one instance per advisor run, `undefined` for a metered run. */
  runBudgetTracker?: RunBudgetTracker;
}

/**
 * Pure projection + budget gate. Lots are ordered by acquisition date descending, capped at
 * `lotsPageSize`; each lot carries only event *counts*, never the events or relocations themselves
 * — those are reachable, paginated, through `token_lots` and are out of this tool's scope.
 */
export function buildTokenHistoryToolResult(
  response: GetTokenHistoryResponse,
  config: TokenHistoryToolConfig,
): EnforceBudgetResult<TokenHistoryToolPayload> {
  const orderedLots = orderByIsoDateDescending(response.lots, (lot) => lot.date);
  const topLots = orderedLots.slice(0, config.lotsPageSize);

  const payload: TokenHistoryToolPayload = {
    lots: topLots.map((lot) =>
      toLotSummary(lot, response.history[lot.id]?.length ?? 0, response.relocations[lot.id]?.length ?? 0),
    ),
    omittedCount: Math.max(0, orderedLots.length - topLots.length),
  };

  return enforceBudget(payload, config.maxChars, config.runBudgetTracker);
}

/**
 * Constructor takes only the wrapped use case plus pure configuration.
 */
/** Structural, not the concrete class: the tool only ever calls `execute`. */
export type TokenHistoryUseCaseLike = Pick<GetTokenHistoryUseCase, 'execute'>;

export function tokenHistoryTool(useCase: TokenHistoryUseCaseLike, config: TokenHistoryToolConfig) {
  return createTool({
    id: 'token_history',
    description:
      'Lot-level summary for one asset symbol across all of the user\'s accounts: acquisition lots and counts of history/relocation events. Read-only; returns no individual event.',
    inputSchema: tokenHistoryToolInputSchema,
    outputSchema: tokenHistoryToolOutputSchema,
    execute: async (inputData) => {
      const response = await useCase.execute({ symbol: inputData.symbol });
      return buildTokenHistoryToolResult(response, config);
    },
  });
}
