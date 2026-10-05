import { z } from 'zod';
import { createTool } from '@mastra/core/tools';
import { preciseAmountSchema, scenarioPositionValueInputSchema } from '@kryptofolio/shared-types';
import { advisorRequestContextSchema } from '../advisorRequestContext.js';
import { enforceBudget, type RunBudgetTracker } from './enforceBudget.js';
import type { PortfolioScenarioUseCaseLike } from './scenarioUseCase.js';

const payloadSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('computed'),
      symbol: z.string(),
      positionValue: preciseAmountSchema,
      deltaVsCurrent: preciseAmountSchema,
      impliedAllocationPct: preciseAmountSchema,
      currency: z.string(),
    })
    .strict(),
  z.object({ kind: z.literal('not_held'), symbol: z.string(), currency: z.string() }).strict(),
  z
    .object({ kind: z.literal('unvalued'), symbol: z.string(), positionValue: preciseAmountSchema, currency: z.string() })
    .strict(),
  z.object({ kind: z.literal('empty_portfolio'), symbol: z.string(), currency: z.string() }).strict(),
]);

export const scenarioPositionValueToolOutputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('ok'), payload: payloadSchema }).strict(),
  z
    .object({
      kind: z.literal('truncated'),
      maxChars: z.number().int().positive(),
      actualChars: z.number().int().positive(),
    })
    .strict(),
]);

export interface ScenarioPositionValueToolConfig {
  maxChars: number;
  runBudgetTracker?: RunBudgetTracker;
  livePrices?: (currency: string) => Promise<Map<string, string>>;
}

export function scenarioPositionValueTool(
  useCase: Pick<PortfolioScenarioUseCaseLike, 'positionValue'>,
  config: ScenarioPositionValueToolConfig,
) {
  return createTool({
    id: 'scenario_position_value',
    description:
      "What one held asset would be worth at a hypothetical unit price the user names: the position value, the change against its current value and its implied share of the portfolio. The quantity always comes from the ledger. Never multiply or divide yourself; call this. A symbol not held, an asset with no current value or an empty portfolio is reported as such. Read-only.",
    inputSchema: scenarioPositionValueInputSchema,
    outputSchema: scenarioPositionValueToolOutputSchema,
    requestContextSchema: advisorRequestContextSchema,
    execute: async (inputData, { requestContext }) => {
      const targetCurrency = requestContext.get('baseCurrency');
      const outcome = await useCase.positionValue({
        targetCurrency,
        livePrices: await config.livePrices?.(targetCurrency),
        symbol: inputData.symbol,
        hypotheticalPrice: inputData.hypotheticalPrice,
      });
      return enforceBudget(outcome, config.maxChars, config.runBudgetTracker);
    },
  });
}
