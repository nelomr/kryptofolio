import { z } from 'zod';
import { createTool } from '@mastra/core/tools';
import { ADVISOR_TOOL_NAMES, metricIdSchema, type MetricId } from '@kryptofolio/shared-types';
import { advisorRequestContextSchema } from '../advisorRequestContext.js';
import { METRIC_DEFINITIONS } from '../metricDefinitions.js';
import { enforceBudget, type EnforceBudgetResult, type RunBudgetTracker } from './enforceBudget.js';

export const explainMetricToolInputSchema = z.object({ metric: metricIdSchema }).strict();

const explainMetricPayloadSchema = z
  .object({ metric: metricIdSchema, definition: z.string(), producedBy: z.enum(ADVISOR_TOOL_NAMES) })
  .strict();

export const explainMetricToolOutputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('ok'), payload: explainMetricPayloadSchema }).strict(),
  z
    .object({
      kind: z.literal('truncated'),
      maxChars: z.number().int().positive(),
      actualChars: z.number().int().positive(),
    })
    .strict(),
]);

export type ExplainMetricToolPayload = z.infer<typeof explainMetricPayloadSchema>;

export interface ExplainMetricToolConfig {
  maxChars: number;
  runBudgetTracker?: RunBudgetTracker;
}

export function buildExplainMetricToolResult(
  metric: MetricId,
  locale: string,
  config: ExplainMetricToolConfig,
): EnforceBudgetResult<ExplainMetricToolPayload> {
  const entry = METRIC_DEFINITIONS[metric];
  const payload: ExplainMetricToolPayload = {
    metric,
    definition: locale.toLowerCase().startsWith('es') ? entry.es : entry.en,
    producedBy: entry.producedBy,
  };
  return enforceBudget(payload, config.maxChars, config.runBudgetTracker);
}

export function explainMetricTool(config: ExplainMetricToolConfig) {
  return createTool({
    id: 'explain_metric',
    description:
      'The definition of one named metric (equity, cost basis, realized or unrealized PnL, drawdown, volatility, Sharpe, alpha, beta, HHI, top-N weight, breakeven price, incompleteness warnings, unvalued holdings, IRPF savings base, net patrimonial result), in the user\'s language, and which tool reports it. Static text with no figures. Read-only.',
    inputSchema: explainMetricToolInputSchema,
    outputSchema: explainMetricToolOutputSchema,
    requestContextSchema: advisorRequestContextSchema,
    execute: async (inputData, { requestContext }) =>
      buildExplainMetricToolResult(inputData.metric, requestContext.get('locale'), config),
  });
}
