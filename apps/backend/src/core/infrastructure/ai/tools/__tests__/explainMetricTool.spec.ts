import { describe, it, expect } from 'vitest';
import { RequestContext } from '@mastra/core/request-context';
import { noopObserve } from '@mastra/core/tools';
import { METRIC_IDS } from '@kryptofolio/shared-types';
import {
  buildExplainMetricToolResult,
  explainMetricTool,
  explainMetricToolInputSchema,
  explainMetricToolOutputSchema,
} from '../explainMetricTool.js';
import { METRIC_DEFINITIONS } from '../../metricDefinitions.js';
import type { AdvisorRequestContextValues } from '../../advisorRequestContext.js';

const CONFIG = { maxChars: 2000 };

describe('explain_metric tool', () => {
  it('returns the Spanish definition and the producing tool for an es request', () => {
    const result = buildExplainMetricToolResult('hhi', 'es', CONFIG);

    expect(result).toEqual({
      kind: 'ok',
      payload: { metric: 'hhi', definition: METRIC_DEFINITIONS.hhi.es, producedBy: METRIC_DEFINITIONS.hhi.producedBy },
    });
  });

  it('returns the English definition for en, and for any locale that is not Spanish', () => {
    for (const locale of ['en', 'en-GB', 'fr']) {
      const result = buildExplainMetricToolResult('sharpe', locale, CONFIG);
      if (result.kind !== 'ok') throw new Error('expected ok');
      expect(result.payload.definition, locale).toBe(METRIC_DEFINITIONS.sharpe.en);
    }
  });

  it('treats a regional Spanish locale as Spanish', () => {
    const result = buildExplainMetricToolResult('beta', 'es-ES', CONFIG);

    if (result.kind !== 'ok') throw new Error('expected ok');
    expect(result.payload.definition).toBe(METRIC_DEFINITIONS.beta.es);
  });

  it('produces a payload its strict output schema accepts for every metric', () => {
    for (const metric of METRIC_IDS) {
      expect(() => explainMetricToolOutputSchema.parse(buildExplainMetricToolResult(metric, 'en', CONFIG)), metric).not.toThrow();
    }
  });

  it('rejects a metric outside MetricId and any extra field', () => {
    expect(explainMetricToolInputSchema.safeParse({ metric: 'market_cap' }).success).toBe(false);
    expect(explainMetricToolInputSchema.safeParse({ metric: 'hhi', locale: 'es' }).success).toBe(false);
    expect(explainMetricToolInputSchema.safeParse({ metric: 'hhi' }).success).toBe(true);
  });

  it('truncates through the budget gate', () => {
    expect(buildExplainMetricToolResult('hhi', 'en', { maxChars: 10 }).kind).toBe('truncated');
  });

  it('takes the locale from request context, never from input', async () => {
    const tool = explainMetricTool(CONFIG);
    if (!tool.execute) throw new Error('expected tool.execute');

    const result = await tool.execute(
      { metric: 'hhi' },
      {
        requestContext: new RequestContext<AdvisorRequestContextValues>([
          ['locale', 'es'],
          ['baseCurrency', 'EUR'],
        ]),
        observe: noopObserve,
      },
    );

    expect(result).toMatchObject({ kind: 'ok', payload: { definition: METRIC_DEFINITIONS.hhi.es } });
  });
});
