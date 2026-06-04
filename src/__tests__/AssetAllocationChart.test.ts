import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'
import type { ChartData, ChartOptions } from 'chart.js'

// Capture props passed to Doughnut for assertions
let capturedChartData: ChartData<'doughnut'> | null = null
let capturedOptions: ChartOptions<'doughnut'> | null = null

const mockSetActiveElements = vi.fn()
const mockTooltipSetActiveElements = vi.fn()
const mockUpdate = vi.fn()

vi.mock('vue-chartjs', () => ({
  Doughnut: {
    name: 'Doughnut',
    props: ['data', 'options'],
    setup(props: { data: ChartData<'doughnut'>; options: ChartOptions<'doughnut'> }, { expose }: any) {
      capturedChartData = props.data
      capturedOptions = props.options
      expose({
        chart: {
          setActiveElements: mockSetActiveElements,
          tooltip: { setActiveElements: mockTooltipSetActiveElements },
          update: mockUpdate
        }
      })
      return {}
    },
    template: '<canvas data-testid="doughnut-canvas"></canvas>',
  },
}))

vi.mock('chart.js', () => ({
  Chart: { register: vi.fn() },
  ArcElement: {},
  Tooltip: {},
  Legend: {},
}))

import AssetAllocationChart from '@/components/charts/AssetAllocationChart.vue'

const sampleAssets = [
  { label: 'BTC', value: 60, color: '#F7931A' },
  { label: 'ETH', value: 30, color: '#627EEA' },
  { label: 'SOL', value: 10, color: '#9945FF' },
]

describe('AssetAllocationChart', () => {
  beforeEach(() => {
    capturedChartData = null
    capturedOptions = null
    vi.clearAllMocks()
  })

  it('renders the chart wrapper', () => {
    const wrapper = mount(AssetAllocationChart, {
      props: { assets: sampleAssets },
      global: { plugins: [createTestingPinia({ createSpy: vi.fn })] },
    })
    expect(wrapper.find('[data-testid="allocation-chart"]').exists()).toBe(true)
  })

  it('renders the Doughnut chart component', () => {
    const wrapper = mount(AssetAllocationChart, {
      props: { assets: sampleAssets },
      global: { plugins: [createTestingPinia({ createSpy: vi.fn })] },
    })
    expect(wrapper.find('[data-testid="doughnut-canvas"]').exists()).toBe(true)
  })

  it('does not render when assets array is empty', () => {
    const wrapper = mount(AssetAllocationChart, {
      props: { assets: [] },
      global: { plugins: [createTestingPinia({ createSpy: vi.fn })] },
    })
    expect(wrapper.find('[data-testid="allocation-chart"]').exists()).toBe(false)
  })

  it('passes correct labels to chart data', () => {
    mount(AssetAllocationChart, {
      props: { assets: sampleAssets },
      global: { plugins: [createTestingPinia({ createSpy: vi.fn })] },
    })
    expect(capturedChartData?.labels).toEqual(['BTC', 'ETH', 'SOL'])
  })

  it('passes correct values to dataset', () => {
    mount(AssetAllocationChart, {
      props: { assets: sampleAssets },
      global: { plugins: [createTestingPinia({ createSpy: vi.fn })] },
    })
    expect(capturedChartData?.datasets[0].data).toEqual([60, 30, 10])
  })

  it('applies 80% cutout option and hides native legend', () => {
    mount(AssetAllocationChart, {
      props: { assets: sampleAssets },
      global: { plugins: [createTestingPinia({ createSpy: vi.fn })] },
    })
    const opts = capturedOptions as any
    expect(opts.cutout).toBe('80%')
    expect(opts.plugins.legend.display).toBe(false)
  })

  it('highlights doughnut slice when legend item is hovered', async () => {
    const wrapper = mount(AssetAllocationChart, {
      props: { assets: sampleAssets },
      global: { plugins: [createTestingPinia({ createSpy: vi.fn })] },
    })
    
    // Find the CustomChartLegend component and emit hover
    const legend = wrapper.findComponent({ name: 'CustomChartLegend' })
    expect(legend.exists()).toBe(true)
    
    // Emit hover on index 1
    await legend.vm.$emit('hover', 1)
    
    expect(mockSetActiveElements).toHaveBeenCalledWith([{ datasetIndex: 0, index: 1 }])
    expect(mockTooltipSetActiveElements).toHaveBeenCalledWith([{ datasetIndex: 0, index: 1 }], { x: 0, y: 0 })
    expect(mockUpdate).toHaveBeenCalled()
    
    // Emit hover null
    await legend.vm.$emit('hover', null)
    expect(mockSetActiveElements).toHaveBeenCalledWith([])
  })
})
