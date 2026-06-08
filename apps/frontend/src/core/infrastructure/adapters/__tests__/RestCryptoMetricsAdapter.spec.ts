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
          }
        }
      }
    }
  }
})

describe('RestCryptoMetricsAdapter', () => {
  it('implements ICryptoMetricsRepository interface', () => {
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
    expect(result.bestAsset.symbol).toBe('BTC')
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
})
