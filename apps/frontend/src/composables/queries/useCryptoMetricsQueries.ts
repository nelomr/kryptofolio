import { inject } from 'vue'
import { useQuery } from '@pinia/colada'
import { CRYPTO_METRICS_REPO_KEY } from '@/core/injectionKeys'
import type { ICryptoMetricsPort, TimeRange } from '@/core/domain/ports/ICryptoMetricsPort'
import type { Ref } from 'vue'

export function useCryptoMetricsRepo(): ICryptoMetricsPort {
  const repo = inject(CRYPTO_METRICS_REPO_KEY)
  if (!repo) {
    throw new Error(
      '[useCryptoMetricsQueries] ICryptoMetricsPort not provided. ' +
      'Ensure main.ts calls pinia.use() to inject repositories.'
    )
  }
  return repo
}

export function useCryptoKpisQuery() {
  const repo = useCryptoMetricsRepo()

  return useQuery({
    key: ['crypto-metrics-kpis'],
    query: () => repo.getKpis(),
  })
}

export function usePerformanceHistoryQuery(range: Ref<TimeRange>) {
  const repo = useCryptoMetricsRepo()

  return useQuery({
    key: () => ['crypto-performance-history', range.value],
    query: () => repo.getPerformanceHistory(range.value),
  })
}

export function useAssetAllocationQuery() {
  const repo = useCryptoMetricsRepo()

  return useQuery({
    key: ['crypto-asset-allocation'],
    query: () => repo.getAssetAllocation(),
  })
}

export function useVolatilityHeatmapQuery(year: Ref<number>) {
  const repo = useCryptoMetricsRepo()

  return useQuery({
    key: () => ['crypto-volatility-heatmap', year.value],
    query: () => repo.getVolatilityHeatmap(year.value),
  })
}

export function useRiskMetricsQuery() {
  const repo = useCryptoMetricsRepo()

  return useQuery({
    key: ['crypto-risk-metrics'],
    query: () => repo.getRiskMetrics(),
  })
}
