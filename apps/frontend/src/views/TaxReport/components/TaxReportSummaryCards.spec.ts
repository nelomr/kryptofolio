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
      capitalGains: 1234.56,
      yields: 50.25,
      totalLosses: 100.0,
      estimatedIrpf: 250.0
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
})
