/**
 * The anti-corruption boundary for the display-currency fields.
 *
 * A conversion outcome is the one field on this response whose *absence* is indistinguishable
 * from a successful conversion once it reaches a component: an amount with no outcome renders
 * exactly like a converted one. So the boundary refuses it rather than defaulting it.
 */

import { describe, it, expect, vi } from 'vitest'
import {
  ExternalPortfolioSummarySchema,
  ExternalSummaryHoldingSchema,
} from '../ExternalPortfolioSchemas'

const CONVERTED = {
  kind: 'CONVERTED',
  amount: '1088.00',
  currency: 'USD',
  rate: '1.088',
  rateDate: '2024-03-14',
} as const

function holdingPayload(costBasis: unknown) {
  return {
    id: 'asset-001',
    symbol: 'BTC',
    amount: '0.5',
    avg_price_fiat: '62000',
    current_value_fiat: '31000',
    cost_basis_fiat: '1088.00',
    unrealized_pnl_fiat: '1000',
    pnl_fiat: '1000',
    currency: 'USD',
    portfolio_locations: ['Ledger'],
    cost_basis: costBasis,
  }
}

function summaryPayload(costBasis: unknown) {
  return {
    metrics: {
      total_equity_fiat: '31000',
      total_cost_basis_fiat: '1088.00',
      total_realized_pnl_fiat: '0',
      total_unrealized_pnl_fiat: '1000',
      total_pnl_fiat: '1000',
      currency: 'USD',
      rates_incomplete: true,
      prices_incomplete: false,
    },
    holdings: [holdingPayload(costBasis)],
  }
}

describe('display-currency fields cross the boundary parsed (task 9.1)', () => {
  it('maps the snake_case incompleteness signals onto camelCase domain fields', () => {
    const result = ExternalPortfolioSummarySchema.safeParse(summaryPayload(CONVERTED))

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.metrics.ratesIncomplete).toBe(true)
    expect(result.data.metrics.pricesIncomplete).toBe(false)
  })

  it('keeps the two incompleteness signals separate rather than collapsing them', () => {
    const raw = summaryPayload(CONVERTED)
    raw.metrics.rates_incomplete = false
    raw.metrics.prices_incomplete = true

    const result = ExternalPortfolioSummarySchema.safeParse(raw)

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.metrics.ratesIncomplete).toBe(false)
    expect(result.data.metrics.pricesIncomplete).toBe(true)
  })

  it('carries the applied rate and its date through to the domain holding', () => {
    const result = ExternalSummaryHoldingSchema.safeParse(holdingPayload(CONVERTED))

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.costBasis).toEqual({
      kind: 'CONVERTED',
      amount: '1088.00',
      currency: 'USD',
      rate: '1.088',
      rateDate: '2024-03-14',
    })
  })

  it('carries the native amount and native currency of an unconvertible figure', () => {
    const result = ExternalSummaryHoldingSchema.safeParse(
      holdingPayload({
        kind: 'UNCONVERTIBLE',
        nativeAmount: '1000.00',
        nativeCurrency: 'EUR',
        requested: 'USD',
      }),
    )

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.costBasis).toEqual({
      kind: 'UNCONVERTIBLE',
      nativeAmount: '1000.00',
      nativeCurrency: 'EUR',
      requested: 'USD',
    })
  })

  it('accepts the native arm without a rate, and refuses a rate attached to it', () => {
    const native = { kind: 'NATIVE', amount: '1000.00', currency: 'USD' }

    expect(ExternalSummaryHoldingSchema.safeParse(holdingPayload(native)).success).toBe(true)
    expect(
      ExternalSummaryHoldingSchema.safeParse(holdingPayload({ ...native, rate: '1' })).success,
    ).toBe(false)
  })
})

describe('an unusable conversion outcome is refused, never defaulted (task 9.2)', () => {
  it('rejects a holding whose conversion outcome is absent', () => {
    const raw = holdingPayload(CONVERTED)
    delete (raw as { cost_basis?: unknown }).cost_basis

    expect(ExternalSummaryHoldingSchema.safeParse(raw).success).toBe(false)
  })

  it('rejects a holding whose conversion outcome is unrecognised', () => {
    expect(
      ExternalSummaryHoldingSchema.safeParse(
        holdingPayload({ kind: 'ESTIMATED', amount: '1088.00', currency: 'USD' }),
      ).success,
    ).toBe(false)
  })

  it('rejects a summary whose incompleteness signals are absent', () => {
    const raw = summaryPayload(CONVERTED)
    delete (raw.metrics as { rates_incomplete?: unknown }).rates_incomplete

    expect(ExternalPortfolioSummarySchema.safeParse(raw).success).toBe(false)
  })
})

describe('the refusal reaches the error bus rather than failing silently (task 9.2)', () => {
  it('emits a validation error and throws when the outcome is unrecognised', async () => {
    vi.resetModules()
    vi.doMock('@/core/infrastructure/http/BffClient', () => ({
      bffClient: {
        api: {
          portfolio: {
            summary: {
              $get: vi.fn().mockResolvedValue({
                ok: true,
                json: () =>
                  Promise.resolve(
                    summaryPayload({ kind: 'ESTIMATED', amount: '1088.00', currency: 'USD' }),
                  ),
              }),
            },
          },
        },
      },
    }))

    const { RestCryptoAdapter } = await import('../../adapters/RestCryptoAdapter')
    const { errorBus } = await import('../../errors/errorBus')

    const listener = vi.fn()
    errorBus.on('validation-error', listener)

    await expect(new RestCryptoAdapter().getSummary()).rejects.toThrow()
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ context: 'getSummary' }))

    errorBus.off('validation-error', listener)
    vi.doUnmock('@/core/infrastructure/http/BffClient')
    vi.resetModules()
  })
})
