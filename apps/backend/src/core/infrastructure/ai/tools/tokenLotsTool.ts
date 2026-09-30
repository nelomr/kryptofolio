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

export const tokenLotsToolInputSchema = z
  .object({
    symbol: z.string().regex(SYMBOL_REGEX),
    page: z.number().int().nonnegative().default(0),
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

const tokenLotsPayloadSchema = z
  .object({
    lots: z.array(lotSummarySchema),
    page: z.number().int().nonnegative(),
    pageSize: z.number().int().positive(),
    totalPages: z.number().int().nonnegative(),
    totalCount: z.number().int().nonnegative(),
  })
  .strict();

export const tokenLotsToolOutputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('ok'), payload: tokenLotsPayloadSchema }).strict(),
  z
    .object({
      kind: z.literal('truncated'),
      maxChars: z.number().int().positive(),
      actualChars: z.number().int().positive(),
    })
    .strict(),
]);

export type TokenLotsToolPayload = z.infer<typeof tokenLotsPayloadSchema>;

function toLotSummary(
  lot: TokenLotDto,
  historyCount: number,
  relocationCount: number,
): TokenLotsToolPayload['lots'][number] {
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

export interface TokenLotsToolConfig {
  /** From the resolved execution profile's `lotsPageSize` — 20 metered, 100 local by default. */
  lotsPageSize: number;
  maxChars: number;
  /** The run-wide cap tracker — one instance per advisor run, `undefined` for a metered run. */
  runBudgetTracker?: RunBudgetTracker;
}

/**
 * Pure projection + budget gate. Reads the use case's full lot list, paginated at `lotsPageSize`, so
 * lots beyond the first page that `token_history` returns are reachable.
 */
export function buildTokenLotsToolResult(
  response: GetTokenHistoryResponse,
  page: number,
  config: TokenLotsToolConfig,
): EnforceBudgetResult<TokenLotsToolPayload> {
  const orderedLots = orderByIsoDateDescending(response.lots, (lot) => lot.date);
  const totalCount = orderedLots.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / config.lotsPageSize));
  const start = page * config.lotsPageSize;
  const pageLots = orderedLots.slice(start, start + config.lotsPageSize);

  const payload: TokenLotsToolPayload = {
    lots: pageLots.map((lot) =>
      toLotSummary(lot, response.history[lot.id]?.length ?? 0, response.relocations[lot.id]?.length ?? 0),
    ),
    page,
    pageSize: config.lotsPageSize,
    totalPages,
    totalCount,
  };

  return enforceBudget(payload, config.maxChars, config.runBudgetTracker);
}

/** Structural, not the concrete class: the tool only ever calls `execute`. */
export type TokenLotsUseCaseLike = Pick<GetTokenHistoryUseCase, 'execute'>;

/** Constructor takes only the wrapped use case plus pure configuration. */
export function tokenLotsTool(useCase: TokenLotsUseCaseLike, config: TokenLotsToolConfig) {
  return createTool({
    id: 'token_lots',
    description:
      'The full paginated lot list for one asset symbol across all of the user\'s accounts; use it for lots beyond the first page that token_history returns. Read-only.',
    inputSchema: tokenLotsToolInputSchema,
    outputSchema: tokenLotsToolOutputSchema,
    execute: async (inputData) => {
      const response = await useCase.execute({ symbol: inputData.symbol });
      return buildTokenLotsToolResult(response, inputData.page, config);
    },
  });
}
