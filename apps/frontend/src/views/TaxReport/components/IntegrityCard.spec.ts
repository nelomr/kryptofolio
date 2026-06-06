import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import IntegrityCard from './IntegrityCard.vue'

vi.mock('@/composables/useI18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

describe('IntegrityCard.vue', () => {
  it('renders healthy status when there are no warnings', () => {
    const wrapper = mount(IntegrityCard, {
      props: { warnings: [] }
    })
    expect(wrapper.text()).toContain('tax.integrity.title')
    expect(wrapper.text()).toContain('tax.integrity.healthy')
  })

  it('renders loading state when isLoading is true', () => {
    const wrapper = mount(IntegrityCard, {
      props: { isLoading: true }
    })
    expect(wrapper.text()).toContain('tax.integrity.analyzing')
  })

  it('renders warnings when provided', () => {
    const warnings = [
      { id: '1', title: 'Missing Cost Basis', description: 'Some trades are missing cost basis.', severity: 'warning' as const },
      { id: '2', title: 'Negative Balance', description: 'Negative balance detected for BTC.', severity: 'critical' as const }
    ]
    const wrapper = mount(IntegrityCard, {
      props: { warnings }
    })
    const content = wrapper.text()
    expect(content).toContain('Missing Cost Basis')
    expect(content).toContain('Negative balance detected for BTC')
  })
})
