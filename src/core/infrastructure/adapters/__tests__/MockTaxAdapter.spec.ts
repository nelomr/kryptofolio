import { describe, it, expect, beforeEach } from 'vitest'
import { MockTaxAdapter } from '../MockTaxAdapter'
import { TaxOperationError } from '../../errors/TaxOperationError'

describe('MockTaxAdapter', () => {
  let adapter: MockTaxAdapter

  beforeEach(() => {
    adapter = new MockTaxAdapter()
  })

  it('seed dataset covers all transaction types and spans across years', async () => {
    const txs = await adapter.getTransactions()
    
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

  it('getReport returns non-empty structured data', async () => {
    const report = await adapter.getReport(2024, 'FIFO')
    expect(report.year).toBe(2024)
    expect(report.summary.capitalGainsEur).toBeGreaterThan(0)
    expect(report.auditTrail.length).toBeGreaterThan(0)
  })

  it('deleteTransaction mutates internal state', async () => {
    const txs = await adapter.getTransactions()
    const initialCount = txs.length
    const idToDelete = txs[0].id

    await adapter.deleteTransaction(idToDelete)

    const updatedTxs = await adapter.getTransactions()
    expect(updatedTxs.length).toBe(initialCount - 1)
    expect(updatedTxs.find(t => t.id === idToDelete)).toBeUndefined()
  })

  it('deleteAllTransactions clears all transactions', async () => {
    await adapter.deleteAllTransactions()
    
    const txs = await adapter.getTransactions()
    expect(txs.length).toBe(0)
  })

  it('uploadTaxFile with an unknown format throws TaxOperationError UPLOAD_FAILED', async () => {
    const fakeCsv = `bad_header1,bad_header2\n1,2`
    const file = new File([fakeCsv], 'bad.csv', { type: 'text/csv' })

    await expect(adapter.uploadTaxFile(file)).rejects.toThrow(TaxOperationError)
    await expect(adapter.uploadTaxFile(file)).rejects.toMatchObject({ code: 'UPLOAD_FAILED' })
  })

  it('uploadTaxFile appends new transactions from known CSV', async () => {
    const initialTxs = await adapter.getTransactions()
    const initialCount = initialTxs.length

    // Minimum viable BitUnix CSV
    const csvContent = `Date (UTC),Label,Outgoing Asset,Outgoing Amount,Incoming Asset,Incoming Amount,Fee Asset,Fee Amount,Trx. ID,Comment\n2025-01-01 10:00:00,deposit,,0,ADA,100,,0,tx-123,`
    
    const fakeFile = new File([csvContent], 'bitunix.csv', { type: 'text/csv' })

    await adapter.uploadTaxFile(fakeFile)

    const updatedTxs = await adapter.getTransactions()
    expect(updatedTxs.length).toBeGreaterThan(initialCount)
    
    // The newly parsed entity should be at the end (or we just check if it exists)
    const addedTx = updatedTxs.find(t => String(t.id).includes('tx-123'))
    expect(addedTx).toBeDefined()
    expect(addedTx?.type).toBe('DEPOSIT')
    expect(addedTx?.symbol).toBe('ADA')
  })
})
