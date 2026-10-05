import { z } from 'zod';
import { createTool } from '@mastra/core/tools';
import { breakevenPriceInputSchema, preciseAmountSchema } from '@kryptofolio/shared-types';
import { advisorRequestContextSchema } from '../advisorRequestContext.js';
import { enforceBudget, type RunBudgetTracker } from './enforceBudget.js';
import type { PortfolioScenarioUseCaseLike } from './scenarioUseCase.js';

const payloadSchema = z.discriminatedUnion('kind', [
  z
    .object({ kind: z.literal('computed'), symbol: z.string(), avgUnitCost: preciseAmountSchema, currency: z.string() })
    .strict(),
  z.object({ kind: z.literal('not_held'), symbol: z.string(), currency: z.string() }).strict(),
  z.object({ kind: z.literal('unconvertible_cost_basis'), symbol: z.string(), currency: z.string() }).strict(),
  z.object({ kind: z.literal('zero_quantity'), symbol: z.string(), currency: z.string() }).strict(),
]);

export const breakevenPriceToolOutputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('ok'), payload: payloadSchema }).strict(),
  z
    .object({
      kind: z.literal('truncated'),
      maxChars: z.number().int().positive(),
      actualChars: z.number().int().positive(),
    })
    .strict(),
]);

export interface BreakevenPriceToolConfig {
  maxChars: number;
  runBudgetTracker?: RunBudgetTracker;
  livePrices?: (currency: string) => Promise<Map<string, string>>;
}

export function breakevenPriceTool(
  useCase: Pick<PortfolioScenarioUseCaseLike, 'breakeven'>,
  config: BreakevenPriceToolConfig,
) {
  return createTool({
    id: 'breakeven_price',
    description:
      "The average unit cost of one held asset: its cost basis divided by the quantity held, which is the price at which selling it all would neither gain nor lose before fees and taxes. The cost basis is the holdings figure, which can differ from the one in kpis. If the cost basis cannot be converted to the display currency the result says so instead of giving a number. Read-only.",
    inputSchema: breakevenPriceInputSchema,
    outputSchema: breakevenPriceToolOutputSchema,
    requestContextSchema: advisorRequestContextSchema,
    execute: async (inputData, { requestContext }) => {
      const targetCurrency = requestContext.get('baseCurrency');
      const outcome = await useCase.breakeven({
        targetCurrency,
        livePrices: await config.livePrices?.(targetCurrency),
        symbol: inputData.symbol,
      });
      return enforceBudget(outcome, config.maxChars, config.runBudgetTracker);
    },
  });
}
