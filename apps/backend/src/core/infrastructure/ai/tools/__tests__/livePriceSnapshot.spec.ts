import { describe, it, expect, vi } from 'vitest';
import { RequestContext } from '@mastra/core/request-context';
import { noopObserve } from '@mastra/core/tools';
import type { AssetPrice } from '@kryptofolio/shared-types';
import { resolveLivePriceSnapshot, type PriceSnapshotPortLike } from '../livePriceSnapshot.js';
import { portfolioSummaryTool, portfolioSummaryToolInputSchema } from '../portfolioSummaryTool.js';
import { buildImplementedTools, type ToolConfigs, type ToolUseCases } from '../index.js';
import { livePricesTool, livePricesToolInputSchema } from '../livePricesTool.js';
import { GetPortfolioSummaryUseCase } from '../../../../application/use-cases/GetPortfolioSummaryUseCase.js';
import type { IPortfolioAnalyticsPort } from '../../../../domain/ports/IPortfolioAnalyticsPort.js';
import type { FifoChainFreshnessService } from '../../../../application/services/FifoChainFreshnessService.js';
import type { AdvisorRequestContextValues } from '../../advisorRequestContext.js';

function price(symbol: string, currency: string, value: string): AssetPrice {
  return { symbol, currency, price: value, change24hPercent: '0', provider: 'kraken', timestamp: '2025-01-01T00:00:00Z' };
}

function portStub(prices: readonly AssetPrice[]): PriceSnapshotPortLike {
  return {
    getTrackedSymbols: async () => [...new Set(prices.map((p) => p.symbol))],
    getLatest: async (symbol, currency) =>
      prices.find((p) => p.symbol === symbol && p.currency === currency) ?? null,
  };
}

const freshness = { ensureFresh: vi.fn().mockResolvedValue({ kind: 'fresh' }) } as unknown as FifoChainFreshnessService;

function useCaseWithDuckDbClose(): GetPortfolioSummaryUseCase {
  const analytics: IPortfolioAnalyticsPort = {
    getHoldingsSnapshot: vi.fn().mockResolvedValue([
      {
        assetId: 'btc',
        symbol: 'BTC',
        totalQty: '2',
        avgUnitCost: '30000.00',
        totalCostFiat: '60000.00',
        costBasis: { kind: 'NATIVE', amount: '60000.00', currency: 'EUR' },
        livePrice: '40000.00',
        currentValueFiat: '80000.00',
        unrealizedPnlFiat: '20000.00',
        currency: 'EUR',
      },
      {
        assetId: 'eth',
        symbol: 'ETH',
        totalQty: '10',
        avgUnitCost: '1000.00',
        totalCostFiat: '10000.00',
        costBasis: { kind: 'NATIVE', amount: '10000.00', currency: 'EUR' },
        livePrice: '2000.00',
        currentValueFiat: '20000.00',
        unrealizedPnlFiat: '10000.00',
        currency: 'EUR',
      },
    ]),
    getDerivativesPnl: vi.fn().mockResolvedValue([]),
  };
  return new GetPortfolioSummaryUseCase(analytics, freshness);
}

async function runSummary(port: PriceSnapshotPortLike) {
  const tool = portfolioSummaryTool(useCaseWithDuckDbClose(), {
    topNHoldings: 15,
    maxChars: 8000,
    livePrices: (currency) => resolveLivePriceSnapshot(port, currency),
  });
  if (!tool.execute) throw new Error('expected tool.execute');
  const requestContext = new RequestContext<AdvisorRequestContextValues>([
    ['locale', 'en'],
    ['baseCurrency', 'EUR'],
  ]);
  const result = await tool.execute(portfolioSummaryToolInputSchema.parse({}), { requestContext, observe: noopObserve });
  if (!result || !('kind' in result) || result.kind !== 'ok') throw new Error('expected ok');
  return result.payload;
}

async function runLivePrices(port: PriceSnapshotPortLike, symbols: string[]) {
  const tool = livePricesTool(port, { maxChars: 4000, currency: 'EUR' });
  if (!tool.execute) throw new Error('expected tool.execute');
  const result = await tool.execute(livePricesToolInputSchema.parse({ symbols }), { observe: noopObserve });
  if (!result || !('kind' in result) || result.kind !== 'ok') throw new Error('expected ok');
  return result.payload;
}

