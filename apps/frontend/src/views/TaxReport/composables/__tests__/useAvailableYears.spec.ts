import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import { useAvailableYears } from '../useAvailableYears'
import type { TaxTransactionEntity } from '@/core/domain/models/FiscalEntities'
import { TransactionIdSchema } from '@/core/infrastructure/dtos/BrandedTypeSchemas'

describe('useAvailableYears', () => {
  it('computes available years correctly from mock dataset', async () => {
    const mockTxs = [
      { id: TransactionIdSchema.parse('tx-1'), timestamp: new Date('2024-05-01') } as TaxTransactionEntity,
      { id: TransactionIdSchema.parse('tx-2'), timestamp: new Date('2025-06-01') } as TaxTransactionEntity
    ]
    
    const transactions = ref<TaxTransactionEntity[]>(mockTxs)
    const availableYears = useAvailableYears(transactions)
    
    expect(availableYears.value.length).toBeGreaterThan(0)
    expect(availableYears.value[0]).toBeGreaterThanOrEqual(availableYears.value[availableYears.value.length - 1]) // descending order
    expect(availableYears.value.includes(2024)).toBe(true)
    expect(availableYears.value.includes(2025)).toBe(true)
  })

  it('returns current year when transactions are empty', () => {
    const transactions = ref<TaxTransactionEntity[]>([])
    const availableYears = useAvailableYears(transactions)
    
    expect(availableYears.value).toEqual([new Date().getFullYear()])
  })

  it('returns current year when transactions are undefined', () => {
    const transactions = ref<TaxTransactionEntity[] | undefined>(undefined)
    const availableYears = useAvailableYears(transactions)
    
    expect(availableYears.value).toEqual([new Date().getFullYear()])
  })

  it('extracts unique years in descending order', () => {
    const tx1 = { id: TransactionIdSchema.parse('tx-1'), timestamp: new Date('2023-01-01') } as TaxTransactionEntity
    const tx2 = { id: TransactionIdSchema.parse('tx-2'), timestamp: new Date('2025-01-01') } as TaxTransactionEntity
    const tx3 = { id: TransactionIdSchema.parse('tx-3'), timestamp: new Date('2023-12-31') } as TaxTransactionEntity
    
    const transactions = ref<TaxTransactionEntity[]>([tx1, tx2, tx3])
    const availableYears = useAvailableYears(transactions)
    
    expect(availableYears.value).toEqual([2025, 2023]) // Unique and descending
  })
})
