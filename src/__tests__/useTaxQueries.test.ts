import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { createApp } from 'vue'
import { ref } from 'vue'
import { PiniaColada } from '@pinia/colada'
import { useSpotTransactionsQuery, useFuturesTransactionsQuery, useTaxReportQuery } from '@/composables/queries/useTaxQueries'
import { TAX_REPO_KEY } from '@/core/injectionKeys'
import type { ITaxRepository } from '@/core/domain/repositories/ITaxRepository'
import type { TaxTransactionEntity, TaxReportEntity } from '@/core/domain/models/FiscalEntities'
import { TransactionIdSchema } from '@/core/domain/models/BrandedTypes'

const mockTx: TaxTransactionEntity = {
  id: TransactionIdSchema.parse('tx-mock'),
  type: 'BUY',
  symbol: 'BTC',
  amount: 1,
  priceEur: 50000,
  feeEur: 10,
  totalEur: 50010,
  timestamp: new Date('2026-06-02T10:00:00Z'),
}

const mockReport: TaxReportEntity = {
  year: 2026,
  method: 'FIFO',
  summary: { 
    capitalGainsEur: 1000, 
    capitalLossesEur: 0, 
    savingsBaseYieldsEur: 0, 
    generalBaseAirdropsEur: 0, 
    netPatrimonialResultEur: 1000, 
    estimatedIrpfEur: 190 
  },
  auditTrail: [],
}

function createMockTaxRepo(): ITaxRepository {
  return {
    getSpotTransactions: vi.fn().mockResolvedValue([mockTx]),
    getFuturesTransactions: vi.fn().mockResolvedValue([mockTx]),
    getInvalidTransactions: vi.fn().mockResolvedValue([]),
    getReport: vi.fn().mockResolvedValue(mockReport),
    deleteTransaction: vi.fn().mockResolvedValue(undefined),
    updateTransaction: vi.fn().mockResolvedValue(undefined),
    validateTransaction: vi.fn().mockResolvedValue(undefined),
    uploadTaxFile: vi.fn().mockResolvedValue(undefined),
    deleteAllTransactions: vi.fn().mockResolvedValue(undefined),
    importWallet: vi.fn().mockResolvedValue(undefined),
    syncWeb3: vi.fn().mockResolvedValue(undefined),
  }
}

describe('Tax Queries Composables', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  function setupApp() {
    const app = createApp({})
    app.use(createPinia())
    app.use(PiniaColada)
    const repo = createMockTaxRepo()
    app.provide(TAX_REPO_KEY, repo)
    return { app, repo }
  }

  it('useSpotTransactionsQuery fetches transactions and returns reactive state', async () => {
    const { app, repo } = setupApp()
    
    let composable: ReturnType<typeof useSpotTransactionsQuery>
    app.runWithContext(() => {
      composable = useSpotTransactionsQuery()
    })

    expect(composable!.isLoading.value).toBe(true)
    
    // wait for query resolution
    await new Promise(r => setTimeout(r, 10))
    
    expect(repo.getSpotTransactions).toHaveBeenCalled()
    expect(composable!.isLoading.value).toBe(false)
    expect(composable!.data.value).toEqual([mockTx])
  })

  it('useFuturesTransactionsQuery fetches futures transactions and returns reactive state', async () => {
    const { app, repo } = setupApp()
    
    let composable: ReturnType<typeof useFuturesTransactionsQuery>
    app.runWithContext(() => {
      composable = useFuturesTransactionsQuery()
    })

    expect(composable!.isLoading.value).toBe(true)
    
    // wait for query resolution
    await new Promise(r => setTimeout(r, 10))
    
    expect(repo.getFuturesTransactions).toHaveBeenCalled()
    expect(composable!.isLoading.value).toBe(false)
    expect(composable!.data.value).toEqual([mockTx])
  })

  it('useTaxReportQuery fetches report correctly when year > 0', async () => {
    const { app, repo } = setupApp()
    const year = ref(2026)
    const method = ref('FIFO')
    
    let composable: ReturnType<typeof useTaxReportQuery>
    app.runWithContext(() => {
      composable = useTaxReportQuery(year, method)
    })

    await new Promise(r => setTimeout(r, 10))
    
    expect(repo.getReport).toHaveBeenCalledWith(2026, 'FIFO')
    expect(composable!.data.value).toEqual(mockReport)
  })

  it('useTaxReportQuery is disabled when year is 0', async () => {
    const { app, repo } = setupApp()
    const year = ref(0)
    const method = ref('FIFO')
    
    let composable: ReturnType<typeof useTaxReportQuery>
    app.runWithContext(() => {
      composable = useTaxReportQuery(year, method)
    })

    await new Promise(r => setTimeout(r, 10))
    
    // Query disabled means it never calls repo
    expect(repo.getReport).not.toHaveBeenCalled()
    expect(composable!.data.value).toBeUndefined()
  })
})
