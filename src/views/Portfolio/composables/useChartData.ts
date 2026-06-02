/**
 * useChartData — Composable description.
 */

import { computed, type Ref } from 'vue'
import { stringToColor } from '@/lib/utils'
import type { PortfolioMetricsEntity, CryptoAssetEntity } from '@/core/domain/models/PortfolioEntities'

/**
 * useChartData
 * 
 * Extracts the presentation/UI logic for charting out of the main data composable.
 * Transforms domain entities into the format required by the lightweight-charts and chart.js components.
 */
export function useChartData(
  metrics: Ref<PortfolioMetricsEntity | null>,
  filteredHoldings: Ref<CryptoAssetEntity[]>
) {
  
  // ---------------------------------------------------------------------------
  // Asset Allocation (Doughnut Chart)
  // ---------------------------------------------------------------------------
  const allocationData = computed(() => {
    return filteredHoldings.value.map(holding => ({
      label: holding.symbol,
      value: holding.currentValueEur,
      color: stringToColor(holding.symbol)
    }))
  })

  // ---------------------------------------------------------------------------
  // Performance History (Line Chart)
  // ---------------------------------------------------------------------------
  // TODO: Replace this synthetic generation with actual historical data from the API
  const performanceData = computed(() => {
    if (!metrics.value) return []
    
    const currentEquity = metrics.value.totalEquityEur
    const baseEquity = currentEquity * 0.95 // Assume started 5% lower 7 days ago
    const history = []
    
    const now = new Date()
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now)
      d.setDate(d.getDate() - i)
      
      // Add some random walk for intermediate days, and use exactly currentEquity for today
      const progress = 1 - (i / 6) // 0 to 1
      const randomNoise = i === 0 ? 0 : (Math.random() - 0.5) * 0.02 * currentEquity // +/- 1% noise
      const value = baseEquity + ((currentEquity - baseEquity) * progress) + randomNoise
      
      history.push({
        time: d.toISOString().split('T')[0],
        value: Number(value.toFixed(2))
      })
    }
    return history
  })

  return {
    allocationData,
    performanceData
  }
}
