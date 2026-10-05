import { z } from 'zod';
import { createTool } from '@mastra/core/tools';
import { upperCasedSymbolSchema } from '@kryptofolio/shared-types';
import type {
  GetPortfolioSummaryUseCase,
  PortfolioSummaryResponse,
} from '../../../application/use-cases/GetPortfolioSummaryUseCase.js';
import { advisorRequestContextSchema } from '../advisorRequestContext.js';
import {
  rankedHoldingSchema,
  resolvedValueOf,
  toRankedSummary,
  toUnvaluedSummary,
  unvaluedHoldingSchema,
} from './portfolioSummaryTool.js';
import { enforceBudget, type EnforceBudgetResult, type RunBudgetTracker } from './enforceBudget.js';

/** The symbol is the only input: the scope is every account and the currency comes from request context. */
export const holdingDetailToolInputSchema = z.object({ symbol: upperCasedSymbolSchema }).strict();

const holdingDetailPayloadSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('valued'), holding: rankedHoldingSchema }).strict(),
  z.object({ kind: z.literal('unvalued'), holding: unvaluedHoldingSchema }).strict(),
  z.object({ kind: z.literal('not_held'), symbol: z.string() }).strict(),
]);

export const holdingDetailToolOutputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('ok'), payload: holdingDetailPayloadSchema }).strict(),
  z
    .object({
      kind: z.literal('truncated'),
      maxChars: z.number().int().positive(),
      actualChars: z.number().int().positive(),
    })
    .strict(),
]);

export type HoldingDetailToolPayload = z.infer<typeof holdingDetailPayloadSchema>;

export interface HoldingDetailToolConfig {
  maxChars: number;
  runBudgetTracker?: RunBudgetTracker;
  /** Resolved at call time for the run's base currency by the composing factory, never from model input. */
  livePrices?: (currency: string) => Promise<Map<string, string>>;
}

/** Selects one holding from the uncapped summary, so a position outside the `portfolio_summary` top-N is still found. */
export function buildHoldingDetailToolResult(
  response: PortfolioSummaryResponse,
  symbol: string,
  config: HoldingDetailToolConfig,
): EnforceBudgetResult<HoldingDetailToolPayload> {
  const holding = response.holdings.find((candidate) => candidate.symbol === symbol);

  let payload: HoldingDetailToolPayload;
  if (holding === undefined) {
    payload = { kind: 'not_held', symbol };
  } else {
    const value = resolvedValueOf(holding);
    payload =
      value === undefined
        ? { kind: 'unvalued', holding: toUnvaluedSummary(holding) }
        : { kind: 'valued', holding: toRankedSummary(holding, value) };
  }

  return enforceBudget(payload, config.maxChars, config.runBudgetTracker);
}

export type HoldingDetailUseCaseLike = Pick<GetPortfolioSummaryUseCase, 'execute'>;

export function holdingDetailTool(useCase: HoldingDetailUseCaseLike, config: HoldingDetailToolConfig) {
  return createTool({
    id: 'holding_detail',
    description:
      "One holding by symbol across all of the user's accounts, found even when it ranks outside the portfolio_summary top holdings. Returns its quantity, cost basis and, when a price is available, its current value; a held asset with no resolvable value is returned as unvalued with quantity and cost basis only, and a symbol the user does not hold is reported as not held. Read-only.",
    inputSchema: holdingDetailToolInputSchema,
    outputSchema: holdingDetailToolOutputSchema,
    requestContextSchema: advisorRequestContextSchema,
    execute: async (inputData, { requestContext }) => {
      const targetCurrency = requestContext.get('baseCurrency');
      const response = await useCase.execute({
        targetCurrency,
        livePrices: await config.livePrices?.(targetCurrency),
      });
      return buildHoldingDetailToolResult(response, inputData.symbol, config);
    },
  });
}
