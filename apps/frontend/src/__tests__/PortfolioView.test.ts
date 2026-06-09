import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'
import { ref } from 'vue'
import PortfolioView from '@/views/Portfolio/PortfolioView.vue'
import * as portfolioData from '@/views/Portfolio/composables/usePortfolioData'

// ── Lucide stubs ──────────────────────────────────────────────────────────────
vi.mock('lucide-vue-next', () => ({
  RefreshCw: { template: '<svg class="lucide-refresh"></svg>' },
  TrendingUp: { template: '<svg class="lucide-trending-up"></svg>' },
  TrendingDown: { template: '<svg class="lucide-trending-down"></svg>' },
  Wallet: { template: '<svg class="lucide-wallet"></svg>' },
}))

// ── Colada stubs ──────────────────────────────────────────────────────────────
vi.mock('@pinia/colada', () => ({
  useQuery: vi.fn().mockReturnValue({
    data: ref({
      totalRoiPercent: 0,
      totalRoiFiat: 0,
      delta24hFiat: 0,
      investedFiat: 0,
      maxDrawdownPercent: 0,
      maxDrawdownFiat: 0,
      recoveredFiat: 0,
      winRatePercent: 0,
      winningTrades: 0,
      losingTrades: 0,
      totalTrades: 0,
      averageR: 0,
      portfolioDispersion: 0,
      bestAsset: { symbol: 'BTC', name: 'Bitcoin', allocationPercent: 50, roiPercent: 10 },
      worstAsset: { symbol: 'XRP', name: 'Ripple', allocationPercent: 10, roiPercent: -5 },
      // Asset Allocation Query requirements
      items: [{ symbol: 'BTC', name: 'Bitcoin', allocationPercent: 100, valueFiat: 1000, colorHex: '#F7931A' }],
      totalAssets: '1 Activo',
      hhiScore: 10000
    }),
    isLoading: ref(false),
    error: ref(null)
  })
}))

// ── Chart stubs ───────────────────────────────────────────────────────────────

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



import { I18N_PORT_KEY, CRYPTO_METRICS_REPO_KEY } from '@/core/injectionKeys'

function mountView(
  dataOverrides: Partial<ReturnType<typeof portfolioData.usePortfolioData>> = {}
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

  return mount(PortfolioView, {
    global: { 
      plugins: [createTestingPinia({ createSpy: vi.fn })],
      provide: {
        [I18N_PORT_KEY as symbol]: {
          translate: (key: string) => key,
          setLanguage: vi.fn(),
          getCurrentLanguage: vi.fn().mockReturnValue('en')
        },
        [CRYPTO_METRICS_REPO_KEY as symbol]: {
          getKpis: vi.fn().mockResolvedValue({
            totalRoiPercent: 0,
            totalRoiFiat: 0,
            delta24hFiat: 0,
            investedFiat: 0,
            maxDrawdownPercent: 0,
            maxDrawdownFiat: 0,
            recoveredFiat: 0,
            winRatePercent: 0,
            winningTrades: 0,
            losingTrades: 0,
            totalTrades: 0,
            averageR: 0,
            portfolioDispersion: 0,
            bestAsset: { symbol: 'BTC', name: 'Bitcoin', allocationPercent: 50, roiPercent: 10 },
            worstAsset: { symbol: 'XRP', name: 'Ripple', allocationPercent: 10, roiPercent: -5 }
          })
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



  it('renders the metrics grid (4 cols on lg)', () => {
    const wrapper = mountView()
    expect(wrapper.find('.grid.lg\\:grid-cols-4').exists()).toBe(true)
  })

  it('displays the mocked KPI data from Colada', () => {
    const wrapper = mountView()
    expect(wrapper.text()).toContain('BTC / XRP')
  })
})
