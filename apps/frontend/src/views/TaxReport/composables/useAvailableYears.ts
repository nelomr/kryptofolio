import { computed } from 'vue'
import { useAvailableYearsQuery } from '@/composables/queries/useTaxQueries'

/**
 * Fetches available years from the ITaxPort.
 * Replaces the old frontend-calculated logic.
 */
export function useAvailableYears() {
  const query = useAvailableYearsQuery()
  
  return computed<number[]>(() => {
    return query.data.value ?? [new Date().getFullYear()]
  })
}
