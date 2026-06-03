/**
 * useTaxData — Pinia Colada queries for the Tax domain.
 *
 * Provides reactive, cached data fetching for tax transactions and reports.
 * All data is fetched strictly via the ITaxRepository port (API-first, decoupled).
 *
 * Pattern mirrors usePortfolioQueries.ts — useQuery for reads, injected adapter.
 *
 * @see openspec/specs/tax-composables/spec.md
 */

import { inject } from 'vue'
import { useQuery } from '@pinia/colada'
import type { Ref } from 'vue'
import { TAX_REPO_KEY } from '@/core/injectionKeys'
import type { ITaxRepository } from '@/core/domain/repositories/ITaxRepository'
import type { TaxTransactionEntity, TaxReportEntity } from '@/core/domain/models/FiscalEntities'

// ---------------------------------------------------------------------------
// Helper: inject the Tax repository (throws if not provided)
// ---------------------------------------------------------------------------

export function useTaxRepo(): ITaxRepository {
  const repo = inject(TAX_REPO_KEY)
  if (!repo) {
    throw new Error(
      '[useTaxData] ITaxRepository not provided. ' +
        'Ensure App.vue provides TAX_REPO_KEY via the DI plugin.',
    )
  }
  return repo
}

// ---------------------------------------------------------------------------
// Query key constants — used by both queries and mutations for invalidation
// ---------------------------------------------------------------------------

export const TAX_TRANSACTIONS_KEY = (market?: 'spot' | 'futures') =>
  market ? (['tax-transactions', market] as const) : (['tax-transactions'] as const)
export const TAX_REPORT_KEY = (year: number, method: string) =>
  ['tax-report', year, method] as const

// ---------------------------------------------------------------------------
// useSpotTransactionsQuery
// Fetches all spot tax-relevant transactions and caches them via Pinia Colada.
// ---------------------------------------------------------------------------

export function useSpotTransactionsQuery() {
  const repo = useTaxRepo()

  return useQuery<TaxTransactionEntity[]>({
    key: TAX_TRANSACTIONS_KEY('spot'),
    query: () => repo.getSpotTransactions(),
  })
}

// ---------------------------------------------------------------------------
// useFuturesTransactionsQuery
// Fetches all futures tax-relevant transactions and caches them via Pinia Colada.
// ---------------------------------------------------------------------------

export function useFuturesTransactionsQuery() {
  const repo = useTaxRepo()

  return useQuery<TaxTransactionEntity[]>({
    key: TAX_TRANSACTIONS_KEY('futures'),
    query: () => repo.getFuturesTransactions(),
  })
}

// ---------------------------------------------------------------------------
// useTaxReportQuery
// Fetches the full AEAT tax report for a given fiscal year and method.
// The query is disabled if year is 0 (not yet set).
// ---------------------------------------------------------------------------

export function useTaxReportQuery(year: Ref<number>, method: Ref<string>) {
  const repo = useTaxRepo()

  return useQuery<TaxReportEntity>({
    key: () => TAX_REPORT_KEY(year.value, method.value),
    query: () => repo.getReport(year.value, method.value),
    enabled: () => year.value > 0,
  })
}
