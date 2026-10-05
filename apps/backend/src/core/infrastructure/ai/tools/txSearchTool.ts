import { z } from 'zod';
import { createTool } from '@mastra/core/tools';
import { SPOT_TX_TYPES, preciseAmountSchema, txSearchInputSchema } from '@kryptofolio/shared-types';
import {
  toAdvisorSpotRow,
  type SearchSpotTransactionsResult,
  type SearchSpotTransactionsUseCase,
} from '../../../application/use-cases/SearchSpotTransactionsUseCase.js';
import { enforceBudget, type EnforceBudgetResult, type RunBudgetTracker } from './enforceBudget.js';

const feeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('NONE') }).strict(),
  z.object({ kind: z.literal('CHARGED'), amount: preciseAmountSchema, assetId: z.string().optional() }).strict(),
]);

const rowSchema = z
  .object({
    date: z.string(),
    type: z.enum(SPOT_TX_TYPES),
    assetIn: z.string().optional(),
    amountIn: preciseAmountSchema.optional(),
    assetOut: z.string().optional(),
    amountOut: preciseAmountSchema.optional(),
    priceFiat: preciseAmountSchema.nullable(),
    totalFiat: preciseAmountSchema.nullable(),
    fiatCurrency: z.string(),
    fee: feeSchema,
    exchange: z.string().optional(),
    edited: z.boolean(),
  })
  .strict();

const txSearchPayloadSchema = z
  .object({
    rows: z.array(rowSchema),
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    totalPages: z.number().int().nonnegative(),
    totalCount: z.number().int().nonnegative(),
  })
  .strict();

export const txSearchToolOutputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('ok'), payload: txSearchPayloadSchema }).strict(),
  z
    .object({
      kind: z.literal('truncated'),
      maxChars: z.number().int().positive(),
      actualChars: z.number().int().positive(),
    })
    .strict(),
]);

export type TxSearchToolPayload = z.infer<typeof txSearchPayloadSchema>;

export interface TxSearchToolConfig {
  /** From the resolved execution profile's `rowsPageSize` — 25 metered, 100 local by default. */
  rowsPageSize: number;
  maxChars: number;
  runBudgetTracker?: RunBudgetTracker;
}

export function buildTxSearchToolResult(
  result: Extract<SearchSpotTransactionsResult, { kind: 'page' }>,
  config: TxSearchToolConfig,
): EnforceBudgetResult<TxSearchToolPayload> {
  const payload: TxSearchToolPayload = {
    rows: result.rows.map(toAdvisorSpotRow),
    page: result.page,
    pageSize: result.pageSize,
    totalPages: result.totalPages,
    totalCount: result.totalCount,
  };
  return enforceBudget(payload, config.maxChars, config.runBudgetTracker);
}

export type TxSearchUseCaseLike = Pick<SearchSpotTransactionsUseCase, 'execute'>;

export function txSearchTool(useCase: TxSearchUseCaseLike, config: TxSearchToolConfig) {
  return createTool({
    id: 'tx_search',
    description:
      "Searches the user's spot transactions across all accounts, newest first, one page at a time. Filters are optional: a symbol (either side of the trade), an inclusive date range, and transaction types. Dates and types are searched as the user last edited them, and each row says whether it was edited. If the result is too large it is cut off, so narrow the filters (a shorter date range or one type) and try again; the totals tell you how many pages exist. Read-only.",
    inputSchema: txSearchInputSchema,
    outputSchema: txSearchToolOutputSchema,
    execute: async (inputData) => {
      const result = await useCase.execute({
        ...(inputData.symbol === undefined ? {} : { symbol: inputData.symbol }),
        ...(inputData.from === undefined ? {} : { from: inputData.from }),
        ...(inputData.to === undefined ? {} : { to: inputData.to }),
        ...(inputData.types === undefined ? {} : { types: inputData.types }),
        paging: { kind: 'page', page: inputData.page, pageSize: config.rowsPageSize },
      });
      if (result.kind !== 'page') throw new Error('tx_search requested a page and received the whole set');
      return buildTxSearchToolResult(result, config);
    },
  });
}
