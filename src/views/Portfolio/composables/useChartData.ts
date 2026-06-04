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
    const baseEquity = currentEquity * 0.85 // Assume started 15% lower 30 days ago
    const history = []
    
    const now = new Date()
    const days = 30
    const pointsPerDay = 24 // hourly
    const totalPoints = days * pointsPerDay
    
    for (let i = totalPoints; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 60 * 60 * 1000)
      const progress = 1 - (i / totalPoints)
      // Generar una curva más natural usando una onda senoidal y menos ruido
      const wave = Math.sin(progress * Math.PI * 3) * (currentEquity * 0.03)
      const randomNoise = i === 0 ? 0 : (Math.random() - 0.5) * 0.005 * currentEquity
      const value = baseEquity + ((currentEquity - baseEquity) * progress) + wave + randomNoise
      
      const point: any = {
        time: Math.floor(d.getTime() / 1000),
        value: Number(value.toFixed(2))
      }
      
      // Simular eventos de marcadores fijos (ej. hace ~4 días y ~20 días)
      if (i === totalPoints - 100) {
        point.type = 'deposit'
        point.amount = 5000
      } else if (i === totalPoints - 500) {
        point.type = 'withdrawal'
        point.amount = 2000
      }
      
      history.push(point)
    }
    
    // Sort just in case
    return history.sort((a, b) => a.time - b.time)
  })

  return {
    allocationData,
    performanceData
  }
}
