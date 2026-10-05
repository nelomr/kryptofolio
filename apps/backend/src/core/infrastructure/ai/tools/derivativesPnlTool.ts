import { z } from 'zod';
import { createTool } from '@mastra/core/tools';
import { rankByAbsoluteValue } from '@kryptofolio/core-domain';
import { preciseAmountSchema } from '@kryptofolio/shared-types';
import type { DerivativesPnl } from '../../../domain/ports/IPortfolioAnalyticsPort.js';
import type { GetDerivativesPnlUseCase } from '../../../application/use-cases/GetDerivativesPnlUseCase.js';
import { advisorRequestContextSchema } from '../advisorRequestContext.js';
import { enforceBudget, type EnforceBudgetResult, type RunBudgetTracker } from './enforceBudget.js';

export const derivativesPnlToolInputSchema = z.object({}).strict();

const contractSchema = z
  .object({
    symbol: z.string(),
    contractName: z.string(),
    realizedPnl: preciseAmountSchema,
    funding: preciseAmountSchema,
    fees: preciseAmountSchema,
    netPnl: preciseAmountSchema,
    currency: z.string(),
  })
  .strict();

const derivativesPnlPayloadSchema = z
  .object({ ranked: z.array(contractSchema), omittedCount: z.number().int().nonnegative() })
  .strict();

export const derivativesPnlToolOutputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('ok'), payload: derivativesPnlPayloadSchema }).strict(),
  z
    .object({
      kind: z.literal('truncated'),
      maxChars: z.number().int().positive(),
      actualChars: z.number().int().positive(),
    })
    .strict(),
]);

export type DerivativesPnlToolPayload = z.infer<typeof derivativesPnlPayloadSchema>;

export interface DerivativesPnlToolConfig {
  topNHoldings: number;
  maxChars: number;
  runBudgetTracker?: RunBudgetTracker;
}

export function buildDerivativesPnlToolResult(
  rows: readonly DerivativesPnl[],
  config: DerivativesPnlToolConfig,
): EnforceBudgetResult<DerivativesPnlToolPayload> {
  const { ranked, omittedCount } = rankByAbsoluteValue(rows, (row) => row.realizedPnl, config.topNHoldings);
  const payload: DerivativesPnlToolPayload = {
    ranked: ranked.map((row) => ({
      symbol: row.symbol,
      contractName: row.contractName,
      realizedPnl: row.realizedPnl,
      funding: row.funding,
      fees: row.fees,
      netPnl: row.netPnl,
      currency: row.currency,
    })),
    omittedCount,
  };
  return enforceBudget(payload, config.maxChars, config.runBudgetTracker);
}

export type DerivativesPnlUseCaseLike = Pick<GetDerivativesPnlUseCase, 'execute'>;

export function derivativesPnlTool(useCase: DerivativesPnlUseCaseLike, config: DerivativesPnlToolConfig) {
  return createTool({
    id: 'derivatives_pnl',
    description:
      "Realized PnL, funding, fees and net PnL per futures contract across all of the user's accounts, ranked by the size of the realized PnL and capped to the largest contracts. Each row declares its own currency. Read-only.",
    inputSchema: derivativesPnlToolInputSchema,
    outputSchema: derivativesPnlToolOutputSchema,
    requestContextSchema: advisorRequestContextSchema,
    execute: async (_inputData, { requestContext }) => {
      const rows = await useCase.execute(requestContext.get('baseCurrency'));
      return buildDerivativesPnlToolResult(rows, config);
    },
  });
}
