import { describe, it, expect, vi } from 'vitest'
import { RestCryptoMetricsAdapter, DomainValidationError } from '../RestCryptoMetricsAdapter'
import { errorBus } from '@/core/infrastructure/errors/errorBus'

vi.mock('@/core/infrastructure/errors/errorBus', () => ({
  errorBus: {
    emit: vi.fn(),
  },
}))

vi.mock('../../http/BffClient', () => {
  return {
    bffClient: {
      api: {
        metrics: {
          kpis: {
            $get: vi.fn()
          },
          drawdown: {
            $get: vi.fn()
          }
        }
      }
    }
  }
})

describe('RestCryptoMetricsAdapter', () => {
  it('implements ICryptoMetricsPort interface', () => {
    const adapter = new RestCryptoMetricsAdapter()
    expect(typeof adapter.getKpis).toBe('function')
  })

  it('getKpis parses a valid API payload using Zod Anti-Corruption Layer', async () => {
    const validPayload = {
      total_roi_percent: 15.5,
      total_roi_fiat: 1500,
      delta_24h_fiat: 100,
      invested_fiat: 8500,
      max_drawdown_percent: -5.2,
      max_drawdown_fiat: -500,
      recovered_fiat: 100,
      win_rate_percent: 65,
      winning_trades: 13,
      losing_trades: 7,
      total_trades: 20,
      average_r: 1.5,
      portfolio_dispersion: 12.3,
      best_asset: {
        symbol: 'BTC',
        name: 'Bitcoin',
        allocation_percent: 50,
        roi_percent: 25.5
      },
      worst_asset: {
        symbol: 'XRP',
        name: 'Ripple',
        allocation_percent: 10,
        roi_percent: -15.5
      }
    }

    const { bffClient } = await import('../../http/BffClient')
    // @ts-ignore
    bffClient.api.metrics.kpis.$get.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(validPayload)
    })

    const adapter = new RestCryptoMetricsAdapter()
    const result = await adapter.getKpis()

    expect(result.totalRoiPercent).toBe(15.5)
    expect(result.bestAsset?.symbol).toBe('BTC')
  })

  it('getKpis parses a valid camelCase backend API payload from DuckDbMetricsAdapter', async () => {
    const camelCasePayload = {
      totalEquity: '10000.00',
      totalCostBasis: '8000.00',
      totalUnrealizedPnl: '2000.00',
      totalRealizedPnl: '500.00',
      allTimeHigh: '12000.00',
      maxDrawdownPct: '-0.15',
      annualizedVolatility: '0.25',
      sharpeRatio: '1.50',
      currency: 'USD',
      delta24hFiat: '150.00',
      maxDrawdownFiat: '-1500.00',
      recoveredFiat: '500.00',
      winRatePercent: 65,
      totalTrades: 20,
      winningTrades: 13,
      losingTrades: 7,
      averageR: 1.5,
      bestAsset: { symbol: 'BTC', name: 'BTC', allocationPct: 50, roiPct: 25 },
      worstAsset: { symbol: 'ETH', name: 'ETH', allocationPct: 30, roiPct: -10 },
      totalRoiPercent: 31.25,
      totalRoiFiat: '2500.00'
    }

    const { bffClient } = await import('../../http/BffClient')
    // @ts-ignore
    bffClient.api.metrics.kpis.$get.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(camelCasePayload)
    })

    const adapter = new RestCryptoMetricsAdapter()
    const result = await adapter.getKpis()

    expect(result.totalEquityFiat).toBe(10000)
    expect(result.totalCostBasisFiat).toBe(8000)
    expect(result.totalUnrealizedPnlFiat).toBe(2000)
    expect(result.totalRealizedPnlFiat).toBe(500)
    expect(result.totalRoiFiat).toBe(2500)
    expect(result.totalRoiPercent).toBe(31.25)
    expect(result.delta24hFiat).toBe(150)
    expect(result.winRatePercent).toBe(65)
    expect(result.bestAsset?.symbol).toBe('BTC')
    expect(result.worstAsset?.symbol).toBe('ETH')
  })

  it('getKpis handles null bestAsset/worstAsset from backend (portfolio with < 2 assets)', async () => {
    const payloadWithNullAssets = {
      totalEquity: '10000.00',
      totalCostBasis: '8000.00',
      totalUnrealizedPnl: '2000.00',
      totalRealizedPnl: '500.00',
      allTimeHigh: '12000.00',
      maxDrawdownPct: '-0.15',
      annualizedVolatility: '0.25',
      sharpeRatio: '1.50',
      currency: 'EUR',
      delta24hFiat: '150.00',
      maxDrawdownFiat: '-1500.00',
      recoveredFiat: '500.00',
      winRatePercent: 65,
      totalTrades: 20,
      winningTrades: 13,
      losingTrades: 7,
      averageR: 1.5,
      bestAsset: null,
      worstAsset: null,
      totalRoiPercent: 31.25,
      totalRoiFiat: '2500.00',
      excludedFlaggedLots: 0,
    }

    const { bffClient } = await import('../../http/BffClient')
    // @ts-ignore
    bffClient.api.metrics.kpis.$get.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(payloadWithNullAssets)
    })

    const adapter = new RestCryptoMetricsAdapter()
    const result = await adapter.getKpis()

    expect(result.totalEquityFiat).toBe(10000)
    expect(result.bestAsset).toBeUndefined()
    expect(result.worstAsset).toBeUndefined()
  })

  it('emits to errorBus and throws DomainValidationError when API payload is invalid', async () => {
    const invalidPayload = { total_roi_percent: 15.5 }

    const { bffClient } = await import('../../http/BffClient')
    // @ts-ignore
    bffClient.api.metrics.kpis.$get.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(invalidPayload)
    })

    const adapter = new RestCryptoMetricsAdapter()

    await expect(adapter.getKpis()).rejects.toThrow(DomainValidationError)
    expect(errorBus.emit).toHaveBeenCalledWith('validation-error', expect.objectContaining({
      message: 'errors.validation.api_malformed_data',
      context: 'getKpis'
    }))
  })

  it('getDrawdownCurve parses valid payload', async () => {
    const validPayload = [
      { ts: 1672531200, drawdown_percent: -5.4 },
      { ts: 1672617600, drawdown_percent: 0.0 }
    ]

    const { bffClient } = await import('../../http/BffClient')
    // @ts-ignore
    bffClient.api.metrics.drawdown.$get.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(validPayload)
    })

    const adapter = new RestCryptoMetricsAdapter()
    const result = await adapter.getDrawdownCurve('1M')

    expect(result).toHaveLength(2)
    expect(result[0].timestamp).toBe(1672531200)
    expect(result[0].drawdownPercent).toBe(-5.4)
  })

  it('getDrawdownCurve throws DomainValidationError on invalid payload', async () => {
    const invalidPayload = [
      { ts: 1672531200, drawdown_percent: 'not-a-number' }
    ]

    const { bffClient } = await import('../../http/BffClient')
    // @ts-ignore
    bffClient.api.metrics.drawdown.$get.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(invalidPayload)
    })

    const adapter = new RestCryptoMetricsAdapter()
    await expect(adapter.getDrawdownCurve('1M')).rejects.toThrow(DomainValidationError)
  })
})

