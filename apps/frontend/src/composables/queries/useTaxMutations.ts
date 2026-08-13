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
import {
  useTaxPort,
  TAX_TRANSACTIONS_KEY,
  FISCAL_INTEGRITY_KEY,
} from '@/composables/queries/useTaxQueries'
import {
  SetManualPriceOverrideUseCase,
  RemoveManualPriceOverrideUseCase,
  SetTransferDestinationUseCase,
  RemoveTransferDestinationUseCase,
} from '@/core/application/use-cases/overrides/ManualFiscalOverrideUseCases'
import type {
  ManualPriceOverrideInput,
  TransferDestinationInput,
} from '@/core/domain/ports/ITaxPort'
import type { TransactionIdHash } from '@/core/domain/models/BrandedTypes'
import { UploadTaxFileUseCase } from '@/core/application/use-cases/UploadTaxFileUseCase'
import { ImportWalletUseCase } from '@/core/application/use-cases/ImportWalletUseCase'
import { SyncWeb3UseCase } from '@/core/application/use-cases/SyncWeb3UseCase'
import { DeleteAllTransactionsUseCase } from '@/core/application/use-cases/DeleteAllTransactionsUseCase'
import { DownloadTaxReportUseCase } from '@/core/application/use-cases/DownloadTaxReportUseCase'
import { ImportTransactionsUseCase } from '@/core/application/use-cases/ImportTransactionsUseCase'
import type { SourceProfileId, TransactionRow } from '@kryptofolio/shared-types'

// ---------------------------------------------------------------------------
// useUploadTaxFileMutation
// Uploads a CSV/XLSX file via the port and invalidates the transactions cache.
// In MockTaxAdapter: parsed locally. In RestTaxAdapter: multipart POST to /api/tax/upload.
// ---------------------------------------------------------------------------

export function useUploadTaxFileMutation() {
  const port = useTaxPort()
  const queryCache = useQueryCache()
  const useCase = new UploadTaxFileUseCase(port)

  return useMutation({
    mutation: (args: { file: File, market: 'spot' | 'futures' }) => useCase.execute(args.file, args.market),
    onSuccess: (_, args) => {
      queryCache.invalidateQueries({ key: TAX_TRANSACTIONS_KEY(args.market) })
    },
  })
}

// ---------------------------------------------------------------------------
// useSubmitIngestionMutation
// Submits an array of pre-parsed transaction rows directly to the backend.
// Invalidates the transactions cache upon success.
// ---------------------------------------------------------------------------

export function useSubmitIngestionMutation() {
  const port = useTaxPort()
  const queryCache = useQueryCache()
  const useCase = new ImportTransactionsUseCase(port)

  return useMutation({
    mutation: (args: { rows: TransactionRow[], market: 'spot' | 'futures', timezone: string, sourceProfileId: SourceProfileId }) =>
      useCase.execute(args.rows, args.market, args.timezone, args.sourceProfileId),
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
  const port = useTaxPort()
  const queryCache = useQueryCache()
  const useCase = new ImportWalletUseCase(port)

  return useMutation({
    mutation: ({ chain, address }: { chain: string; address: string }) =>
      useCase.execute(chain, address),
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
  const port = useTaxPort()
  const queryCache = useQueryCache()
  const useCase = new SyncWeb3UseCase(port)

  return useMutation({
    mutation: () => useCase.execute(),
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
  const port = useTaxPort()
  const queryCache = useQueryCache()
  const useCase = new DeleteAllTransactionsUseCase(port)

  return useMutation({
    mutation: (market: 'spot' | 'futures') => useCase.execute(market),
    onSuccess: (_, market) => {
      // Invalidate all tax-related queries so the UI clears automatically
      queryCache.invalidateQueries({ key: TAX_TRANSACTIONS_KEY(market) })
      if (market === 'futures') {
        queryCache.invalidateQueries({ key: ['tax-transactions', 'futures-derivatives'] })
      }
      queryCache.invalidateQueries({ key: ['tax-report'] })
    },
  })
}

// ---------------------------------------------------------------------------
// Override mutations — the user's calculation inputs.
//
// Each one invalidates the integrity surface and everything derived from it, because the backend
// rebuilds on write: leaving the old counts on screen would show a warning the user just resolved.
// ---------------------------------------------------------------------------

function invalidateDerivedFiscalData(queryCache: ReturnType<typeof useQueryCache>) {
  queryCache.invalidateQueries({ key: FISCAL_INTEGRITY_KEY })
  queryCache.invalidateQueries({ key: ['tax-report'] })
  queryCache.invalidateQueries({ key: ['token-history'] })
  queryCache.invalidateQueries({ key: ['portfolio-summary'] })
}

export function useSetManualPriceOverrideMutation() {
  const port = useTaxPort()
  const queryCache = useQueryCache()
  const useCase = new SetManualPriceOverrideUseCase(port)

  return useMutation({
    mutation: (overrides: ManualPriceOverrideInput[]) => useCase.execute(overrides),
    onSuccess: () => invalidateDerivedFiscalData(queryCache),
  })
}

export function useRemoveManualPriceOverrideMutation() {
  const port = useTaxPort()
  const queryCache = useQueryCache()
  const useCase = new RemoveManualPriceOverrideUseCase(port)

  return useMutation({
    mutation: (idHashes: TransactionIdHash[]) => useCase.execute(idHashes),
    onSuccess: () => invalidateDerivedFiscalData(queryCache),
  })
}

export function useSetTransferDestinationMutation() {
  const port = useTaxPort()
  const queryCache = useQueryCache()
  const useCase = new SetTransferDestinationUseCase(port)

  return useMutation({
    mutation: (overrides: TransferDestinationInput[]) => useCase.execute(overrides),
    onSuccess: () => invalidateDerivedFiscalData(queryCache),
  })
}

export function useRemoveTransferDestinationMutation() {
  const port = useTaxPort()
  const queryCache = useQueryCache()
  const useCase = new RemoveTransferDestinationUseCase(port)

  return useMutation({
    mutation: (idHashes: TransactionIdHash[]) => useCase.execute(idHashes),
    onSuccess: () => invalidateDerivedFiscalData(queryCache),
  })
}

// ---------------------------------------------------------------------------
// useDownloadTaxReportMutation
// Downloads the tax report blob and triggers a browser file download.
// ---------------------------------------------------------------------------

export function useDownloadTaxReportMutation() {
  const port = useTaxPort()
  const useCase = new DownloadTaxReportUseCase(port)

  return useMutation({
    mutation: async (args: { year: number; format: 'csv' }) => {
      const blob = await useCase.execute(args.year, args.format)
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
