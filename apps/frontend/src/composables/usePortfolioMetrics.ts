/**
 * usePortfolioMetrics — Composable description.
 */

import { computed } from 'vue'
import type { Ref } from 'vue'
import type { PortfolioMetricsEntity } from '@/core/domain/models/PortfolioEntities'

/**
 * Derives presentation-level metrics from raw portfolio data.
 * Keeps PortfolioView free of computed-logic clutter.
 */
export function usePortfolioMetrics(metrics: Ref<PortfolioMetricsEntity | null>) {
  const pnlValue = computed(() => metrics.value?.totalUnrealizedPnlEur ?? 0)

  const realizedPnlValue = computed(() => metrics.value?.totalRealizedPnlEur ?? 0)

  const roiPercentage = computed(() => {
    if (!metrics.value || metrics.value.totalEquityEur === 0) return 0
    const costBasis = metrics.value.totalEquityEur - pnlValue.value
    if (costBasis <= 0) return 0
    return (pnlValue.value / costBasis) * 100
  })

  /** Pre-formatted ROI string with sign, e.g. "+5.23%" */
  const roiFormatted = computed(() => {
    const val = roiPercentage.value
    const sign = val >= 0 ? '+' : ''
    return `${sign}${val.toFixed(2)}%`
  })

  const roiColorClass = computed(() => {
    if (pnlValue.value > 0) return 'text-profit'
    if (pnlValue.value < 0) return 'text-loss'
    return 'text-muted-foreground'
  })

  const isBullish = computed(() => pnlValue.value >= 0)

  const realizedIsPositive = computed(() => realizedPnlValue.value >= 0)

  return {
    pnlValue,
    realizedPnlValue,
    roiPercentage,
    roiFormatted,
    roiColorClass,
    isBullish,
    realizedIsPositive,
  }
}
