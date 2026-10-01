import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createApp, h, ref } from 'vue'

const setData = vi.fn()

vi.mock('lightweight-charts', () => ({
  createChart: () => ({
    addSeries: () => ({ setData, priceToCoordinate: () => 0 }),
    subscribeCrosshairMove: vi.fn(),
    timeScale: () => ({ fitContent: vi.fn() }),
    applyOptions: vi.fn(),
    remove: vi.fn(),
  }),
  ColorType: { Solid: 'solid' },
  LineStyle: { Dashed: 2 },
  AreaSeries: 'area',
  LineSeries: 'line',
  BaselineSeries: 'baseline',
}))

vi.mock('@/composables/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))

import { usePerformanceChart, type PerformanceChartPoint } from '../usePerformanceChart'

function mountChart(points: PerformanceChartPoint[]) {
  const data = ref(points)
  const app = createApp({
    setup() {
      usePerformanceChart(
        ref(document.createElement('div')),
        ref(document.createElement('div')),
        ref(document.createElement('div')),
        data,
        { hideCostBasis: true },
      )
      return () => h('div')
    },
  })
  app.mount(document.createElement('div'))
  return data
}

describe('usePerformanceChart null values', () => {
  beforeEach(() => setData.mockClear())

  it('hands a null value to the series as a gap, never as a plotted zero', () => {
    mountChart([
      { timestamp: 100, valueFiat: null },
      { timestamp: 200, valueFiat: 50 },
    ])

    const plotted = setData.mock.calls[0][0] as Array<{ time: number; value?: number }>
    expect(plotted).toHaveLength(2)
    expect(plotted[0]).toEqual({ time: 100 })
    expect(plotted[0]).not.toHaveProperty('value')
    expect(plotted[1]).toEqual({ time: 200, value: 50 })
  })

  it('keeps a genuine zero as a plotted zero', () => {
    mountChart([{ timestamp: 100, valueFiat: 0 }])

    const plotted = setData.mock.calls[0][0] as Array<{ time: number; value?: number }>
    expect(plotted[0]).toEqual({ time: 100, value: 0 })
  })
})
