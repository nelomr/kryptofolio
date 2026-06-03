import { computed, type Ref } from 'vue'
import type { TaxTransactionEntity } from '@/core/domain/models/FiscalEntities'

/**
 * Computes available years in descending order from a list of transactions.
 * Defaults to the current year if the list is empty.
 */
export function useAvailableYears(transactions: Ref<TaxTransactionEntity[] | undefined>) {
  return computed<number[]>(() => {
    const txs = transactions.value ?? []
    if (txs.length === 0) return [new Date().getFullYear()]
    return [...new Set(txs.map((tx) => new Date(tx.timestamp).getFullYear()))].sort(
      (a, b) => b - a,
    )
  })
}
