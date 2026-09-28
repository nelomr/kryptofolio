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
  SetSpotTransactionOverrideUseCase,
  RemoveSpotTransactionOverrideUseCase,
  SetTransferDestinationUseCase,
  RemoveTransferDestinationUseCase,
} from '@/core/application/use-cases/overrides/ManualFiscalOverrideUseCases'
import type { TransferDestinationInput } from '@/core/domain/ports/ITaxPort'
import type { TransactionIdHash } from '@/core/domain/models/BrandedTypes'
import type { SpotTransactionEditInput } from '@kryptofolio/shared-types'
import { UploadTaxFileUseCase } from '@/core/application/use-cases/UploadTaxFileUseCase'
import { ImportWalletUseCase } from '@/core/application/use-cases/ImportWalletUseCase'
import { SyncWeb3UseCase } from '@/core/application/use-cases/SyncWeb3UseCase'
import { DeleteAllTransactionsUseCase } from '@/core/application/use-cases/DeleteAllTransactionsUseCase'
import { DownloadTaxReportUseCase } from '@/core/application/use-cases/DownloadTaxReportUseCase'
import { ImportTransactionsUseCase } from '@/core/application/use-cases/ImportTransactionsUseCase'
import type { SourceProfileId, TransactionRow } from '@kryptofolio/shared-types'

/**
 * Every derived-chain read the dashboard fans out (design D10). A ledger-dirtying mutation
 * rebuilds all of these server-side, and with an explicit 60s `staleTime` on each query
 * (rather than Pinia Colada's 5s default) an omission here would leave the dashboard showing
 * stale figures for up to a minute after an import or an override — invalidation is what
 * makes "freshness by explicit invalidation, not a timer" actually true.
 */
function invalidatePortfolioAndMetrics(queryCache: ReturnType<typeof useQueryCache>) {
  queryCache.invalidateQueries({ key: ['portfolio-summary'] })
  queryCache.invalidateQueries({ key: ['crypto-metrics-kpis'] })
  queryCache.invalidateQueries({ key: ['crypto-performance-history'] })
  queryCache.invalidateQueries({ key: ['crypto-asset-allocation'] })
  queryCache.invalidateQueries({ key: ['crypto-volatility-heatmap'] })
  queryCache.invalidateQueries({ key: ['crypto-risk-metrics'] })
  queryCache.invalidateQueries({ key: ['crypto-drawdown-curve'] })
}

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
      invalidatePortfolioAndMetrics(queryCache)
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
      invalidatePortfolioAndMetrics(queryCache)
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
      invalidatePortfolioAndMetrics(queryCache)
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
      invalidatePortfolioAndMetrics(queryCache)
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
      invalidatePortfolioAndMetrics(queryCache)
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
  invalidatePortfolioAndMetrics(queryCache)
}

// A spot-transaction edit changes the row values themselves, which invalidateDerivedFiscalData
// alone does not cover — it invalidates the fiscal-integrity/tax-report/token-history/portfolio
// surface, but not the Ledgers table's own list. Both mutations below add
// TAX_TRANSACTIONS_KEY('spot') on top, once, so it is never a second invalidatePortfolioAndMetrics
// call (design.md D9's "not called a second time" note).
export function useSetSpotTransactionOverrideMutation() {
  const port = useTaxPort()
  const queryCache = useQueryCache()
  const useCase = new SetSpotTransactionOverrideUseCase(port)

  return useMutation({
    mutation: ({ idHash, payload }: { idHash: TransactionIdHash; payload: SpotTransactionEditInput }) =>
      useCase.execute(idHash, payload),
    onSuccess: () => {
      queryCache.invalidateQueries({ key: TAX_TRANSACTIONS_KEY('spot') })
      invalidateDerivedFiscalData(queryCache)
    },
  })
}

export function useRemoveSpotTransactionOverrideMutation() {
  const port = useTaxPort()
  const queryCache = useQueryCache()
  const useCase = new RemoveSpotTransactionOverrideUseCase(port)

  return useMutation({
    mutation: (idHash: TransactionIdHash) => useCase.execute(idHash),
    onSuccess: () => {
      queryCache.invalidateQueries({ key: TAX_TRANSACTIONS_KEY('spot') })
      invalidateDerivedFiscalData(queryCache)
    },
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
