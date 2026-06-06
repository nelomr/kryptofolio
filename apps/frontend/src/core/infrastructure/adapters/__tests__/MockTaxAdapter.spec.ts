import { describe, it, expect, beforeEach } from 'vitest'
import { MockTaxAdapter } from '../MockTaxAdapter'
import { TaxOperationError } from '../../errors/TaxOperationError'

describe('MockTaxAdapter', () => {
  let adapter: MockTaxAdapter

  beforeEach(() => {
    adapter = new MockTaxAdapter()
  })

  it('seed dataset covers all transaction types and spans across years', async () => {
    const txs = await adapter.getSpotTransactions()
    
    // Check it's not empty
    expect(txs.length).toBeGreaterThan(0)
    
    // Check types
    const types = new Set(txs.map(t => t.type))
    expect(types.has('BUY')).toBe(true)
    expect(types.has('SELL')).toBe(true)
    expect(types.has('DEPOSIT')).toBe(true)
    expect(types.has('WITHDRAWAL')).toBe(true)
    expect(types.has('REWARD')).toBe(true)

    // Check years
    const years = new Set(txs.map(t => t.timestamp.getFullYear()))
    expect(years.size).toBeGreaterThanOrEqual(2)
  })

  it('getInvalidTransactions returns edge-case entries', async () => {
    const invalidTxs = await adapter.getInvalidTransactions()
    expect(invalidTxs.length).toBeGreaterThan(0)
    expect(invalidTxs[0].type).toBeDefined()
  })

  it('getReport(2024) returns non-empty structured data', async () => {
    const report = await adapter.getReport(2024, 'FIFO')
    expect(report.year).toBe(2024)
    expect(report.method).toBe('FIFO')
    expect(report.summary.capitalGainsEur).toBeGreaterThan(0)
    expect(report.auditTrail.length).toBeGreaterThan(0)
  })

  // ---------------------------------------------------------------------------
  // 2025 mock report — added as part of tax-audit-and-report feature
  // ---------------------------------------------------------------------------

  it('getReport(2025) returns a valid FIFO report with rich audit trail', async () => {
    const report = await adapter.getReport(2025, 'FIFO')
    expect(report.year).toBe(2025)
    expect(report.method).toBe('FIFO')
    expect(report.summary.capitalGainsEur).toBeGreaterThan(0)
    expect(report.summary.capitalLossesEur).toBeGreaterThan(0)
    expect(report.auditTrail.length).toBeGreaterThan(0)
  })

  it('getReport(2025) audit trail contains both taxable and non-taxable events', async () => {
    const report = await adapter.getReport(2025, 'FIFO')
    const taxable = report.auditTrail.filter(e => e.isTaxable)
    const exempt = report.auditTrail.filter(e => !e.isTaxable)
    expect(taxable.length).toBeGreaterThan(0)
    expect(exempt.length).toBeGreaterThan(0)
  })

  it('getReport(2025) audit trail contains gain and loss events', async () => {
    const report = await adapter.getReport(2025, 'FIFO')
    const gains = report.auditTrail.filter(e => e.isTaxable && e.gainLossEur > 0)
    const losses = report.auditTrail.filter(e => e.isTaxable && e.gainLossEur < 0)
    expect(gains.length).toBeGreaterThan(0)
    expect(losses.length).toBeGreaterThan(0)
  })

  it('getReport with unknown year returns empty audit trail and zero summary', async () => {
    const report = await adapter.getReport(2000, 'FIFO')
    expect(report.year).toBe(2000)
    expect(report.auditTrail.length).toBe(0)
    expect(report.summary.capitalGainsEur).toBe(0)
    expect(report.summary.estimatedIrpfEur).toBe(0)
  })

  // ---------------------------------------------------------------------------
  // downloadReport — new method for PDF/CSV export
  // ---------------------------------------------------------------------------

  it('downloadReport returns a non-empty Blob for year 2024', async () => {
    const blob = await adapter.downloadReport(2024, 'pdf')
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.size).toBeGreaterThan(0)
  })

  it('downloadReport returns a non-empty Blob for year 2025', async () => {
    const blob = await adapter.downloadReport(2025, 'csv')
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.size).toBeGreaterThan(0)
  })

  it('downloadReport PDF blob contains fiscal summary data for 2025', async () => {
    const blob = await adapter.downloadReport(2025, 'pdf')
    const text = await blob.text()
    expect(text).toContain('2025')
    expect(text).toContain('FIFO')
    expect(text).toContain('Ganancias patrimoniales')
  })

  it('downloadReport CSV blob has correct MIME type', async () => {
    const blob = await adapter.downloadReport(2024, 'csv')
    expect(blob.type).toContain('text/csv')
  })

  it('downloadReport for unknown year returns a Blob with fallback message', async () => {
    const blob = await adapter.downloadReport(1990, 'csv')
    const text = await blob.text()
    expect(text).toContain('Sin datos')
  })

  // ---------------------------------------------------------------------------
  // Mutation tests (unchanged, kept for regression)
  // ---------------------------------------------------------------------------

  it('deleteTransaction mutates internal state', async () => {
    const txs = await adapter.getSpotTransactions()
    const initialCount = txs.length
    const idToDelete = txs[0].id

    await adapter.deleteTransaction(idToDelete)

    const updatedTxs = await adapter.getSpotTransactions()
    expect(updatedTxs.length).toBe(initialCount - 1)
    expect(updatedTxs.find(t => t.id === idToDelete)).toBeUndefined()
  })

  it('deleteAllTransactions clears all transactions', async () => {
    // Should be empty after bulk delete
    await adapter.deleteAllTransactions('spot')

    const txs = await adapter.getSpotTransactions()
    expect(txs.length).toBe(0)
  })

  it('uploadTaxFile with an unknown format throws TaxOperationError UPLOAD_FAILED', async () => {
    const fakeCsv = `bad_header1,bad_header2\n1,2`
    const file = new File([fakeCsv], 'bad.csv', { type: 'text/csv' })

    await expect(adapter.uploadTaxFile(file, 'spot')).rejects.toThrow(TaxOperationError)
    await expect(adapter.uploadTaxFile(file, 'spot')).rejects.toMatchObject({ code: 'UPLOAD_FAILED' })
  })

  it('uploadTaxFile appends new transactions from known CSV', async () => {
    const initialTxs = await adapter.getSpotTransactions()
    const initialCount = initialTxs.length

    // Minimum viable BitUnix CSV
    const csvContent = `Date (UTC),Label,Outgoing Asset,Outgoing Amount,Incoming Asset,Incoming Amount,Fee Asset,Fee Amount,Trx. ID,Comment\n2025-01-01 10:00:00,deposit,,0,ADA,100,,0,tx-123,`
    
    const fakeFile = new File([csvContent], 'bitunix.csv', { type: 'text/csv' })

    await adapter.uploadTaxFile(fakeFile, 'spot')

    const updatedTxs = await adapter.getSpotTransactions()
    expect(updatedTxs.length).toBeGreaterThan(initialCount)
    
    // The newly parsed entity should be at the end (or we just check if it exists)
    const addedTx = updatedTxs.find(t => String(t.id).includes('tx-123'))
    expect(addedTx).toBeDefined()
    expect(addedTx?.symbol).toBe('ADA')
  })
})
