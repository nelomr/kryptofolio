/**
 * useTaxMutations — Pinia Colada mutations for the Tax domain.
 *
 * Provides write/action composables for all tax operations.
 * Each mutation invalidates the relevant query caches on success,
 * triggering automatic UI updates without manual store manipulation.
 *
 * Pattern mirrors useRebuildMutation in usePortfolioQueries.ts.
 *
 * @see openspec/specs/tax-composables/spec.md
 */

import { useMutation, useQueryCache } from '@pinia/colada'
import { useTaxRepo, TAX_TRANSACTIONS_KEY } from '@/composables/queries/useTaxQueries'

// ---------------------------------------------------------------------------
// useUploadTaxFileMutation
// Uploads a CSV/XLSX file via the port and invalidates the transactions cache.
// In MockTaxAdapter: parsed locally. In RestTaxAdapter: multipart POST to /api/tax/upload.
// ---------------------------------------------------------------------------

export function useUploadTaxFileMutation() {
  const repo = useTaxRepo()
  const queryCache = useQueryCache()

  return useMutation({
    mutation: (file: File) => repo.uploadTaxFile(file),
    onSuccess: () => {
      queryCache.invalidateQueries({ key: TAX_TRANSACTIONS_KEY })
    },
  })
}

// ---------------------------------------------------------------------------
// useImportWalletMutation
// Triggers on-chain wallet import and invalidates the transactions cache.
// ---------------------------------------------------------------------------

export function useImportWalletMutation() {
  const repo = useTaxRepo()
  const queryCache = useQueryCache()

  return useMutation({
    mutation: ({ chain, address }: { chain: string; address: string }) =>
      repo.importWallet(chain, address),
    onSuccess: () => {
      queryCache.invalidateQueries({ key: TAX_TRANSACTIONS_KEY })
    },
  })
}

// ---------------------------------------------------------------------------
// useSyncWeb3Mutation
// Syncs on-chain data and invalidates the transactions cache.
// ---------------------------------------------------------------------------

export function useSyncWeb3Mutation() {
  const repo = useTaxRepo()
  const queryCache = useQueryCache()

  return useMutation({
    mutation: () => repo.syncWeb3(),
    onSuccess: () => {
      queryCache.invalidateQueries({ key: TAX_TRANSACTIONS_KEY })
    },
  })
}

// ---------------------------------------------------------------------------
// useDeleteTransactionsMutation
// Bulk deletes all transactions and invalidates both transactions and reports caches.
// ---------------------------------------------------------------------------

export function useDeleteTransactionsMutation() {
  const repo = useTaxRepo()
  const queryCache = useQueryCache()

  return useMutation({
    mutation: () => repo.deleteAllTransactions(),
    onSuccess: () => {
      // Invalidate all tax-related queries so the UI clears automatically
      queryCache.invalidateQueries({ key: TAX_TRANSACTIONS_KEY })
      queryCache.invalidateQueries({ key: ['tax-report'] })
    },
  })
}
