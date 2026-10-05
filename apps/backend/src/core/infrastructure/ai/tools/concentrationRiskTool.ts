import { z } from 'zod';
import { createTool } from '@mastra/core/tools';
import { preciseAmountSchema } from '@kryptofolio/shared-types';
import { advisorRequestContextSchema } from '../advisorRequestContext.js';
import { enforceBudget, type RunBudgetTracker } from './enforceBudget.js';
import type { PortfolioScenarioUseCaseLike } from './scenarioUseCase.js';

export const concentrationRiskToolInputSchema = z.object({}).strict();

const blockSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('computed'),
      top1Weight: preciseAmountSchema,
      top3Weight: preciseAmountSchema,
      hhi: preciseAmountSchema,
      effectiveHoldings: preciseAmountSchema,
    })
    .strict(),
  z.object({ kind: z.literal('empty') }).strict(),
]);

const payloadSchema = z
  .object({
    all: blockSchema,
    excludingStablecoins: blockSchema,
    stablecoinWeight: preciseAmountSchema.nullable(),
    unvaluedCount: z.number().int().nonnegative(),
    currency: z.string(),
  })
  .strict();

export const concentrationRiskToolOutputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('ok'), payload: payloadSchema }).strict(),
  z
    .object({
      kind: z.literal('truncated'),
      maxChars: z.number().int().positive(),
      actualChars: z.number().int().positive(),
    })
    .strict(),
]);

export interface ConcentrationRiskToolConfig {
  maxChars: number;
  runBudgetTracker?: RunBudgetTracker;
  livePrices?: (currency: string) => Promise<Map<string, string>>;
}

export function concentrationRiskTool(
  useCase: Pick<PortfolioScenarioUseCaseLike, 'concentration'>,
  config: ConcentrationRiskToolConfig,
) {
  return createTool({
    id: 'concentration_risk',
    description:
      "How concentrated the valued portfolio is: the weight of the largest holding and of the three largest, the Herfindahl-Hirschman index (zero to one) and the effective number of holdings, computed twice, once with stablecoins and once without them, plus the stablecoin share. Holdings without a value are counted apart, never weighted. Read-only.",
    inputSchema: concentrationRiskToolInputSchema,
    outputSchema: concentrationRiskToolOutputSchema,
    requestContextSchema: advisorRequestContextSchema,
    execute: async (_inputData, { requestContext }) => {
      const targetCurrency = requestContext.get('baseCurrency');
      const outcome = await useCase.concentration({
        targetCurrency,
        livePrices: await config.livePrices?.(targetCurrency),
      });
      return enforceBudget(outcome, config.maxChars, config.runBudgetTracker);
    },
  });
}
