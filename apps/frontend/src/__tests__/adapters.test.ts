import { describe, it, expect, vi } from 'vitest'
import { RestCryptoAdapter } from '@/core/infrastructure/adapters/RestCryptoAdapter'
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
            'futures-derivatives': {
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
