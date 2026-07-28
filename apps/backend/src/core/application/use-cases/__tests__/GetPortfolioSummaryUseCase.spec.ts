import { describe, it, expect, vi } from 'vitest';
import { GetPortfolioSummaryUseCase } from '../GetPortfolioSummaryUseCase.js';
import type { IPortfolioAnalyticsPort } from '../../../domain/ports/IPortfolioAnalyticsPort.js';
import type { IUserSettingsPort } from '../../../domain/ports/IUserSettingsPort.js';
import type { IMetricsPort } from '../../../domain/ports/IMetricsPort.js';

describe('[Strict TDD] GetPortfolioSummaryUseCase', () => {
  it('should fetch holdings and calculate real-time unrealized PnL with Decimal.js precision', async () => {
    const mockAnalyticsPort: IPortfolioAnalyticsPort = {
      getHoldingsSnapshot: vi.fn().mockResolvedValue([
        {
          assetId: 'asset-btc',
          symbol: 'BTC',
          totalQty: '2.0',
          avgUnitCost: '30000.00',
          totalCostFiat: '60000.00',
          currency: 'USD',
          portfolioLocations: ['Binance'],
        },
      ]),
      getDerivativesPnl: vi.fn().mockResolvedValue([]),
    };

    const mockUserSettingsPort: IUserSettingsPort = {
      getSetting: vi.fn().mockResolvedValue('USD'),
      setSetting: vi.fn().mockResolvedValue(undefined),
    };

    const mockMetricsPort: IMetricsPort = {
      getKpis: vi.fn().mockResolvedValue({
        totalEquity: '100000.00',
        totalCostBasis: '60000.00',
        totalUnrealizedPnl: '40000.00',
        totalRealizedPnl: '5000.00',
        allTimeHigh: '105000.00',
        maxDrawdownPct: '-0.05',
        annualizedVolatility: '0.25',
        sharpeRatio: '1.50',
        currency: 'USD',
      }),
      getPerformanceHistory: vi.fn().mockResolvedValue([]),
      getAssetAllocation: vi.fn().mockResolvedValue([]),
      getVolatilityHeatmap: vi.fn().mockResolvedValue([]),
      getRiskMetrics: vi.fn().mockResolvedValue({
        maxDrawdownPct: '-0.05',
        annualizedVolatility: '0.25',
        sharpeRatio: '1.50',
        alpha: '0.02',
        beta: '1.00',
        currency: 'USD',
      }),
      getDrawdownCurve: vi.fn().mockResolvedValue([]),
    };

    const useCase = new GetPortfolioSummaryUseCase(
      mockAnalyticsPort,
      mockUserSettingsPort,
      mockMetricsPort,
    );

    const livePrices = new Map<string, string>([['BTC', '50000.00']]);
    const summary = await useCase.execute({
      accountId: 'acc-1',
      livePrices,
    });

    expect(mockAnalyticsPort.getHoldingsSnapshot).toHaveBeenCalledWith('acc-1', 'USD');
    expect(mockMetricsPort.getKpis).toHaveBeenCalledWith('USD');
    expect(summary.holdings).toHaveLength(1);
    const btc = summary.holdings[0]!;
    expect(btc.symbol).toBe('BTC');
    expect(btc.amount).toBe('2.0');
    expect(btc.avg_price_fiat).toBe('30000.00');
    expect(btc.cost_basis_fiat).toBe('60000.00');
    expect(btc.live_price).toBe('50000.00');
    expect(btc.current_value_fiat).toBe('100000.00');
    expect(btc.unrealized_pnl_fiat).toBe('40000.00');
    expect(btc.currency).toBe('USD');
    expect(btc.portfolio_locations).toEqual(['Binance']);

    expect(summary.metrics.total_equity_fiat).toBe('100000.00');
    expect(summary.metrics.total_cost_basis_fiat).toBe('60000.00');
    expect(summary.metrics.total_realized_pnl_fiat).toBe('5000.00');
  });

  it('should use explicit targetCurrency if passed, falling back to user settings base_currency', async () => {
    const mockAnalyticsPort: IPortfolioAnalyticsPort = {
      getHoldingsSnapshot: vi.fn().mockResolvedValue([
        {
          assetId: 'asset-eth',
          symbol: 'ETH',
          totalQty: '10.0',
          avgUnitCost: '1500.00',
          totalCostFiat: '15000.00',
          currency: 'EUR',
        },
      ]),
      getDerivativesPnl: vi.fn().mockResolvedValue([]),
    };

    const mockUserSettingsPort: IUserSettingsPort = {
      getSetting: vi.fn().mockResolvedValue('USD'),
      setSetting: vi.fn().mockResolvedValue(undefined),
    };

    const useCase = new GetPortfolioSummaryUseCase(mockAnalyticsPort, mockUserSettingsPort);

    const summary = await useCase.execute({
      targetCurrency: 'EUR',
    });

    expect(mockAnalyticsPort.getHoldingsSnapshot).toHaveBeenCalledWith(undefined, 'EUR');
    expect(summary.holdings[0]!.currency).toBe('EUR');
    expect(summary.metrics.currency).toBe('EUR');
  });
});
