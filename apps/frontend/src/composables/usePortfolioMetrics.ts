/**
 * usePortfolioMetrics — Composable description.
 */

import { computed } from 'vue'
import type { Ref } from 'vue'
import type { PortfolioMetricsEntity } from '@/core/domain/models/PortfolioEntities'

/**
 * Derives presentation-level metrics from raw portfolio data.
 * Keeps PortfolioView free of computed-logic clutter.
 * Business calculations (ROI, PnL) are done by the adapter,
 * this file only maps to CSS classes and formatted strings.
 */
export function usePortfolioMetrics(metrics: Ref<PortfolioMetricsEntity | null>) {
  const pnlValue = computed(() => metrics.value?.totalUnrealizedPnlFiat ?? 0)
  const realizedPnlValue = computed(() => metrics.value?.totalRealizedPnlFiat ?? 0)

  const roiPercentage = computed(() => metrics.value?.roiPercentage ?? 0)
  const isBullish = computed(() => metrics.value?.isBullish ?? false)
  const realizedIsPositive = computed(() => metrics.value?.realizedIsPositive ?? false)

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
