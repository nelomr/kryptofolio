/**
 * useTaxData — Pinia Colada queries for the Tax domain.
 *
 * Provides reactive, cached data fetching for tax transactions and reports.
 * All data is fetched strictly via the ITaxPort port (API-first, decoupled).
 *
 * Pattern mirrors usePortfolioQueries.ts — useQuery for reads, injected adapter.
 *
 * @see openspec/specs/tax-composables/spec.md
 */

import { inject } from 'vue'
import { useQuery } from '@pinia/colada'
import type { Ref } from 'vue'
import { TAX_REPO_KEY } from '@/core/injectionKeys'
import type { ITaxPort } from '@/core/domain/ports/ITaxPort'
import type { TaxTransactionEntity, TaxReportEntity, TaxDerivativeEntity } from '@/core/domain/models/FiscalEntities'
import { GetSpotTransactionsUseCase } from '@/core/application/use-cases/GetSpotTransactionsUseCase'
import { GetFuturesTransactionsUseCase } from '@/core/application/use-cases/GetFuturesTransactionsUseCase'
import { GetTaxReportUseCase } from '@/core/application/use-cases/GetTaxReportUseCase'
import { GetFuturesDerivativesUseCase } from '@/core/application/use-cases/GetFuturesDerivativesUseCase'
import { GetAvailableYearsUseCase } from '@/core/application/use-cases/GetAvailableYearsUseCase'

// ---------------------------------------------------------------------------
// Helper: inject the Tax repository (throws if not provided)
// ---------------------------------------------------------------------------

export function useTaxRepo(): ITaxPort {
  const repo = inject(TAX_REPO_KEY)
  if (!repo) {
    throw new Error(
      '[useTaxData] ITaxPort not provided. ' +
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
export const AVAILABLE_YEARS_KEY = ['tax-available-years'] as const

// ---------------------------------------------------------------------------
// useSpotTransactionsQuery
// Fetches all spot tax-relevant transactions and caches them via Pinia Colada.
// ---------------------------------------------------------------------------

export function useSpotTransactionsQuery() {
  const repo = useTaxRepo()
  const useCase = new GetSpotTransactionsUseCase(repo)

  return useQuery<TaxTransactionEntity[]>({
    key: TAX_TRANSACTIONS_KEY('spot'),
    query: () => useCase.execute(),
  })
}

// ---------------------------------------------------------------------------
// useFuturesTransactionsQuery
// Fetches all futures tax-relevant transactions and caches them via Pinia Colada.
// ---------------------------------------------------------------------------

export function useFuturesTransactionsQuery() {
  const repo = useTaxRepo()
  const useCase = new GetFuturesTransactionsUseCase(repo)

  return useQuery<TaxTransactionEntity[]>({
    key: TAX_TRANSACTIONS_KEY('futures'),
    query: () => useCase.execute(),
  })
}

// ---------------------------------------------------------------------------
// useTaxReportQuery
// Fetches the full AEAT tax report for a given fiscal year and method.
// The query is disabled if year is 0 (not yet set).
// ---------------------------------------------------------------------------

export function useTaxReportQuery(year: Ref<number>, method: Ref<string>) {
  const repo = useTaxRepo()
  const useCase = new GetTaxReportUseCase(repo)

  return useQuery<TaxReportEntity>({
    key: () => TAX_REPORT_KEY(year.value, method.value),
    query: () => useCase.execute(year.value, method.value),
    enabled: () => year.value > 0,
  })
}

// ---------------------------------------------------------------------------
// useFuturesDerivativesQuery
// Fetches futures derivatives transactions mapped to TaxDerivativeEntity.
// Uses a distinct cache key from the legacy futures query to avoid conflicts.
// ---------------------------------------------------------------------------

export const FUTURES_DERIVATIVES_KEY = ['tax-transactions', 'futures-derivatives'] as const

export function useFuturesDerivativesQuery() {
  const repo = useTaxRepo()
  const useCase = new GetFuturesDerivativesUseCase(repo)

  return useQuery<TaxDerivativeEntity[]>({
    key: FUTURES_DERIVATIVES_KEY,
    query: () => useCase.execute(),
  })
}

// ---------------------------------------------------------------------------
// useAvailableYearsQuery
// Fetches the array of available fiscal years (e.g. [2024, 2023])
// ---------------------------------------------------------------------------

export function useAvailableYearsQuery() {
  const repo = useTaxRepo()
  const useCase = new GetAvailableYearsUseCase(repo)

  return useQuery<number[]>({
    key: AVAILABLE_YEARS_KEY,
    query: () => useCase.execute(),
  })
}
