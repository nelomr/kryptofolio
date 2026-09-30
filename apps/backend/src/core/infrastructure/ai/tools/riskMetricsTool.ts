import { z } from 'zod';
import { createTool } from '@mastra/core/tools';
import { advisorRequestContextSchema } from '../advisorRequestContext.js';
import type { RiskMetrics } from '../../../domain/ports/IMetricsPort.js';
import type { GetRiskMetricsUseCase } from '../../../application/use-cases/GetRiskMetricsUseCase.js';
import { enforceBudget, type EnforceBudgetResult, type RunBudgetTracker } from './enforceBudget.js';

const riskMetricsPayloadSchema = z
  .object({
    maxDrawdownPct: z.string(),
    annualizedVolatility: z.string(),
    sharpeRatio: z.string(),
    alpha: z.string(),
    beta: z.string(),
  })
  .strict();

export const riskMetricsToolOutputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('ok'), payload: riskMetricsPayloadSchema }).strict(),
  z
    .object({
      kind: z.literal('truncated'),
      maxChars: z.number().int().positive(),
      actualChars: z.number().int().positive(),
    })
    .strict(),
]);

export type RiskMetricsToolPayload = z.infer<typeof riskMetricsPayloadSchema>;

export interface RiskMetricsToolConfig {
  maxChars: number;
  /** The run-wide cap tracker — one instance per advisor run, `undefined` for a metered run. */
  runBudgetTracker?: RunBudgetTracker;
}

/** Pure projection + budget gate. The fixed-shape response, no ranking or capping involved. */
export function buildRiskMetricsToolResult(
  metrics: RiskMetrics,
  config: RiskMetricsToolConfig,
): EnforceBudgetResult<RiskMetricsToolPayload> {
  const payload: RiskMetricsToolPayload = {
    maxDrawdownPct: metrics.maxDrawdownPct,
    annualizedVolatility: metrics.annualizedVolatility,
    sharpeRatio: metrics.sharpeRatio,
    alpha: metrics.alpha,
    beta: metrics.beta,
  };

  return enforceBudget(payload, config.maxChars, config.runBudgetTracker);
}

/** Structural, not the concrete class: the tool only ever calls `execute`. */
export type RiskMetricsUseCaseLike = Pick<GetRiskMetricsUseCase, 'execute'>;

/** Constructor takes only the wrapped use case plus pure configuration. */
export function riskMetricsTool(useCase: RiskMetricsUseCaseLike, config: RiskMetricsToolConfig) {
  return createTool({
    id: 'risk_metrics',
    description: 'Portfolio-wide risk figures (drawdown, volatility, Sharpe, alpha, beta). Read-only.',
    inputSchema: z.object({}).strict(),
    outputSchema: riskMetricsToolOutputSchema,
    requestContextSchema: advisorRequestContextSchema,
    execute: async (_inputData, { requestContext }) => {
      const metrics = await useCase.execute(requestContext.get('baseCurrency'));
      return buildRiskMetricsToolResult(metrics, config);
    },
  });
}
