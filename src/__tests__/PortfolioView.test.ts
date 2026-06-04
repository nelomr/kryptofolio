import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'
import { ref, computed } from 'vue'
import PortfolioView from '@/views/Portfolio/PortfolioView.vue'
import * as portfolioData from '@/views/Portfolio/composables/usePortfolioData'

// ── Lucide stubs ──────────────────────────────────────────────────────────────
vi.mock('lucide-vue-next', () => ({
  RefreshCw: { template: '<svg class="lucide-refresh"></svg>' },
  TrendingUp: { template: '<svg class="lucide-trending-up"></svg>' },
  TrendingDown: { template: '<svg class="lucide-trending-down"></svg>' },
  Wallet: { template: '<svg class="lucide-wallet"></svg>' },
}))

// ── Chart stubs ───────────────────────────────────────────────────────────────
vi.mock('@/components/charts/PerformanceLineChart.vue', () => ({
  default: {
    name: 'PerformanceLineChart',
    template: '<div data-testid="performance-chart-stub"></div>',
    props: ['data'],
  },
}))

vi.mock('@/components/charts/AssetAllocationChart.vue', () => ({
  default: {
    name: 'AssetAllocationChart',
    template: '<div data-testid="allocation-chart-stub"></div>',
    props: ['assets'],
  },
}))

vi.mock('@/components/ui/tabs', () => ({
  Tabs: { template: '<div><slot /></div>' },
  TabsList: { template: '<div><slot /></div>' },
  TabsTrigger: { template: '<button><slot /></button>' },
  TabsContent: { template: '<div><slot /></div>' }
}))

// ── Fixtures ──────────────────────────────────────────────────────────────────
const mockMetrics = {
  totalEquityEur: 10000,
  totalUnrealizedPnlEur: 500,
  totalRealizedPnlEur: 100,
}

const mockAllocation = [
  { label: 'BTC', value: 6000, color: '#F7931A' },
  { label: 'ETH', value: 4000, color: '#627EEA' },
]

const mockPerformance = [
  { time: '2025-01-01', value: 9500 },
  { time: '2025-01-07', value: 10000 },
]

import * as chartData from '@/views/Portfolio/composables/useChartData'

import { I18N_PORT_KEY } from '@/core/injectionKeys'

function mountView(
  dataOverrides: Partial<ReturnType<typeof portfolioData.usePortfolioData>> = {},
  chartOverrides: Partial<ReturnType<typeof chartData.useChartData>> = {}
) {
  vi.spyOn(portfolioData, 'usePortfolioData').mockReturnValue({
    metrics: ref(mockMetrics),
    isFetching: ref(false),
    isRebuilding: ref(false),
    handleRebuild: vi.fn(),
    store: {} as any,
    filteredHoldings: ref([]),
    isModalOpen: ref(false),
    selectedSymbol: ref(''),
    selectedHolding: ref(undefined),
    tokenDetails: ref(undefined),
    isFetchingDetails: ref(false),
    handleExpandSymbol: vi.fn(),
    expandedDetailsMap: ref({}),
    handleRowExpand: vi.fn(),
    ...dataOverrides,
  } as any)

  vi.spyOn(chartData, 'useChartData').mockReturnValue({
    allocationData: ref(mockAllocation),
    performanceData: ref(mockPerformance),
    ...chartOverrides,
  } as any)

  return mount(PortfolioView, {
    global: { 
      plugins: [createTestingPinia({ createSpy: vi.fn })],
      provide: {
        [I18N_PORT_KEY as symbol]: {
          translate: (key: string) => key,
          setLanguage: vi.fn(),
          getCurrentLanguage: vi.fn().mockReturnValue('en')
        }
      }
    },
  })
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe('PortfolioView', () => {
  it('renders the outer flex-col container', () => {
    const wrapper = mountView()
    expect(wrapper.classes()).toContain('flex')
    expect(wrapper.classes()).toContain('flex-col')
  })

  it('renders the header landmark', () => {
    const wrapper = mountView()
    expect(wrapper.find('header').exists()).toBe(true)
  })

  it('shows green status dot when not fetching', () => {
    const wrapper = mountView({ isFetching: ref(false) })
    // Status dot uses bg-profit class when idle
    const dot = wrapper.find('.bg-profit')
    expect(dot.exists()).toBe(true)
  })

  it('shows amber pulse when isFetching is true', () => {
    const wrapper = mountView({ isFetching: ref(true) })
    expect(wrapper.find('.animate-pulse').exists()).toBe(true)
  })

  it('shows "(Sincronizando...)" text when fetching', () => {
    const wrapper = mountView({ isFetching: ref(true) })
    expect(wrapper.text()).toContain('portfolio.syncing')
  })

  it('calls handleRebuild on button click', async () => {
    const mockRebuild = vi.fn()
    const wrapper = mountView({ handleRebuild: mockRebuild })
    await wrapper.find('button').trigger('click')
    expect(mockRebuild).toHaveBeenCalledOnce()
  })



  it('renders PerformanceLineChart when performanceData is not empty', () => {
    const wrapper = mountView()
    expect(wrapper.find('[data-testid="performance-chart-stub"]').exists()).toBe(true)
  })

  it('renders AssetAllocationChart when allocationData is not empty', () => {
    const wrapper = mountView()
    expect(wrapper.find('[data-testid="allocation-chart-stub"]').exists()).toBe(true)
  })

  it('hides charts when data arrays are empty', () => {
    const wrapper = mountView({}, {
      allocationData: computed(() => []),
      performanceData: computed(() => []),
    })
    expect(wrapper.find('[data-testid="performance-chart-stub"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="allocation-chart-stub"]').exists()).toBe(false)
  })

  it('renders the metrics grid (3 cols on md)', () => {
    const wrapper = mountView()
    expect(wrapper.find('.grid.md\\:grid-cols-3').exists()).toBe(true)
  })

  it('displays formatted equity value', () => {
    const wrapper = mountView()
    expect(wrapper.text()).toMatch(/10[.,]?000/)
  })
})
