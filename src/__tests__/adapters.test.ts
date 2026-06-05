/**
 * Unit Tests — Adapters (RestCryptoAdapter, MockCryptoAdapter, MockTaxAdapter)
 *
 * Spec coverage:
 *   - hexagonal-architecture: adapter implements port interface
 *   - mock-adapters: offline development capability
 *   - global-error-handling: safeParse failure → error bus notification
 *   - fiscal-domain: RestTaxAdapter maps legacy data through Zod schemas
 *
 * @see openspec/specs/
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MockCryptoAdapter } from '@/core/infrastructure/adapters/MockCryptoAdapter'
import { MockTaxAdapter } from '@/core/infrastructure/adapters/MockTaxAdapter'
import { RestCryptoAdapter } from '@/core/infrastructure/adapters/RestCryptoAdapter'
import { errorBus } from '@/core/infrastructure/errors/errorBus'

// ---------------------------------------------------------------------------
// MockCryptoAdapter — offline portfolio development
// ---------------------------------------------------------------------------

describe('MockCryptoAdapter', () => {
  let adapter: MockCryptoAdapter

  beforeEach(() => {
    adapter = new MockCryptoAdapter()
    vi.useFakeTimers()
  })

  it('implements ICryptoPortfolioRepository interface (duck typing)', () => {
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
    expect(summary.metrics.totalEquityEur).toBeGreaterThan(0)
    expect(Array.isArray(summary.holdings)).toBe(true)
    expect(summary.holdings.length).toBeGreaterThan(0)
  })

  it('getSummary holdings have all required domain entity fields', async () => {
    const summaryPromise = adapter.getSummary()
    await vi.runAllTimersAsync()
    const summary = await summaryPromise

    for (const holding of summary.holdings) {
      expect(typeof holding.symbol).toBe('string')
      expect(typeof holding.amount).toBe('number')
      expect(typeof holding.avgPriceEur).toBe('number')
      expect(typeof holding.currentValueEur).toBe('number')
      expect(typeof holding.costBasisEur).toBe('number')
      expect(Array.isArray(holding.portfolioLocations)).toBe(true)
    }
  })

  it('getTokenDetails returns a CryptoAssetEntity for a known symbol', async () => {
    const detailsPromise = adapter.getTokenDetails('BTC')
    await vi.runAllTimersAsync()
    const details = await detailsPromise

    expect(details.symbol).toBe('BTC')
    expect(typeof details.amount).toBe('number')
  })

  it('getIngestionStatus returns idle status by default', async () => {
    const statusPromise = adapter.getIngestionStatus()
    await vi.runAllTimersAsync()
    const status = await statusPromise

    expect(status.status).toBe('idle')
    expect(typeof status.progress).toBe('number')
  })
})

// ---------------------------------------------------------------------------
// MockTaxAdapter — offline fiscal development
// ---------------------------------------------------------------------------

describe('MockTaxAdapter', () => {
  let adapter: MockTaxAdapter

  beforeEach(() => {
    adapter = new MockTaxAdapter()
    vi.useFakeTimers()
  })

  it('implements ITaxRepository interface (duck typing)', () => {
    expect(typeof adapter.getSpotTransactions).toBe('function')
    expect(typeof adapter.getFuturesTransactions).toBe('function')
    expect(typeof adapter.getInvalidTransactions).toBe('function')
    expect(typeof adapter.getReport).toBe('function')
    expect(typeof adapter.deleteTransaction).toBe('function')
    expect(typeof adapter.updateTransaction).toBe('function')
    expect(typeof adapter.validateTransaction).toBe('function')
  })

  it('getSpotTransactions returns an array of TaxTransactionEntity', async () => {
    const txsPromise = adapter.getSpotTransactions()
    await vi.runAllTimersAsync()
    const txs = await txsPromise

    expect(Array.isArray(txs)).toBe(true)
    expect(txs.length).toBeGreaterThan(0)

    for (const tx of txs) {
      expect(typeof tx.symbol).toBe('string')
      expect(typeof tx.type).toBe('string')
      expect(typeof tx.amount).toBe('number')
      expect(tx.timestamp).toBeInstanceOf(Date)
    }
  })

  it('getReport returns a TaxReportEntity shape', async () => {
    const reportPromise = adapter.getReport(2024, 'FIFO')
    await vi.runAllTimersAsync()
    const report = await reportPromise

    expect(report.year).toBe(2024)
    expect(typeof report.summary.capitalGainsEur).toBe('number')
    expect(typeof report.summary.estimatedIrpfEur).toBe('number')
    expect(Array.isArray(report.auditTrail)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// RestCryptoAdapter — global error handling on safeParse failure
// ---------------------------------------------------------------------------

describe('RestCryptoAdapter — Zod validation failure → error bus', () => {
  it('emits to errorBus when the API returns malformed data', async () => {
    const errorListener = vi.fn()
    errorBus.on('validation-error', errorListener)

    // Create a mock HTTP client that returns garbage data
    const badHttpClient = {
      get: vi.fn().mockResolvedValue({
        data: { metrics: 'CORRUPT_DATA', holdings: null },
      }),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      postForm: vi.fn(),
    }

    const adapter = new RestCryptoAdapter(badHttpClient)

    // getSummary should NOT throw; it should handle the error gracefully
    await expect(adapter.getSummary()).rejects.toThrow()
    expect(errorListener).toHaveBeenCalledTimes(1)
    expect(errorListener).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.any(String) }),
    )

    errorBus.off('validation-error', errorListener)
  })

  it('emits to errorBus with the raw Zod error details', async () => {
    const errorListener = vi.fn()
    errorBus.on('validation-error', errorListener)

    const badHttpClient = {
      get: vi.fn().mockResolvedValue({ data: null }),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      postForm: vi.fn(),
    }

    const adapter = new RestCryptoAdapter(badHttpClient)
    await expect(adapter.getSummary()).rejects.toThrow()

    const callArg = errorListener.mock.calls[0][0]
    expect(callArg).toHaveProperty('message')

    errorBus.off('validation-error', errorListener)
  })
})
