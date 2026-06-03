import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import {
  useSmartYearLogic,
  usePagination,
  getEventVariant,
  gainLossClass,
  BADGE_CLASSES,
  BADGE_I18N_KEYS,
} from '@/views/TaxReport/composables/useTaxCalculations'
import type { TaxTransactionEntity, TaxLotHistoryEvent } from '@/core/domain/models/FiscalEntities'
import { TransactionIdSchema } from '@/core/infrastructure/dtos/BrandedTypeSchemas'

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

// ---------------------------------------------------------------------------
// Helpers to build minimal TaxLotHistoryEvent fixtures
// ---------------------------------------------------------------------------

const lotEvent = (overrides: Partial<TaxLotHistoryEvent> = {}): TaxLotHistoryEvent => ({
  id: `lot-${Math.random()}`,
  disposalDate: new Date('2025-01-01'),
  amountFromLot: 1,
  salePriceEur: 100,
  gainLossEur: 50,
  isTaxable: true,
  ...overrides,
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

  // ---------------------------------------------------------------------------
  // Audit trail badge helpers
  // ---------------------------------------------------------------------------

  describe('getEventVariant', () => {
    it('returns "activation" for WALLET_ACTIVATION flag — highest priority', () => {
      const event = lotEvent({ flag: 'WALLET_ACTIVATION', isTaxable: false, gainLossEur: 0 })
      expect(getEventVariant(event)).toBe('activation')
    })

    it('returns "exempt" for non-taxable events without WALLET_ACTIVATION flag', () => {
      const event = lotEvent({ isTaxable: false, gainLossEur: 0 })
      expect(getEventVariant(event)).toBe('exempt')
    })

    it('returns "gain" for taxable events with positive gainLossEur', () => {
      const event = lotEvent({ isTaxable: true, gainLossEur: 200 })
      expect(getEventVariant(event)).toBe('gain')
    })

    it('returns "gain" for taxable events with zero gainLossEur (break-even)', () => {
      const event = lotEvent({ isTaxable: true, gainLossEur: 0 })
      expect(getEventVariant(event)).toBe('gain')
    })

    it('returns "loss" for taxable events with negative gainLossEur', () => {
      const event = lotEvent({ isTaxable: true, gainLossEur: -50 })
      expect(getEventVariant(event)).toBe('loss')
    })
  })

  describe('gainLossClass', () => {
    it('returns emerald class for positive values', () => {
      expect(gainLossClass(100)).toContain('emerald')
    })

    it('returns rose class for negative values', () => {
      expect(gainLossClass(-0.01)).toContain('rose')
    })

    it('returns muted class for zero', () => {
      expect(gainLossClass(0)).toBe('text-muted-foreground')
    })
  })

  describe('BADGE_CLASSES', () => {
    it('defines a class string for every variant', () => {
      const variants = ['gain', 'loss', 'exempt', 'activation'] as const
      for (const v of variants) {
        expect(typeof BADGE_CLASSES[v]).toBe('string')
        expect(BADGE_CLASSES[v].length).toBeGreaterThan(0)
      }
    })
  })

  describe('BADGE_I18N_KEYS', () => {
    it('defines an i18n key for every variant that starts with "tax.audit."', () => {
      const variants = ['gain', 'loss', 'exempt', 'activation'] as const
      for (const v of variants) {
        expect(BADGE_I18N_KEYS[v]).toMatch(/^tax\.audit\./)
      }
    })
  })
})
