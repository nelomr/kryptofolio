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
                  totalEquityEur: 5000,
                  totalRealizedPnlEur: 500,
                  totalUnrealizedPnlEur: 500
                },
                holdings: [
                  {
                    id: '1',
                    symbol: 'BTC',
                    amount: 1,
                    avgPriceEur: 1000,
                    currentValueEur: 2000,
                    costBasisEur: 1000,
                    unrealizedPnlEur: 1000,
                    pnlEur: 1500,
                    portfolioLocations: []
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
                  id: '1', symbol: 'BTC', amount: 1, avgPriceEur: 1000,
                  currentValueEur: 2000, costBasisEur: 1000, unrealizedPnlEur: 1000,
                  pnlEur: 1500, portfolioLocations: []
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
                  capitalGainsEur: 500,
                  capitalLossesEur: 0,
                  savingsBaseYieldsEur: 0,
                  generalBaseAirdropsEur: 0,
                  netPatrimonialResultEur: 500,
                  estimatedIrpfEur: 100
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
