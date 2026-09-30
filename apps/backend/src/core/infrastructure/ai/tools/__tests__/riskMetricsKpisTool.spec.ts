import { describe, it, expect, vi } from 'vitest';
import { RequestContext } from '@mastra/core/request-context';
import { noopObserve } from '@mastra/core/tools';
import { buildRiskMetricsToolResult, riskMetricsTool, riskMetricsToolOutputSchema } from '../riskMetricsTool.js';
import { buildKpisToolResult, kpisTool, kpisToolOutputSchema } from '../kpisTool.js';
import type { AdvisorRequestContextValues } from '../../advisorRequestContext.js';
import type { RiskMetrics, MetricsKpis } from '../../../../domain/ports/IMetricsPort.js';

const RISK_METRICS: RiskMetrics = {
  maxDrawdownPct: '12.5',
  annualizedVolatility: '34.2',
  sharpeRatio: '1.2',
  alpha: '0.03',
  beta: '0.98',
};

const KPIS: MetricsKpis = {
  ratesIncomplete: false,
  pricesIncomplete: false,
  totalEquity: '10000.00',
  totalCostBasis: '8000.00',
  totalUnrealizedPnl: '2000.00',
  totalRealizedPnl: '500.00',
  allTimeHigh: '11000.00',
  maxDrawdownPct: '9.1',
  annualizedVolatility: '20.0',
  sharpeRatio: '1.5',
  currency: 'EUR',
  winRatePercent: 55.5,
  totalTrades: 40,
  winningTrades: 22,
  losingTrades: 18,
  averageR: 1.1,
  bestAsset: { symbol: 'BTC', name: 'Bitcoin', allocationPct: 40, roiPct: 120.5 },
  worstAsset: { symbol: 'XRP', name: 'Ripple', allocationPct: 2, roiPct: -30.2 },
  totalRoiPercent: 25.0,
  totalRoiFiat: '2000.00',
};

function requestContextFor(baseCurrency: string): RequestContext<AdvisorRequestContextValues> {
  return new RequestContext<AdvisorRequestContextValues>([
    ['locale', 'en'],
    ['baseCurrency', baseCurrency],
  ]);
}

const RISK_CONFIG = { maxChars: 1500 };
const KPIS_CONFIG = { maxChars: 3000 };

describe('risk_metrics tool', () => {
  it('projects the fixed RiskMetrics shape field by field', () => {
    const result = buildRiskMetricsToolResult(RISK_METRICS, RISK_CONFIG);

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') throw new Error('expected ok');
    expect(result.payload).toEqual(RISK_METRICS);
    expect(() => riskMetricsToolOutputSchema.parse(result)).not.toThrow();
  });

  it('claims no currency, since every figure is a ratio or a percentage', () => {
    const result = buildRiskMetricsToolResult(RISK_METRICS, RISK_CONFIG);
    if (result.kind !== 'ok') throw new Error('expected ok');

    expect(result.payload).not.toHaveProperty('currency');
    expect(riskMetricsToolOutputSchema.safeParse({ ...result, payload: { ...result.payload, currency: 'EUR' } }).success).toBe(false);
  });

  it('rejects an outputSchema payload carrying an undeclared field', () => {
    const result = buildRiskMetricsToolResult(RISK_METRICS, RISK_CONFIG);
    if (result.kind !== 'ok') throw new Error('expected ok');
    const withExtraField = { ...result, payload: { ...result.payload, unexpectedField: 'nope' } };
    expect(() => riskMetricsToolOutputSchema.parse(withExtraField)).toThrow();
  });
});

describe('kpis tool', () => {
  it('projects the fixed MetricsKpis shape, monetary strings through preciseAmountSchema, percentages/counts passed through as numbers', () => {
    const result = buildKpisToolResult(KPIS, KPIS_CONFIG);

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') throw new Error('expected ok');
    expect(result.payload.totalEquity).toBe('10000.00');
    expect(result.payload.winRatePercent).toBe(55.5);
    expect(result.payload.bestAsset).toEqual(KPIS.bestAsset);
    expect(() => kpisToolOutputSchema.parse(result)).not.toThrow();
  });

  it('rejects an outputSchema payload carrying an undeclared field', () => {
    const result = buildKpisToolResult(KPIS, KPIS_CONFIG);
    if (result.kind !== 'ok') throw new Error('expected ok');
    const withExtraField = { ...result, payload: { ...result.payload, unexpectedField: 'nope' } };
    expect(() => kpisToolOutputSchema.parse(withExtraField)).toThrow();
  });
});

describe('base currency resolution', () => {
  it('risk_metrics asks its use case for the request base currency', async () => {
    const useCase = { execute: vi.fn(async () => RISK_METRICS) };
    const tool = riskMetricsTool(useCase, RISK_CONFIG);
    if (!tool.execute) throw new Error('expected tool.execute to be defined');

    await tool.execute({}, { requestContext: requestContextFor('USD'), observe: noopObserve });

    expect(useCase.execute).toHaveBeenCalledWith('USD');
  });

  it('kpis asks its use case for the request base currency', async () => {
    const useCase = { execute: vi.fn(async () => ({ ...KPIS, currency: 'USD' })) };
    const tool = kpisTool(useCase, KPIS_CONFIG);
    if (!tool.execute) throw new Error('expected tool.execute to be defined');

    await tool.execute({}, { requestContext: requestContextFor('USD'), observe: noopObserve });

    expect(useCase.execute).toHaveBeenCalledWith('USD');
  });
});
