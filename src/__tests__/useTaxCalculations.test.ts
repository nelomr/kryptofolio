import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import { useSmartYearLogic, usePagination } from '@/views/TaxReport/composables/useTaxCalculations'
import type { TaxTransactionEntity } from '@/core/domain/models/FiscalEntities'
import { TransactionIdSchema } from '@/core/domain/models/BrandedTypes'

const dummyTx = (year: number): TaxTransactionEntity => ({
  id: TransactionIdSchema.parse(`tx-${Math.random()}`),
  type: 'BUY',
  symbol: 'BTC',
  amount: 1,
  totalEur: 1000,
  priceEur: 1000,
  feeEur: 0,
  timestamp: new Date(`${year}-06-15T10:00:00Z`),
})

describe('Tax Calculations Composables', () => {
  describe('useSmartYearLogic', () => {
    it('returns current year if no transactions exist', () => {
      const txs = ref<TaxTransactionEntity[]>([])
      const { smartYear } = useSmartYearLogic(txs)
      expect(smartYear.value).toBe(new Date().getFullYear())
    })

    it('returns the year with the most transactions', () => {
      const txs = ref<TaxTransactionEntity[]>([
        dummyTx(2023),
        dummyTx(2024),
        dummyTx(2024),
        dummyTx(2024),
        dummyTx(2025),
        dummyTx(2025),
      ])
      const { smartYear } = useSmartYearLogic(txs)
      expect(smartYear.value).toBe(2024)
    })

    it('returns the most recent year if there is a tie', () => {
      const txs = ref<TaxTransactionEntity[]>([
        dummyTx(2024),
        dummyTx(2024),
        dummyTx(2025),
        dummyTx(2025),
      ])
      const { smartYear } = useSmartYearLogic(txs)
      expect(smartYear.value).toBe(2025)
    })
  })

  describe('usePagination', () => {
    it('paginates data correctly', () => {
      const data = ref([1, 2, 3, 4, 5])
      const { paginatedData, totalPages, totalItems } = usePagination(data, 2)
      
      expect(totalItems.value).toBe(5)
      expect(totalPages.value).toBe(3)
      expect(paginatedData.value).toEqual([1, 2]) // Page 1
    })

    it('can navigate pages', () => {
      const data = ref([1, 2, 3, 4, 5])
      const { paginatedData, currentPage, nextPage, prevPage, goToPage } = usePagination(data, 2)
      
      expect(currentPage.value).toBe(1)
      
      nextPage()
      expect(currentPage.value).toBe(2)
      expect(paginatedData.value).toEqual([3, 4])
      
      goToPage(3)
      expect(currentPage.value).toBe(3)
      expect(paginatedData.value).toEqual([5])
      
      prevPage()
      expect(currentPage.value).toBe(2)
      
      // Prevent out of bounds
      nextPage()
      nextPage()
      nextPage()
      expect(currentPage.value).toBe(3)
    })

    it('calculates display ranges correctly', () => {
      const data = ref([1, 2, 3, 4, 5])
      const { rangeStart, rangeEnd, nextPage } = usePagination(data, 2)
      
      expect(rangeStart.value).toBe(1)
      expect(rangeEnd.value).toBe(2)
      
      nextPage()
      expect(rangeStart.value).toBe(3)
      expect(rangeEnd.value).toBe(4)
      
      nextPage()
      expect(rangeStart.value).toBe(5)
      expect(rangeEnd.value).toBe(5)
    })
  })
})
