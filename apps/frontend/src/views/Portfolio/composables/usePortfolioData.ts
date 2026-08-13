/**
 * usePortfolioData — Composable description.
 */

import { computed, ref } from 'vue'
import { usePortfolioSummaryQuery, useRebuildMutation, useTokenHistoryQuery, usePortfolioPort } from '@/composables/queries/usePortfolioQueries'
import type { LotRelocationEntity, TaxLotEntity, TaxLotHistoryEvent } from '@/core/domain/models/FiscalEntities'
import { summariseConversion } from '@/composables/useConvertedAmountDisplay'

export function usePortfolioData() {
  // Use Pinia Colada queries instead of the old store
  const { data: summary, isLoading: isFetching, error: loadError } = usePortfolioSummaryQuery()
  const { mutateAsync: rebuild, isLoading: isRebuilding } = useRebuildMutation()
  const port = usePortfolioPort()

  // Modal and details state
  const selectedSymbol = ref('')
  const isModalOpen = ref(false)
  
  // Fetch details (lots and history) from the Port/Adapter (for the modal)
  const { data: tokenDetails, isLoading: isFetchingDetails } = useTokenHistoryQuery(selectedSymbol)

  // Dictionary cache for hierarchical table expanded rows
  const expandedDetailsMap = ref<
    Record<
      string,
      {
        lots: TaxLotEntity[]
        history: Record<string, TaxLotHistoryEvent[]>
        relocations: Record<string, LotRelocationEntity[]>
        isLoading: boolean
      }
    >
  >({})

  // Computed metrics
  const metrics = computed(() => summary.value?.metrics || null)
  
  // Sorted holdings
  const filteredHoldings = computed(() => {
    if (!summary.value) return []
    return [...summary.value.holdings].sort(
      (a, b) => b.currentValueFiat - a.currentValueFiat
    )
  })

  const handleRebuild = async () => {
    await rebuild()
  }

  const handleExpandSymbol = (symbol: string) => {
    selectedSymbol.value = symbol
    isModalOpen.value = true
  }

  const handleRowExpand = async (symbol: string) => {
    // If already cached or fetching, don't fetch again
    if (expandedDetailsMap.value[symbol]) return 

    expandedDetailsMap.value[symbol] = { lots: [], history: {}, relocations: {}, isLoading: true }
    
    try {
      const data = await port.getTokenHistory(symbol)
      expandedDetailsMap.value[symbol] = {
        lots: data.lots,
        history: data.history,
        relocations: data.relocations,
        isLoading: false,
      }
    } catch (error) {
      expandedDetailsMap.value[symbol].isLoading = false
    }
  }

  const conversionSummary = computed(() =>
    summariseConversion(filteredHoldings.value.map((holding) => holding.costBasis)),
  )

  return {
    isFetching,
    loadError,
    isRebuilding,
    metrics,
    filteredHoldings,
    conversionSummary,
    handleRebuild,
    
    // Modal & Details
    isModalOpen,
    selectedSymbol,
    selectedHolding: computed(() => filteredHoldings.value.find(h => h.symbol === selectedSymbol.value)),
    tokenDetails,
    isFetchingDetails,
    handleExpandSymbol,

    // Hierarchical Table Lazy Props
    expandedDetailsMap,
    handleRowExpand
  }
}
