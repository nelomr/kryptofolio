import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { createApp } from 'vue'
import { PiniaColada, useQueryCache } from '@pinia/colada'
import { 
  useUploadTaxFileMutation, 
  useImportWalletMutation, 
  useSyncWeb3Mutation, 
  useDeleteTransactionsMutation 
} from '@/composables/queries/useTaxMutations'
import { TAX_TRANSACTIONS_KEY } from '@/composables/queries/useTaxQueries'
import { TAX_REPO_KEY } from '@/core/injectionKeys'
import type { ITaxRepository } from '@/core/domain/repositories/ITaxRepository'

function createMockTaxRepo(): ITaxRepository {
  return {
    getSpotTransactions: vi.fn(),
    getFuturesTransactions: vi.fn(),
    getInvalidTransactions: vi.fn(),
    getReport: vi.fn(),
    deleteTransaction: vi.fn(),
    updateTransaction: vi.fn(),
    validateTransaction: vi.fn(),
    uploadTaxFile: vi.fn().mockResolvedValue(undefined),
    deleteAllTransactions: vi.fn().mockResolvedValue(undefined),
    importWallet: vi.fn().mockResolvedValue(undefined),
    syncWeb3: vi.fn().mockResolvedValue(undefined),
    downloadReport: vi.fn().mockResolvedValue(new Blob()),
  }
}

describe('Tax Mutations Composables', () => {
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

  it('useUploadTaxFileMutation calls repo and invalidates transactions query', async () => {
    const { app, repo } = setupApp()
    
    let composable: ReturnType<typeof useUploadTaxFileMutation>
    let cache: ReturnType<typeof useQueryCache>
    
    app.runWithContext(() => {
      composable = useUploadTaxFileMutation()
      cache = useQueryCache()
    })

    const invalidateSpy = vi.spyOn(cache!, 'invalidateQueries')
    const mockFile = new File([''], 'test.csv')

    await app.runWithContext(() => composable.mutateAsync({ file: mockFile, market: 'spot' }))

    expect(repo.uploadTaxFile).toHaveBeenCalledWith(mockFile, 'spot')
    expect(invalidateSpy).toHaveBeenCalledWith({ key: TAX_TRANSACTIONS_KEY('spot') })
  })

  it('useImportWalletMutation calls repo and invalidates transactions query', async () => {
    const { app, repo } = setupApp()
    
    let composable: ReturnType<typeof useImportWalletMutation>
    let cache: ReturnType<typeof useQueryCache>
    
    app.runWithContext(() => {
      composable = useImportWalletMutation()
      cache = useQueryCache()
    })

    const invalidateSpy = vi.spyOn(cache!, 'invalidateQueries')

    await app.runWithContext(() => composable.mutateAsync({ chain: 'solana', address: '123' }))

    expect(repo.importWallet).toHaveBeenCalledWith('solana', '123')
    expect(invalidateSpy).toHaveBeenCalledWith({ key: TAX_TRANSACTIONS_KEY() })
  })

  it('useSyncWeb3Mutation calls repo and invalidates transactions query', async () => {
    const { app, repo } = setupApp()
    
    let composable: ReturnType<typeof useSyncWeb3Mutation>
    let cache: ReturnType<typeof useQueryCache>
    
    app.runWithContext(() => {
      composable = useSyncWeb3Mutation()
      cache = useQueryCache()
    })

    const invalidateSpy = vi.spyOn(cache!, 'invalidateQueries')

    await app.runWithContext(() => composable.mutateAsync())

    expect(repo.syncWeb3).toHaveBeenCalled()
    expect(invalidateSpy).toHaveBeenCalledWith({ key: TAX_TRANSACTIONS_KEY() })
  })

  it('useDeleteTransactionsMutation calls repo and invalidates BOTH transactions and tax reports queries', async () => {
    const { app, repo } = setupApp()
    
    let composable: ReturnType<typeof useDeleteTransactionsMutation>
    let cache: ReturnType<typeof useQueryCache>
    
    app.runWithContext(() => {
      composable = useDeleteTransactionsMutation()
      cache = useQueryCache()
    })

    const invalidateSpy = vi.spyOn(cache!, 'invalidateQueries')

    await app.runWithContext(() => composable.mutateAsync('spot'))

    expect(repo.deleteAllTransactions).toHaveBeenCalledWith('spot')
    expect(invalidateSpy).toHaveBeenCalledWith({ key: TAX_TRANSACTIONS_KEY('spot') })
    expect(invalidateSpy).toHaveBeenCalledWith({ key: ['tax-report'] })
  })
})
