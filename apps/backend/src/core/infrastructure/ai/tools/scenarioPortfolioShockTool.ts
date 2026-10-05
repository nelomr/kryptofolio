import { z } from 'zod';
import { createTool } from '@mastra/core/tools';
import { portfolioShockInputSchema, preciseAmountSchema } from '@kryptofolio/shared-types';
import { advisorRequestContextSchema } from '../advisorRequestContext.js';
import { enforceBudget, type EnforceBudgetResult, type RunBudgetTracker } from './enforceBudget.js';
import type { PortfolioScenarioUseCaseLike } from './scenarioUseCase.js';

const payloadSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('computed'),
      assets: z.array(
        z.object({ symbol: z.string(), before: preciseAmountSchema, after: preciseAmountSchema }).strict(),
      ),
      omittedCount: z.number().int().nonnegative(),
      totalBefore: preciseAmountSchema,
      totalAfter: preciseAmountSchema,
      delta: preciseAmountSchema,
      unvaluedSymbols: z.array(z.string()),
      notHeld: z.array(z.string()),
      currency: z.string(),
    })
    .strict(),
  z.object({ kind: z.literal('empty_portfolio'), currency: z.string() }).strict(),
]);

export const scenarioPortfolioShockToolOutputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('ok'), payload: payloadSchema }).strict(),
  z
    .object({
      kind: z.literal('truncated'),
      maxChars: z.number().int().positive(),
      actualChars: z.number().int().positive(),
    })
    .strict(),
]);

type ShockPayload = z.infer<typeof payloadSchema>;

export interface ScenarioPortfolioShockToolConfig {
  /** From the resolved execution profile's `topNHoldings`: the per-asset list is ranked by value and capped. */
  topNHoldings: number;
  maxChars: number;
  runBudgetTracker?: RunBudgetTracker;
  livePrices?: (currency: string) => Promise<Map<string, string>>;
}

export function scenarioPortfolioShockTool(
  useCase: Pick<PortfolioScenarioUseCaseLike, 'portfolioShock'>,
  config: ScenarioPortfolioShockToolConfig,
) {
  return createTool({
    id: 'scenario_portfolio_shock',
    description:
      "What the whole portfolio would be worth if every valued asset moved by the same percentage (a uniform shock) or if listed assets moved by their own percentages while the others stay put (a per-asset shock). Percentages run from -100 to 1000. Totals and the change are computed for you; never add or multiply yourself. Assets without a current value are listed apart, never shocked as zero. Read-only.",
    inputSchema: portfolioShockInputSchema,
    outputSchema: scenarioPortfolioShockToolOutputSchema,
    requestContextSchema: advisorRequestContextSchema,
    execute: async (inputData, { requestContext }): Promise<EnforceBudgetResult<ShockPayload>> => {
      const targetCurrency = requestContext.get('baseCurrency');
      const outcome = await useCase.portfolioShock({
        targetCurrency,
        livePrices: await config.livePrices?.(targetCurrency),
        shock: inputData.shock,
      });
      const payload: ShockPayload =
        outcome.kind === 'computed'
          ? {
              ...outcome,
              assets: outcome.assets.slice(0, config.topNHoldings),
              omittedCount: Math.max(outcome.assets.length - config.topNHoldings, 0),
            }
          : outcome;
      return enforceBudget(payload, config.maxChars, config.runBudgetTracker);
    },
  });
}
