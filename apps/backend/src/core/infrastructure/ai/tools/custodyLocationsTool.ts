import { z } from 'zod';
import { createTool } from '@mastra/core/tools';
import type { CustodySummary } from '@kryptofolio/core-domain';
import { preciseAmountSchema, upperCasedSymbolSchema } from '@kryptofolio/shared-types';
import type { GetLotCustodyLocationsUseCase } from '../../../application/use-cases/GetLotCustodyLocationsUseCase.js';
import { enforceBudget, type EnforceBudgetResult, type RunBudgetTracker } from './enforceBudget.js';

export const custodyLocationsToolInputSchema = z.object({ symbol: upperCasedSymbolSchema.optional() }).strict();

const custodyLocationsPayloadSchema = z
  .object({
    locations: z.array(
      z
        .object({
          symbol: z.string(),
          accountName: z.string(),
          quantity: preciseAmountSchema,
          lotCount: z.number().int().nonnegative(),
        })
        .strict(),
    ),
    omittedCount: z.number().int().nonnegative(),
    syntheticRowCount: z.number().int().nonnegative(),
  })
  .strict();

export const custodyLocationsToolOutputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('ok'), payload: custodyLocationsPayloadSchema }).strict(),
  z
    .object({
      kind: z.literal('truncated'),
      maxChars: z.number().int().positive(),
      actualChars: z.number().int().positive(),
    })
    .strict(),
]);

export type CustodyLocationsToolPayload = z.infer<typeof custodyLocationsPayloadSchema>;

export interface CustodyLocationsToolConfig {
  topNHoldings: number;
  maxChars: number;
  runBudgetTracker?: RunBudgetTracker;
}

export function buildCustodyLocationsToolResult(
  summary: CustodySummary,
  config: CustodyLocationsToolConfig,
): EnforceBudgetResult<CustodyLocationsToolPayload> {
  const payload: CustodyLocationsToolPayload = {
    locations: summary.holdings.slice(0, config.topNHoldings),
    omittedCount: Math.max(summary.holdings.length - config.topNHoldings, 0),
    syntheticRowCount: summary.syntheticRowCount,
  };
  return enforceBudget(payload, config.maxChars, config.runBudgetTracker);
}

export type CustodyLocationsUseCaseLike = Pick<GetLotCustodyLocationsUseCase, 'execute'>;

export function custodyLocationsTool(useCase: CustodyLocationsUseCaseLike, config: CustodyLocationsToolConfig) {
  return createTool({
    id: 'custody_locations',
    description:
      "Where the user's assets are held right now: the quantity of each asset in each account or wallet, optionally for one symbol. This is the custody ledger only. Custody location has no effect on taxation, which is computed per asset across all accounts; use spanish_tax_report for tax figures. Read-only.",
    inputSchema: custodyLocationsToolInputSchema,
    outputSchema: custodyLocationsToolOutputSchema,
    execute: async (inputData) => {
      const summary = await useCase.execute(inputData.symbol === undefined ? {} : { symbol: inputData.symbol });
      return buildCustodyLocationsToolResult(summary, config);
    },
  });
}
