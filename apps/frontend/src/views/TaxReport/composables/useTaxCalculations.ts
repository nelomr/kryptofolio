/**
 * useTaxCalculations — Pure business logic composables for the Tax domain.
 *
 * No API calls, no Pinia stores, no side effects.
 * All functions are synchronous computed derivations from reactive inputs.
 * This makes them highly testable and composable.
 */

import { computed, ref } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import type { TaxTransactionEntity, TaxLotHistoryEvent } from '@/core/domain/models/FiscalEntities'

// ---------------------------------------------------------------------------
// useSmartYearLogic
//
// Derives the most relevant fiscal year from the cached transactions.
// Instead of a watcher, this is a purely derived computed property.
// Rules:
//   1. Prefer the year with the most transactions.
//   2. Fall back to the most recent year if tied.
//   3. Fall back to the current year if no transactions exist.
// ---------------------------------------------------------------------------

export function useSmartYearLogic(
  transactions: Ref<TaxTransactionEntity[] | undefined> | ComputedRef<TaxTransactionEntity[] | undefined>,
) {
  const smartYear = computed<number>(() => {
    const txs = transactions.value
    if (!txs || txs.length === 0) {
      return new Date().getFullYear()
    }

    // Count transactions per year
    const yearCounts = txs.reduce<Record<number, number>>((acc, tx) => {
      const year = new Date(tx.timestamp).getFullYear()
      acc[year] = (acc[year] ?? 0) + 1
      return acc
    }, {})

    // Find year with the most transactions (prefer most recent on tie)
    const bestYear = Object.entries(yearCounts).reduce(
      (best, [yearStr, count]) => {
        const year = Number(yearStr)
        if (count > best.count || (count === best.count && year > best.year)) {
          return { year, count }
        }
        return best
      },
      { year: 0, count: 0 },
    )

    return bestYear.year || new Date().getFullYear()
  })

  return { smartYear }
}

// ---------------------------------------------------------------------------
// usePagination
//
// Generic, pure pagination composable. Takes a reactive data array and
// returns a slice for the current page along with navigation helpers.
//
// Adapted from BasePagination.vue UX: exposes page numbers, prev/next,
// and the "showing X to Y of Z" info — all purely computed.
// ---------------------------------------------------------------------------

export interface PaginationState {
  currentPage: Ref<number>
  totalPages: ComputedRef<number>
  totalItems: ComputedRef<number>
  paginatedData: ComputedRef<unknown[]>
  displayedPages: ComputedRef<number[]>
  rangeStart: ComputedRef<number>
  rangeEnd: ComputedRef<number>
  goToPage: (page: number) => void
  nextPage: () => void
  prevPage: () => void
}

export function usePagination<T>(
  data: Ref<T[] | undefined> | ComputedRef<T[] | undefined>,
  itemsPerPage: Ref<number> | number = 20,
): PaginationState {
  const currentPage = ref(1)
  const pageSize = typeof itemsPerPage === 'number' ? ref(itemsPerPage) : itemsPerPage

  const totalItems = computed(() => data.value?.length ?? 0)
  const totalPages = computed(() => Math.max(1, Math.ceil(totalItems.value / pageSize.value)))

  const paginatedData = computed<T[]>(() => {
    if (!data.value) return []
    const start = (currentPage.value - 1) * pageSize.value
    const end = start + pageSize.value
    return data.value.slice(start, end)
  })

  // "Showing X to Y of Z" helpers
  const rangeStart = computed(() =>
    totalItems.value === 0 ? 0 : (currentPage.value - 1) * pageSize.value + 1,
  )
  const rangeEnd = computed(() => Math.min(currentPage.value * pageSize.value, totalItems.value))

  // Displayed page numbers (max 5, centered around currentPage — same UX as BasePagination.vue)
  const displayedPages = computed<number[]>(() => {
    const maxVisible = 5
    let start = Math.max(1, currentPage.value - Math.floor(maxVisible / 2))
    let end = Math.min(totalPages.value, start + maxVisible - 1)
    if (end - start + 1 < maxVisible) {
      start = Math.max(1, end - maxVisible + 1)
    }
    const pages: number[] = []
    for (let i = start; i <= end; i++) pages.push(i)
    return pages
  })

  function goToPage(page: number) {
    const clamped = Math.max(1, Math.min(page, totalPages.value))
    currentPage.value = clamped
  }
  function nextPage() {
    goToPage(currentPage.value + 1)
  }
  function prevPage() {
    goToPage(currentPage.value - 1)
  }

  return {
    currentPage,
    totalPages,
    totalItems,
    paginatedData: paginatedData as ComputedRef<unknown[]>,
    displayedPages,
    rangeStart,
    rangeEnd,
    goToPage,
    nextPage,
    prevPage,
  }
}

// ---------------------------------------------------------------------------
// Audit trail badge helpers — pure derivations from TaxLotHistoryEvent.
//
// Extracted here so TaxReportDetailsTable stays purely presentational, and
// so any future fiscal table component can reuse the same visual mapping
// without duplicating the domain logic.
// ---------------------------------------------------------------------------

export type EventBadgeVariant = 'gain' | 'loss' | 'exempt' | 'activation'

/**
 * Derives the visual badge variant from a single audit trail event.
 * Priority: WALLET_ACTIVATION → non-taxable (exempt) → gain / loss by sign.
 */
export function getEventVariant(event: TaxLotHistoryEvent): EventBadgeVariant {
  if (event.flag === 'WALLET_ACTIVATION') return 'activation'
  if (!event.isTaxable) return 'exempt'
  return event.gainLossEur >= 0 ? 'gain' : 'loss'
}

/** Tailwind class sets per badge variant — consistent across all fiscal tables. */
export const BADGE_CLASSES: Record<EventBadgeVariant, string> = {
  gain: 'bg-profit-soft text-profit border-profit/20',
  loss: 'bg-loss-soft text-loss border-loss/20',
  exempt: 'bg-info-soft text-info border-info/20',
  activation: 'bg-surface-3 text-muted border-border',
}

/**
 * Maps a variant to its i18n key so callers resolve labels themselves.
 * Returns a key string — the component calls t() on it.
 */
export const BADGE_I18N_KEYS: Record<EventBadgeVariant, string> = {
  gain: 'tax.audit.badge_gain',
  loss: 'tax.audit.badge_loss',
  exempt: 'tax.audit.badge_exempt',
  activation: 'tax.audit.badge_activation',
}

/** Returns a Tailwind text-color class for a numeric gain/loss value. */
export function gainLossClass(value: number): string {
  if (value > 0) return 'text-profit'
  if (value < 0) return 'text-loss'
  return 'text-muted-foreground'
}
