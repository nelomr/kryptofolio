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
    mutation: (args: { file: File, market: 'spot' | 'futures' }) => repo.uploadTaxFile(args.file, args.market),
    onSuccess: (_, args) => {
      queryCache.invalidateQueries({ key: TAX_TRANSACTIONS_KEY(args.market) })
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
      queryCache.invalidateQueries({ key: TAX_TRANSACTIONS_KEY() })
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
      queryCache.invalidateQueries({ key: TAX_TRANSACTIONS_KEY() })
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
    mutation: (market: 'spot' | 'futures') => repo.deleteAllTransactions(market),
    onSuccess: (_, market) => {
      // Invalidate all tax-related queries so the UI clears automatically
      queryCache.invalidateQueries({ key: TAX_TRANSACTIONS_KEY(market) })
      queryCache.invalidateQueries({ key: ['tax-report'] })
    },
  })
}

// ---------------------------------------------------------------------------
// useDownloadTaxReportMutation
// Downloads the tax report blob and triggers a browser file download.
// ---------------------------------------------------------------------------

export function useDownloadTaxReportMutation() {
  const repo = useTaxRepo()

  return useMutation({
    mutation: async (args: { year: number; format: 'pdf' | 'csv' }) => {
      const blob = await repo.downloadReport(args.year, args.format)
      // Trigger browser file download
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `kryptofolio-informe-fiscal-${args.year}-fifo.${args.format}`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
    },
  })
}
