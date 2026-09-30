import { describe, it, expect } from 'vitest';
import { reportsIncompleteFigures } from '../reportsIncompleteFigures.js';
import { buildPortfolioSummaryToolResult } from '../portfolioSummaryTool.js';
import { buildKpisToolResult } from '../kpisTool.js';
import { buildRiskMetricsToolResult } from '../riskMetricsTool.js';
import { buildFortyHoldingFixture, buildFortyHoldingFixtureWithUnvalued } from './fixtures/portfolioSummaryFixture.js';
import type { MetricsKpis, RiskMetrics } from '../../../../domain/ports/IMetricsPort.js';

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

const RISK: RiskMetrics = {
  maxDrawdownPct: '12.5',
  annualizedVolatility: '34.2',
  sharpeRatio: '1.2',
  alpha: '0.03',
  beta: '0.98',
};

const SUMMARY_CONFIG = { topNHoldings: 15, maxChars: 40000 };
const KPIS_CONFIG = { maxChars: 3000 };

describe('reportsIncompleteFigures', () => {
  it('is true for a real portfolio_summary result whose metrics are incomplete', () => {
    const incomplete = buildFortyHoldingFixtureWithUnvalued();
    expect(incomplete.metrics.rates_incomplete || incomplete.metrics.prices_incomplete).toBe(true);
    const result = buildPortfolioSummaryToolResult(incomplete, SUMMARY_CONFIG);
    expect(result.kind).toBe('ok');
    expect(reportsIncompleteFigures(result)).toBe(true);
  });

  it('is true when only prices, or only rates, are incomplete', () => {
    const base = buildFortyHoldingFixture();
    const onlyPrices = buildPortfolioSummaryToolResult(
      {
        ...base,
        metrics: { ...base.metrics, rates_incomplete: false, prices_incomplete: false },
        holdings: base.holdings.map((h, i) => (i === 0 ? { ...h, current_value_fiat: undefined } : h)),
      },
      SUMMARY_CONFIG,
    );
    const onlyRates = buildPortfolioSummaryToolResult(
      { ...base, metrics: { ...base.metrics, rates_incomplete: true, prices_incomplete: false } },
      SUMMARY_CONFIG,
    );
    expect(reportsIncompleteFigures(onlyPrices)).toBe(true);
    expect(reportsIncompleteFigures(onlyRates)).toBe(true);
  });

  it('is false for a real portfolio_summary result with complete metrics', () => {
    const base = buildFortyHoldingFixture();
    const complete = buildPortfolioSummaryToolResult(
      { ...base, metrics: { ...base.metrics, rates_incomplete: false, prices_incomplete: false } },
      SUMMARY_CONFIG,
    );
    expect(complete.kind).toBe('ok');
    expect(reportsIncompleteFigures(complete)).toBe(false);
  });

  it('is true for a real kpis result with either flag set, false when both are clear', () => {
    expect(reportsIncompleteFigures(buildKpisToolResult({ ...KPIS, pricesIncomplete: true }, KPIS_CONFIG))).toBe(true);
    expect(reportsIncompleteFigures(buildKpisToolResult({ ...KPIS, ratesIncomplete: true }, KPIS_CONFIG))).toBe(true);
    expect(reportsIncompleteFigures(buildKpisToolResult(KPIS, KPIS_CONFIG))).toBe(false);
  });

  it('is false for a truncated result even when the figures behind it were incomplete', () => {
    const truncated = buildPortfolioSummaryToolResult(buildFortyHoldingFixtureWithUnvalued(), {
      topNHoldings: 15,
      maxChars: 10,
    });
    expect(truncated.kind).toBe('truncated');
    expect(reportsIncompleteFigures(truncated)).toBe(false);
  });

  it('is false for an unrelated tool result', () => {
    expect(reportsIncompleteFigures(buildRiskMetricsToolResult(RISK, { maxChars: 1500 }))).toBe(false);
  });

  it('is false for shapes that are not a tool result at all', () => {
    expect(reportsIncompleteFigures(undefined)).toBe(false);
    expect(reportsIncompleteFigures(null)).toBe(false);
    expect(reportsIncompleteFigures('ratesIncomplete')).toBe(false);
    expect(reportsIncompleteFigures({ kind: 'ok', payload: 'x' })).toBe(false);
    expect(reportsIncompleteFigures({ kind: 'ok', payload: { ratesIncomplete: 'true' } })).toBe(false);
    expect(reportsIncompleteFigures({ error: true, message: 'bad input' })).toBe(false);
  });
});
