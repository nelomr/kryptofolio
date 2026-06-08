import { describe, it, expect, vi } from 'vitest'
import { MockTaxAdapter } from '../MockTaxAdapter'

vi.mock('../../http/BffClient', () => {
  return {
    bffClient: {
      api: {
        tax: {
          transactions: {
            spot: {
              $get: vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve([{
                  id: 'tx-001',
                  type: 'BUY',
                  symbol: 'BTC',
                  amount: 0.5,
                  totalEur: 10000,
                  priceEur: 20000,
                  feeEur: 5,
                  timestamp: '2023-01-01T10:00:00Z',
                  exchange: 'Kraken'
                }])
              })
            }
          },
          report: {
            $get: vi.fn().mockResolvedValue({
              ok: true,
              json: () => Promise.resolve({
                year: 2024,
                method: 'FIFO',
                summary: {
                  capitalGainsEur: 1800,
                  capitalLossesEur: 300,
                  savingsBaseYieldsEur: 35,
                  generalBaseAirdropsEur: 0,
                  netPatrimonialResultEur: 1500,
                  estimatedIrpfEur: 285
                },
                auditTrail: []
              })
            }),
            download: {
              $get: vi.fn().mockResolvedValue({
                ok: true,
                blob: () => Promise.resolve(new Blob(['PDF content']))
              })
            }
          }
        }
      }
    }
  }
})

describe('MockTaxAdapter', () => {
  it('fetches transactions via Hono RPC', async () => {
    const adapter = new MockTaxAdapter()
    const txs = await adapter.getSpotTransactions()
    expect(txs).toHaveLength(1)
    expect(txs[0].id).toBe('tx-001')
  })

  it('fetches tax report via Hono RPC', async () => {
    const adapter = new MockTaxAdapter()
    const report = await adapter.getReport(2024, 'FIFO')
    expect(report.year).toBe(2024)
    expect(report.summary.capitalGainsEur).toBe(1800)
  })

  it('downloadReport returns a valid Blob', async () => {
    const adapter = new MockTaxAdapter()
    const blob = await adapter.downloadReport(2024, 'pdf')
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.size).toBeGreaterThan(0)
  })
})
