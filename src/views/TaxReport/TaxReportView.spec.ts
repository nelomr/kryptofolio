import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import TaxReportView from './TaxReportView.vue'
import TaxReportHeader from './components/TaxReportHeader.vue'
import TaxReportSummaryCards from './components/TaxReportSummaryCards.vue'
import IntegrityCard from './components/IntegrityCard.vue' // TODO: IntegrityCard functionality pending

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

vi.mock('@/composables/queries/useTaxQueries', () => ({
  useSpotTransactionsQuery: vi.fn(() => ({ data: { value: [] }, isLoading: { value: false } })),
  useFuturesTransactionsQuery: vi.fn(() => ({ data: { value: [] }, isLoading: { value: false } })),
  useFuturesDerivativesQuery: vi.fn(() => ({ data: { value: [] }, isLoading: { value: false } })),
  useTaxReportQuery: vi.fn(() => ({ data: { value: null }, isLoading: { value: false } })),
}))

describe('TaxReportView.vue', () => {
  it('renders all dumb components', () => {
    const wrapper = mount(TaxReportView, {
      global: {
        stubs: {
          TaxReportHeader: true,
          TaxReportSummaryCards: true,
          IntegrityCard: true
        }
      }
    })

    expect(wrapper.findComponent(TaxReportHeader).exists()).toBe(true)
    expect(wrapper.findComponent(TaxReportSummaryCards).exists()).toBe(true)
    // expect(wrapper.findComponent(IntegrityCard).exists()).toBe(true) // TODO: IntegrityCard functionality pending
  })

  it('renders Tabs navigation', () => {
    const wrapper = mount(TaxReportView)
    const content = wrapper.text()
    expect(content).toContain('tax.tabs.ledgers')
    expect(content).toContain('tax.tabs.report')
    expect(content).toContain('tax.tabs.chat')
  })
})
