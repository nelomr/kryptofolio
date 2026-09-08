import { describe, it, expect, vi } from 'vitest'
import { RestCryptoAdapter } from '@/core/infrastructure/adapters/RestCryptoAdapter'
import { RestTaxAdapter } from '@/core/infrastructure/adapters/RestTaxAdapter'
import { errorBus } from '@/core/infrastructure/errors/errorBus'

vi.mock('../core/infrastructure/http/BffClient', () => {
  return {
    bffClient: {
      api: {
        portfolio: {
          summary: {
            $get: vi.fn().mockResolvedValue({
              ok: true,
              json: vi.fn().mockResolvedValue({
                metrics: { 
                  total_equity_fiat: 5000,
                  total_realized_pnl_fiat: 500,
                  total_unrealized_pnl_fiat: 500,
                  currency: 'USD'
                },
                holdings: [
                  {
                    id: '1',
                    symbol: 'BTC',
                    amount: 1,
                    avg_price_fiat: 1000,
                    current_value_fiat: 2000,
                    cost_basis_fiat: 1000,
                    unrealized_pnl_fiat: 1000,
                    pnl_fiat: 1500,
                    currency: 'USD',
                    portfolio_locations: []
                  }
                ]
              })
            })
          },
          token: {
            ':symbol': {
              $get: vi.fn().mockResolvedValue({
                ok: true,
                json: vi.fn().mockResolvedValue({
                  id: '1', symbol: 'BTC', amount: 1, avg_price_fiat: 1000,
                  current_value_fiat: 2000, cost_basis_fiat: 1000, unrealized_pnl_fiat: 1000,
                  pnl_fiat: 1500, currency: 'USD', portfolio_locations: []
                })
              }),
              history: {
                $get: vi.fn().mockResolvedValue({
                  ok: true,
                  json: vi.fn().mockResolvedValue({ lots: [], history: {} })
                })
              }
            }
          },
          rebuild: {
            $post: vi.fn().mockResolvedValue({ ok: true })
          }
        },
        tax: {
          transactions: {
            spot: {
              $get: vi.fn().mockResolvedValue({
                ok: true,
                json: vi.fn().mockResolvedValue([
                  {
                    id: '1',
                    symbol: 'BTC',
                    type: 'BUY',
                    amount: 1,
                    totalEur: 1000,
                    priceEur: 1000,
                    feeEur: 0,
                    timestamp: new Date().toISOString(),
                    exchange: 'kraken'
                  }
                ])
              })
            },
            futures: {
              $get: vi.fn().mockResolvedValue({
                ok: true,
                json: vi.fn().mockResolvedValue([])
              })
            },
            invalid: {
              $get: vi.fn().mockResolvedValue({
                ok: true,
                json: vi.fn().mockResolvedValue([])
              })
            }
          },
          report: {
            $get: vi.fn().mockResolvedValue({
              ok: true,
              json: vi.fn().mockResolvedValue({
                year: 2024,
                method: 'FIFO',
                summary: {
                  capitalGains: '500',
                  capitalLosses: '0',
                  savingsBaseYields: '0',
                  generalBaseAirdrops: '0',
                  netPatrimonialResult: '500',
                  estimatedIrpf: '100'
                },
                auditTrail: []
              })
            })
          }
        },
        ingestion: {
          status: {
            $get: vi.fn().mockResolvedValue({
              ok: true,
              json: vi.fn().mockResolvedValue({ status: 'idle', progress: 0, message: '', processedCount: 0, totalCount: 0 })
            })
          }
        }
      }
    }
  }
})


describe('RestCryptoAdapter — Zod validation failure → error bus', () => {
  it('emits to errorBus when the API returns malformed data', async () => {
    const errorListener = vi.fn()
    errorBus.on('validation-error', errorListener)

    // Intercept bffClient for this test
    const { bffClient } = await import('../core/infrastructure/http/BffClient')

    // @ts-ignore
    bffClient.api.portfolio.summary.$get.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ metrics: 'CORRUPT_DATA', holdings: null })
    })

    const adapter = new RestCryptoAdapter()

    await expect(adapter.getSummary()).rejects.toThrow()
    expect(errorListener).toHaveBeenCalledTimes(1)

    errorBus.off('validation-error', errorListener)
  })
})

// ---------------------------------------------------------------------------
// RestTaxAdapter.getFuturesDerivatives — regression guard against a repeat.
//
// Drives the adapter against the emitter's real shape end to end (route +
// schema + adapter), so a future schema/route drift fails here rather than
// silently returning `[]`.
// ---------------------------------------------------------------------------

const VALID_FUTURES_ROW = {
  id: 'ftx-valid',
  id_hash: 'hash-valid',
  account_id: 'acc-1',
  exchange: 'Kraken Futures',
  tx_type: 'TRADE',
  symbol: 'pf_btcusd',
  amount: '0.5',
  trade_price: '60000',
  realized_pnl: '2000',
  funding_amount: '-1.5',
  fee_amount: '5.0',
  fiat_currency: 'EUR',
  timestamp: '2024-03-10T10:00:00Z',
  status: 'CLOSED',
}

const MALFORMED_FUTURES_ROW = {
  // no `id`, no `tx_type` — fails the schema entirely
  symbol: 'pf_ethusd',
}

describe('RestTaxAdapter.getFuturesDerivatives — one bad row does not empty the table', () => {
  it('returns the one valid entity and reports exactly one rejection for one malformed row', async () => {
    const errorListener = vi.fn()
    errorBus.on('validation-error', errorListener)

    const { bffClient } = await import('../core/infrastructure/http/BffClient')
    // @ts-ignore
    bffClient.api.tax.transactions.futures.$get.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([VALID_FUTURES_ROW, MALFORMED_FUTURES_ROW]),
    })

    const adapter = new RestTaxAdapter()
    const result = await adapter.getFuturesDerivatives()

    expect(result).toHaveLength(1)
    expect(result[0].contractSymbol).toBe('pf_btcusd')
    expect(result[0].realizedPnl).toBe(2000)
    expect(errorListener).toHaveBeenCalledTimes(1)
    expect(errorListener).toHaveBeenCalledWith(
      expect.objectContaining({
        context: 'getFuturesDerivatives',
        details: expect.objectContaining({ rejected: 1, accepted: 1 }),
      }),
    )

    errorBus.off('validation-error', errorListener)
  })

  it('emits exactly one validation-error for many malformed rows in a single call', async () => {
    const errorListener = vi.fn()
    errorBus.on('validation-error', errorListener)

    const { bffClient } = await import('../core/infrastructure/http/BffClient')
    const manyBadRows = Array.from({ length: 100 }, () => MALFORMED_FUTURES_ROW)
    // @ts-ignore
    bffClient.api.tax.transactions.futures.$get.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(manyBadRows),
    })

    const adapter = new RestTaxAdapter()
    const result = await adapter.getFuturesDerivatives()

    expect(result).toHaveLength(0)
    expect(errorListener).toHaveBeenCalledTimes(1)
    expect(errorListener).toHaveBeenCalledWith(
      expect.objectContaining({
        details: expect.objectContaining({ rejected: 100, accepted: 0 }),
      }),
    )

    errorBus.off('validation-error', errorListener)
  })
})
