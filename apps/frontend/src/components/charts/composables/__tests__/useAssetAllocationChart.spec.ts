import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'
import { useAssetAllocationChart } from '../useAssetAllocationChart'
import type { AssetAllocationItem } from '@/core/domain/ports/ICryptoMetricsPort'

vi.mock('@/composables/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) => key
  })
}))

describe('useAssetAllocationChart', () => {
  it('maps AssetAllocationItems to ChartData correctly', () => {
    const mockItems = ref<AssetAllocationItem[]>([
      { symbol: 'BTC', name: 'Bitcoin', allocationPercent: 70, valueFiat: 7000, colorHex: '#F7931A' },
      { symbol: 'ETH', name: 'Ethereum', allocationPercent: 30, valueFiat: 3000, colorHex: '#627EEA' }
    ])

    const { chartData } = useAssetAllocationChart(mockItems)

    expect(chartData.value.labels).toEqual(['BTC', 'ETH'])
    expect(chartData.value.datasets[0].data).toEqual([70, 30])
    expect(chartData.value.datasets[0].backgroundColor).toEqual(['#F7931A', '#627EEA'])
    expect(chartData.value.datasets[0].borderWidth).toBe(0)
  })

  it('handles empty items correctly', () => {
    const mockItems = ref<AssetAllocationItem[]>([])
    const { chartData } = useAssetAllocationChart(mockItems)

    expect(chartData.value.labels).toEqual([])
    expect(chartData.value.datasets[0].data).toEqual([])
    expect(chartData.value.datasets[0].backgroundColor).toEqual([])
  })

  it('handles undefined items correctly', () => {
    const mockItems = ref<AssetAllocationItem[] | undefined>(undefined)
    const { chartData } = useAssetAllocationChart(mockItems)

    expect(chartData.value.labels).toEqual([])
    expect(chartData.value.datasets[0].data).toEqual([])
    expect(chartData.value.datasets[0].backgroundColor).toEqual([])
  })

  it('returns valid chartOptions', () => {
    const mockItems = ref<AssetAllocationItem[]>([])
    const { chartOptions } = useAssetAllocationChart(mockItems)

    expect(chartOptions.value.responsive).toBe(true)
    expect(chartOptions.value.cutout).toBe('74%')
    expect(chartOptions.value.plugins?.legend?.display).toBe(false)
  })
})