describe('portfolio_summary and live_prices share one price snapshot', () => {
  it('values a held symbol at the snapshot price, not the DuckDB close, and live_prices returns that same price', async () => {
    const port = portStub([price('BTC', 'EUR', '50000.00')]);

    const summary = await runSummary(port);
    const live = await runLivePrices(port, ['BTC']);

    const btc = summary.ranked.find((h) => h.symbol === 'BTC');
    expect(btc?.currentValueFiat).toBe('100000.00');
    expect(btc?.unrealizedPnlFiat).toBe('40000.00');
    expect(live.prices[0]?.price).toBe('50000.00');
  });

  it('totals the summary over the holdings it re-valued at the snapshot price', async () => {
    const summary = await runSummary(portStub([price('BTC', 'EUR', '50000.00')]));

    expect(summary.metrics.totalEquityFiat).toBe('120000.00');
    expect(summary.metrics.totalCostBasisFiat).toBe('70000.00');
    expect(summary.metrics.totalUnrealizedPnlFiat).toBe('50000.00');
  });

  it('keeps the stored valuation for a symbol with no snapshot, never fabricating one', async () => {
    const base = portStub([price('BTC', 'EUR', '50000.00')]);
    const port: PriceSnapshotPortLike = { ...base, getTrackedSymbols: async () => ['BTC', 'ETH'] };

    const summary = await runSummary(port);

    const eth = summary.ranked.find((h) => h.symbol === 'ETH');
    expect(eth?.currentValueFiat).toBe('20000.00');
    expect((await runLivePrices(port, ['ETH'])).notTracked).toEqual(['ETH']);
  });

  it('neither uses nor converts a snapshot quoted in another currency', async () => {
    const port = portStub([price('BTC', 'USD', '55000.00')]);

    const summary = await runSummary(port);

    expect(summary.ranked.find((h) => h.symbol === 'BTC')?.currentValueFiat).toBe('80000.00');
  });

  it('drops a snapshot whose own currency disagrees with the one requested, even from a port that ignores the currency key', async () => {
    const lax: PriceSnapshotPortLike = {
      getTrackedSymbols: async () => ['BTC'],
      getLatest: async () => price('BTC', 'USD', '55000.00'),
    };

    expect((await resolveLivePriceSnapshot(lax, 'EUR')).size).toBe(0);
  });
});

describe('buildImplementedTools wiring', () => {
  it('hands portfolio_summary the snapshot of the same price port that live_prices reads', async () => {
    const notUsed = async (): Promise<never> => {
      throw new Error('not exercised');
    };
    const executeSummary = vi.fn(async (request: { livePrices?: Map<string, string> }) =>
      useCaseWithDuckDbClose().execute(request),
    );
    const useCases: ToolUseCases = {
      portfolioSummary: { execute: executeSummary },
      fiscalIntegrity: { execute: notUsed },
      tokenHistory: { execute: notUsed },
      assetAllocation: { execute: notUsed },
      riskMetrics: { execute: notUsed },
      kpis: { execute: notUsed },
      drawdownCurve: { execute: notUsed },
      performanceHistory: { execute: notUsed },
      volatilityHeatmap: { execute: notUsed },
      spanishTaxReport: { execute: notUsed },
      priceHistory: portStub([price('BTC', 'EUR', '50000.00')]),
      fiscalIntegrityRows: { execute: notUsed },
      tokenLots: { execute: notUsed },
      txSearch: { execute: notUsed },
      portfolioScenario: { positionValue: notUsed, breakeven: notUsed, portfolioShock: notUsed, concentration: notUsed },
      custodyLocations: { execute: notUsed },
      derivativesPnl: { execute: notUsed },
      taxYearComparison: { execute: notUsed },
      listAccounts: { execute: notUsed },
      holdingDetail: { execute: notUsed },
    };
    const configs: ToolConfigs = {
      portfolioSummary: { topNHoldings: 15, maxChars: 4000 },
      fiscalIntegrity: { maxChars: 6000 },
      tokenHistory: { lotsPageSize: 20, maxChars: 6000 },
      assetAllocation: { topNHoldings: 15, maxChars: 3000 },
      riskMetrics: { maxChars: 1500 },
      kpis: { maxChars: 3000 },
      drawdownCurve: { maxChars: 4000 },
      performanceHistory: { maxChars: 4000 },
      volatilityHeatmap: { maxChars: 4000 },
      spanishTaxReport: { maxChars: 5000 },
      livePrices: { maxChars: 2000, currency: 'EUR' },
      fiscalIntegrityRows: { rowsPageSize: 25, maxChars: 4000 },
      tokenLots: { lotsPageSize: 20, maxChars: 4000 },
      txSearch: { rowsPageSize: 25, maxChars: 5000 },
      concentrationRisk: { maxChars: 2000 },
      scenarioPortfolioShock: { topNHoldings: 15, maxChars: 4000 },
      breakevenPrice: { maxChars: 1500 },
      scenarioPositionValue: { maxChars: 1500 },
      explainMetric: { maxChars: 2000 },
      dataGaps: { maxChars: 4000 },
      custodyLocations: { topNHoldings: 15, maxChars: 4000 },
      derivativesPnl: { topNHoldings: 15, maxChars: 4000 },
      taxYearComparison: { maxChars: 4000 },
      accountHoldings: { topNHoldings: 15, maxChars: 5000 },
      holdingDetail: { maxChars: 3000 },
    };
    const tool = buildImplementedTools(useCases, configs).portfolio_summary;
    if (!tool.execute) throw new Error('expected tool.execute');
    const requestContext = new RequestContext<AdvisorRequestContextValues>([
      ['locale', 'en'],
      ['baseCurrency', 'EUR'],
    ]);

    const result = await tool.execute(portfolioSummaryToolInputSchema.parse({}), {
      requestContext,
      observe: noopObserve,
    });
    if (!result || !('kind' in result) || result.kind !== 'ok') throw new Error('expected ok');

    expect(result.payload.ranked.map((h) => h.currentValueFiat)).toEqual(['100000.00', '20000.00']);
    expect(result.payload.metrics.totalEquityFiat).toBe('120000.00');
    expect(executeSummary).toHaveBeenCalledWith({
      targetCurrency: 'EUR',
      livePrices: new Map([['BTC', '50000.00']]),
    });
  });
});
