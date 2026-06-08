import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MockCryptoAdapter } from '@/core/infrastructure/adapters/MockCryptoAdapter'
import { MockTaxAdapter } from '@/core/infrastructure/adapters/MockTaxAdapter'
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

describe('MockCryptoAdapter', () => {
  let adapter: MockCryptoAdapter

  beforeEach(() => {
    adapter = new MockCryptoAdapter()
    vi.useFakeTimers()
  })

  it('implements ICryptoPortfolioRepository interface', () => {
    expect(typeof adapter.getSummary).toBe('function')
    expect(typeof adapter.getTokenDetails).toBe('function')
    expect(typeof adapter.getTokenHistory).toBe('function')
    expect(typeof adapter.getIngestionStatus).toBe('function')
    expect(typeof adapter.triggerRebuild).toBe('function')
  })

  it('getSummary returns a PortfolioSummaryEntity shape', async () => {
    const summaryPromise = adapter.getSummary()
    await vi.runAllTimersAsync()
    const summary = await summaryPromise

    expect(summary).toBeDefined()
    expect(typeof summary.metrics.totalEquityEur).toBe('number')
    expect(summary.holdings.length).toBeGreaterThan(0)
  })
})

describe('MockTaxAdapter', () => {
  let adapter: MockTaxAdapter

  beforeEach(() => {
    adapter = new MockTaxAdapter()
    vi.useFakeTimers()
  })

  it('implements ITaxRepository interface', () => {
    expect(typeof adapter.getSpotTransactions).toBe('function')
    expect(typeof adapter.getReport).toBe('function')
  })

  it('getSpotTransactions returns an array of TaxTransactionEntity', async () => {
    const txsPromise = adapter.getSpotTransactions()
    await vi.runAllTimersAsync()
    const txs = await txsPromise

    expect(Array.isArray(txs)).toBe(true)
    expect(txs.length).toBeGreaterThan(0)
  })

  it('getReport returns a TaxReportEntity shape', async () => {
    const reportPromise = adapter.getReport(2024, 'FIFO')
    await vi.runAllTimersAsync()
    const report = await reportPromise

    expect(report.year).toBe(2024)
    expect(typeof report.summary.capitalGainsEur).toBe('number')
  })
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
