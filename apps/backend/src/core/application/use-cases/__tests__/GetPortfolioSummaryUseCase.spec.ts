import { describe, it, expect, vi } from 'vitest';
import Decimal from 'decimal.js';
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

  /**
   * `total_pnl_fiat` is assigned from `kpis.totalUnrealizedPnl`, so the two fields carry
   * the same number and realized PnL is dropped without trace. It survived because the
   * two are indistinguishable whenever realized PnL is zero — so this fixture makes both
   * components non-zero and of different magnitudes, and asserts the sum rather than
   * merely asserting that the fields differ.
   */
  it('reports total PnL as realized plus unrealized, not unrealized alone', async () => {
    const mockAnalyticsPort: IPortfolioAnalyticsPort = {
      getHoldingsSnapshot: vi.fn().mockResolvedValue([]),
      getDerivativesPnl: vi.fn().mockResolvedValue([]),
    };

    const mockUserSettingsPort: IUserSettingsPort = {
      getSetting: vi.fn().mockResolvedValue('EUR'),
      setSetting: vi.fn().mockResolvedValue(undefined),
    };

    const REALIZED = '1250.00';
    const UNREALIZED = '3550.00';

    const mockMetricsPort: IMetricsPort = {
      getKpis: vi.fn().mockResolvedValue({
        totalEquity: '4800.00',
        totalCostBasis: '1250.00',
        totalUnrealizedPnl: UNREALIZED,
        totalRealizedPnl: REALIZED,
        allTimeHigh: '4800.00',
        maxDrawdownPct: '0.0000',
        annualizedVolatility: '0.0000',
        sharpeRatio: '0.0000',
        currency: 'EUR',
      }),
      getPerformanceHistory: vi.fn().mockResolvedValue([]),
      getAssetAllocation: vi.fn().mockResolvedValue([]),
      getVolatilityHeatmap: vi.fn().mockResolvedValue([]),
      getRiskMetrics: vi.fn().mockResolvedValue({
        maxDrawdownPct: '0.0000',
        annualizedVolatility: '0.0000',
        sharpeRatio: '0.0000',
        alpha: '0.0000',
        beta: '1.0000',
        currency: 'EUR',
      }),
      getDrawdownCurve: vi.fn().mockResolvedValue([]),
    };

    const useCase = new GetPortfolioSummaryUseCase(
      mockAnalyticsPort,
      mockUserSettingsPort,
      mockMetricsPort,
    );

    const summary = await useCase.execute({ accountId: 'acc-1' });

    const expectedTotal = new Decimal(REALIZED).plus(UNREALIZED);
    expect(
      new Decimal(summary.metrics.total_pnl_fiat).equals(expectedTotal),
      `total_pnl_fiat was ${summary.metrics.total_pnl_fiat}, expected ${expectedTotal.toFixed()}`,
    ).toBe(true);

    expect(
      new Decimal(summary.metrics.total_pnl_fiat).equals(summary.metrics.total_unrealized_pnl_fiat),
      'total_pnl_fiat is a copy of total_unrealized_pnl_fiat, so realized PnL was dropped',
    ).toBe(false);
  });
});
