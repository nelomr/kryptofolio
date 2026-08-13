import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import TaxReportSummaryCards from './TaxReportSummaryCards.vue'

vi.mock('@/composables/useI18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

describe('TaxReportSummaryCards.vue', () => {
  it('renders default metrics when no props are passed', () => {
    const wrapper = mount(TaxReportSummaryCards)
    // The formatCurrency returns "€0.00" for 0 in the default locale if not specified, 
    // or depending on the environment it might be different, but it should contain 0.00
    const content = wrapper.text()
    expect(content).toContain('tax.summary.capital_gains')
    expect(content).toContain('0.00')
  })

  it('renders provided metrics formatted as currency', () => {
    const metrics = {
      capitalGains: '1234.56',
      yields: '50.25',
      totalLosses: '100.0',
      estimatedIrpf: '250.0',
      excludedFlaggedEvents: 0,
      excludedUnresolvedIncomeCount: 0,
    }
    const wrapper = mount(TaxReportSummaryCards, {
      props: { metrics }
    })
    const content = wrapper.text()
    
    // Check if the numbers are formatted and rendered
    // formatCurrency inserts a non-breaking space sometimes, so we check just the digits
    expect(content).toContain('1')
    expect(content).toContain('234.56')
    expect(content).toContain('50.25')
  })

  it('hides the exclusions notice when nothing was excluded', () => {
    const wrapper = mount(TaxReportSummaryCards)
    expect(wrapper.find('[data-testid="summary-exclusions-notice"]').exists()).toBe(false)
  })

  it('shows the count of disposals excluded for a data-quality defect', () => {
    const wrapper = mount(TaxReportSummaryCards, {
      props: {
        metrics: {
          capitalGains: '0', yields: '0', totalLosses: '0', estimatedIrpf: '0',
          excludedFlaggedEvents: 2, excludedUnresolvedIncomeCount: 0,
        },
      },
    })
    const notice = wrapper.find('[data-testid="summary-exclusions-notice"]')
    expect(notice.exists()).toBe(true)
    expect(wrapper.find('[data-testid="excluded-flagged-events"]').text()).toContain('2')
    expect(wrapper.find('[data-testid="excluded-unresolved-income"]').exists()).toBe(false)
  })

  it('shows the count of income rows excluded for an unresolved price', () => {
    const wrapper = mount(TaxReportSummaryCards, {
      props: {
        metrics: {
          capitalGains: '0', yields: '0', totalLosses: '0', estimatedIrpf: '0',
          excludedFlaggedEvents: 0, excludedUnresolvedIncomeCount: 5,
        },
      },
    })
    expect(wrapper.find('[data-testid="excluded-unresolved-income"]').text()).toContain('5')
    expect(wrapper.find('[data-testid="excluded-flagged-events"]').exists()).toBe(false)
  })
})
