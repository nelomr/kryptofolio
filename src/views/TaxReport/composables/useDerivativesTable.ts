/**
 * useDerivativesTable — Lógica extraída de TaxDerivativesTable.vue.
 *
 * Centraliza: sort, pagination, y helpers de estilo (badge classes, PnL class,
 * net impact). El componente queda limpio solo con template + bindings.
 *
 * @see src/views/TaxReport/components/TaxDerivativesTable.vue
 * @see src/core/domain/models/FiscalEntities.ts (TaxDerivativeEntity)
 */

import { computed, ref } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import type { TaxDerivativeEntity, FuturesTransactionType } from '@/core/domain/models/FiscalEntities'
import { usePagination } from './useTaxCalculations'

// ---------------------------------------------------------------------------
// Sort
// ---------------------------------------------------------------------------

export type DerivativesSortKey = 'timestamp' | 'realizedPnl'

export function useDerivativesSort(transactions: Ref<TaxDerivativeEntity[]> | ComputedRef<TaxDerivativeEntity[]>) {
  const sortKey = ref<DerivativesSortKey>('timestamp')
  const sortOrder = ref<'asc' | 'desc'>('desc')

  function toggleSort(key: DerivativesSortKey) {
    if (sortKey.value === key) {
      sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
    } else {
      sortKey.value = key
      sortOrder.value = 'desc'
    }
  }

  const sorted = computed(() => {
    const items = [...transactions.value]
    return items.sort((a, b) => {
      const aVal =
        sortKey.value === 'timestamp' ? new Date(a.timestamp).getTime() : a.realizedPnl
      const bVal =
        sortKey.value === 'timestamp' ? new Date(b.timestamp).getTime() : b.realizedPnl
      return sortOrder.value === 'asc' ? aVal - bVal : bVal - aVal
    })
  })

  return { sortKey, sortOrder, toggleSort, sorted }
}

// ---------------------------------------------------------------------------
// Pagination (delegates to the shared usePagination)
// ---------------------------------------------------------------------------

export function useDerivativesPagination(
  sorted: ComputedRef<TaxDerivativeEntity[]>,
  pageSize = 20,
) {
  const pagination = usePagination(sorted, pageSize)
  // usePagination returns paginatedData typed as ComputedRef<unknown[]> —
  // we narrow it here so the component doesn't need the ugly cast.
  const paginatedTxs = pagination.paginatedData as unknown as ComputedRef<TaxDerivativeEntity[]>
  return { ...pagination, paginatedTxs }
}

// ---------------------------------------------------------------------------
// Style helpers — keep pure functions here, not inlined in the template
// ---------------------------------------------------------------------------

/** CSS classes for the transaction type badge */
export function getTypeBadgeClass(type: FuturesTransactionType): string {
  switch (type) {
    case 'FUTURES_TRADE':
      return 'bg-primary/10 text-primary border-none'
    case 'FUTURES_FUNDING':
      return 'bg-amber-500/10 text-amber-500 border-none dark:text-amber-400'
    case 'CONVERSION':
      return 'bg-violet-500/10 text-violet-500 border-none dark:text-violet-400'
    default:
      return 'bg-muted/20 text-muted-foreground border-none'
  }
}

/** CSS classes for the PnL cell (AEAT taxable event highlight) */
export function getPnlClass(pnl: number): string {
  if (pnl > 0) return 'text-profit font-bold font-mono'
  if (pnl < 0) return 'text-loss font-bold font-mono'
  return 'text-muted-foreground font-mono'
}

/** CSS classes for the status badge */
export function getStatusBadgeClass(status: string | undefined): string {
  const s = (status ?? '').toUpperCase()
  if (s === 'CLOSED' || s === 'SETTLED')
    return 'bg-muted/20 text-muted-foreground border border-border/40'
  if (s === 'OPEN') return 'bg-profit/10 text-profit border border-profit/20'
  return 'bg-muted/20 text-muted-foreground border border-border/40'
}

/** Net cost impact of fees and funding on a position (signed) */
export function getNetImpact(tx: TaxDerivativeEntity): number {
  return -tx.fees + tx.funding
}

/** Formats raw contract symbols (e.g., pf_ethusd) into readable names (e.g., ETH/USD Perp) */
export function formatContractName(contractSymbol: string): string {
  if (!contractSymbol) return '---'
  const lower = contractSymbol.toLowerCase()

  // Kraken formats: pf_ethusd, pi_btcusd, ff_sol_usd, fi_ada_usd
  const krakenMatch = lower.match(/^(pf|pi|ff|fi)_([a-z0-9]+?)(?:_)?(usd|eur|gbp|usdt|usdc)$/)
  if (krakenMatch) {
    const [, prefix, asset, quote] = krakenMatch
    let suffix = 'Perp'
    if (prefix === 'pi') suffix = 'Inverse'
    else if (prefix === 'ff') suffix = 'Fixed'
    else if (prefix === 'fi') suffix = 'Fixed Inv'

    return `${asset.toUpperCase()}/${quote.toUpperCase()} ${suffix}`
  }

  return contractSymbol.toUpperCase()
}
