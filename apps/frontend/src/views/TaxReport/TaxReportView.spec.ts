import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import TaxReportView from './TaxReportView.vue'
import TaxReportHeader from './components/TaxReportHeader.vue'
import TaxReportSummaryCards from './components/TaxReportSummaryCards.vue'
import IntegrityCard from './components/IntegrityCard.vue'
import PendingValuesReview from './components/PendingValuesReview.vue'


// Mock the composable
vi.mock('./composables/useTaxReportPort', () => ({
  useTaxReportPort: () => ({
    isLoading: false,
    report: { value: null },
    metrics: { capitalGains: 100, yields: 200, totalLosses: 50, estimatedIrpf: 300 },
    warnings: [],
    availableYears: [2024],
    selectedYear: 2024,
    effectiveYear: 2024,
    syncWeb3: vi.fn(),
    uploadCsv: vi.fn(),
    clearData: vi.fn()
  })
}))

vi.mock('@/composables/useI18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

vi.mock('./composables/useWalletsPort', () => ({
  useWalletsPort: () => ({
    walletNames: ['All Wallets'],
    uploadWalletCsv: vi.fn(),
    isUploading: false
  })
}))

vi.mock('@/composables/queries/useTaxQueries', async () => {
  const vue = await import('vue')
  return {
    useSpotTransactionsQuery: vi.fn(() => ({ data: vue.ref([]), isLoading: vue.ref(false) })),
    useFuturesTransactionsQuery: vi.fn(() => ({ data: vue.ref([]), isLoading: vue.ref(false) })),
    useFuturesDerivativesQuery: vi.fn(() => ({ data: vue.ref([]), isLoading: vue.ref(false) })),
    useTaxReportQuery: vi.fn(() => ({ data: vue.ref(null), isLoading: vue.ref(false) })),
    useAvailableYearsQuery: vi.fn(() => ({ data: vue.ref([2024]), isLoading: vue.ref(false) })),
    useFiscalIntegrityQuery: vi.fn(() => ({
      data: vue.ref({
        groups: [],
        totalDefects: 0,
        pendingReview: 0,
        needsRecalculation: false,
      }),
      isLoading: vue.ref(false),
      refresh: vi.fn(),
    })),
  }
})

vi.mock('@/composables/queries/useTaxMutations', async () => {
  const vue = await import('vue')
  const mutation = () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isLoading: vue.ref(false) })
  return {
    useSetManualPriceOverrideMutation: vi.fn(mutation),
    useSetTransferDestinationMutation: vi.fn(mutation),
  }
})

vi.mock('@/composables/queries/useSettingsQueries', async () => {
  const vue = await import('vue')
  return {
    useSelectableAccountsQuery: vi.fn(() => ({
      data: vue.ref([
        { id: 'kraken', name: 'Kraken', type: 'exchange', parentAccountId: null },
        { id: 'kraken:earn', name: 'Kraken / earn', type: 'exchange', parentAccountId: 'kraken' },
      ]),
      isLoading: vue.ref(false),
    })),
  }
})

vi.mock('@/composables/queries/usePortfolioQueries', async () => {
  const vue = await import('vue')
  return {
    useRebuildMutation: vi.fn(() => ({
      mutate: vi.fn(),
      mutateAsync: vi.fn(),
      isLoading: vue.ref(false),
    })),
  }
})

describe('TaxReportView.vue', () => {
  it('renders all dumb components', () => {
    const wrapper = mount(TaxReportView, {
      global: {
        stubs: {
          TaxReportHeader: true,
          TaxReportSummaryCards: true
        }
      }
    })

    expect(wrapper.findComponent(TaxReportHeader).exists()).toBe(true)
    expect(wrapper.findComponent(TaxReportSummaryCards).exists()).toBe(true)
    expect(wrapper.findComponent(IntegrityCard).exists()).toBe(true)
    expect(wrapper.findComponent(PendingValuesReview).exists()).toBe(true)
  })

  it('feeds the destination picker from the selectable-accounts query', () => {
    const wrapper = mount(TaxReportView, {
      global: { stubs: { TaxReportHeader: true, TaxReportSummaryCards: true } },
    })

    expect(wrapper.findComponent(PendingValuesReview).props('accounts')).toEqual([
      { id: 'kraken', name: 'Kraken' },
      { id: 'kraken:earn', name: 'Kraken / earn' },
    ])
  })

  it('renders Tabs navigation', () => {
    const wrapper = mount(TaxReportView)
    const content = wrapper.text()
    expect(content).toContain('tax.tabs.ledgers')
    expect(content).toContain('tax.tabs.report')
    expect(content).toContain('tax.tabs.chat')
  })
})
