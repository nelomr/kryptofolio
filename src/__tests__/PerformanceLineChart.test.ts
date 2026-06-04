import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'

// Use vi.hoisted so mocks are available when vi.mock factory runs
const { mockSetData, mockAddSeries, mockRemove, mockCreateChart, mockSetVisibleRange, mockApplyOptions, mockCreateSeriesMarkers, mockSetMarkers } =
  vi.hoisted(() => {
    const mockFitContent = vi.fn()
    const mockSetVisibleRange = vi.fn()
    const mockSetData = vi.fn()
    const mockApplyOptions = vi.fn()
    const mockSetMarkers = vi.fn()
    const mockCreateSeriesMarkers = vi.fn(() => ({ setMarkers: mockSetMarkers }))
    const mockAddSeries = vi.fn(() => ({ setData: mockSetData }))
    const mockRemove = vi.fn()
    const mockCreateChart = vi.fn(() => ({
      addSeries: mockAddSeries,
      addAreaSeries: mockAddSeries,
      timeScale: () => ({ fitContent: mockFitContent, setVisibleRange: mockSetVisibleRange }),
      remove: mockRemove,
      subscribeCrosshairMove: vi.fn(),
      applyOptions: mockApplyOptions,
    }))
    return { mockSetData, mockAddSeries, mockRemove, mockCreateChart, mockSetVisibleRange, mockApplyOptions, mockCreateSeriesMarkers, mockSetMarkers }
  })

vi.mock('lightweight-charts', () => ({
  createChart: mockCreateChart,
  ColorType: { Solid: 'solid' },
  AreaSeries: class AreaSeries {},
  createSeriesMarkers: mockCreateSeriesMarkers,
}))

import PerformanceLineChart from '@/components/charts/PerformanceLineChart.vue'

const sampleData = [
  { time: '2025-01-01', value: 100 },
  { time: '2025-01-02', value: 120 },
  { time: '2025-01-03', value: 115 },
]

describe('PerformanceLineChart', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders a container div for the chart when data is provided', () => {
    const wrapper = mount(PerformanceLineChart, {
      props: { data: sampleData },
      global: { plugins: [createTestingPinia({ createSpy: vi.fn })] },
    })
    expect(wrapper.find('[data-testid="performance-chart"]').exists()).toBe(true)
  })

  it('instantiates createChart on mount', () => {
    mount(PerformanceLineChart, {
      props: { data: sampleData },
      global: { plugins: [createTestingPinia({ createSpy: vi.fn })] },
    })
    expect(mockCreateChart).toHaveBeenCalledOnce()
  })

  it('adds a series (v5 API) and sets data', () => {
    mount(PerformanceLineChart, {
      props: { data: sampleData },
      global: { plugins: [createTestingPinia({ createSpy: vi.fn })] },
    })
    expect(mockAddSeries).toHaveBeenCalledOnce()
    expect(mockSetData).toHaveBeenCalledWith(sampleData)
  })

  it('calls chart.remove on unmount', () => {
    const wrapper = mount(PerformanceLineChart, {
      props: { data: sampleData },
      global: { plugins: [createTestingPinia({ createSpy: vi.fn })] },
    })
    wrapper.unmount()
    expect(mockRemove).toHaveBeenCalledOnce()
  })

  it('does not render the container when data is empty (v-if guard)', () => {
    const wrapper = mount(PerformanceLineChart, {
      props: { data: [] },
      global: { plugins: [createTestingPinia({ createSpy: vi.fn })] },
    })
    expect(wrapper.find('[data-testid="performance-chart"]').exists()).toBe(false)
  })

  it('filters timeframe correctly to 1D', async () => {
    const wrapper = mount(PerformanceLineChart, {
      props: { data: sampleData },
      global: { plugins: [createTestingPinia({ createSpy: vi.fn })] },
    })
    
    // Find all buttons, 1D is the first one
    const buttons = wrapper.findAll('button')
    const oneDayBtn = buttons.find(b => b.text() === '1D')
    expect(oneDayBtn).toBeDefined()
    
    await oneDayBtn!.trigger('click')
    // Check if setVisibleRange was called
    expect(mockSetVisibleRange).toHaveBeenCalled()
  })

  it('creates series markers for deposit and withdrawal events', () => {
    const eventData = [
      ...sampleData,
      { time: '2025-01-04', value: 110, type: 'deposit' as const, amount: 50 },
    ]
    mount(PerformanceLineChart, {
      props: { data: eventData },
      global: { plugins: [createTestingPinia({ createSpy: vi.fn })] },
    })
    expect(mockCreateSeriesMarkers).toHaveBeenCalled()
    const markersCallArgs = mockCreateSeriesMarkers.mock.calls[0][1]
    expect(markersCallArgs[0]).toMatchObject({
      time: '2025-01-04',
      position: 'belowBar',
      color: '#10b981',
      shape: 'arrowUp',
      text: '+50€'
    })
  })

  it('reveals chart axes by changing textColor on mouseenter', async () => {
    const wrapper = mount(PerformanceLineChart, {
      props: { data: sampleData },
      global: { plugins: [createTestingPinia({ createSpy: vi.fn })] },
    })
    
    const container = wrapper.find('[data-testid="performance-chart"]')
    await container.trigger('mouseenter')
    
    // Check if applyOptions was called with a solid text color
    expect(mockApplyOptions).toHaveBeenCalledWith(expect.objectContaining({
      layout: expect.objectContaining({ textColor: '#94a3b8' })
    }))

    await container.trigger('mouseleave')
    // Check if reverted to transparent
    expect(mockApplyOptions).toHaveBeenCalledWith(expect.objectContaining({
      layout: expect.objectContaining({ textColor: 'transparent' })
    }))
  })
})
