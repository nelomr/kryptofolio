import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'
import type { Chart } from 'chart.js'
import { useAssetAllocationChart, backgroundTrackPlugin } from '../useAssetAllocationChart'
import type { AssetAllocationItem } from '@/core/domain/ports/ICryptoMetricsPort'

// Minimal fake of the slice of Chart<"doughnut"> the plugin actually reads:
// ctx (canvas 2D context), chartArea (layout box) and getDatasetMeta(0).controller
// (the DoughnutController holding the computed innerRadius/outerRadius for this frame).
function createFakeDoughnutChart(controllerRadii: { innerRadius: number; outerRadius: number }) {
  const ctx = {
    save: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    stroke: vi.fn(),
    restore: vi.fn(),
    lineWidth: 0,
    strokeStyle: '',
  }
  const chart = {
    ctx,
    chartArea: { left: 0, right: 100, top: 0, bottom: 100 },
    getDatasetMeta: vi.fn().mockReturnValue({ controller: controllerRadii }),
  }
  return { ctx, chart: chart as unknown as Chart<'doughnut'> }
}

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

describe('backgroundTrackPlugin', () => {
  it('draws the background track arc using the doughnut controller radii', () => {
    const { ctx, chart } = createFakeDoughnutChart({ innerRadius: 30, outerRadius: 50 })

    backgroundTrackPlugin.beforeDraw?.(chart, { cancelable: true }, {})

    expect(ctx.arc).toHaveBeenCalledWith(50, 50, 40, 0, 2 * Math.PI)
    expect(ctx.stroke).toHaveBeenCalled()
  })

  it('does nothing when the controller has not computed radii yet', () => {
    const { ctx, chart } = createFakeDoughnutChart({ innerRadius: 0, outerRadius: 0 })

    backgroundTrackPlugin.beforeDraw?.(chart, { cancelable: true }, {})

    expect(ctx.arc).not.toHaveBeenCalled()
  })
})
