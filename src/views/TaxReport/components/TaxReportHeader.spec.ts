import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import TaxReportHeader from './TaxReportHeader.vue'
import { Button } from '@/components/ui/button'

vi.mock('@/composables/useI18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

describe('TaxReportHeader.vue', () => {
  it('renders title and badge properly', () => {
    const wrapper = mount(TaxReportHeader)
    expect(wrapper.text()).toContain('tax.title')
    expect(wrapper.text()).toContain('tax.header.badge')
  })

  it('renders wallet dropdown with default props', () => {
    const wrapper = mount(TaxReportHeader)
    const buttonTexts = wrapper.findAll('button').map(b => b.text())
    expect(buttonTexts.some(t => t.includes('All Wallets'))).toBe(true)
  })

  it('emits clear event when trash button is clicked', async () => {
    const wrapper = mount(TaxReportHeader)
    // Find the destructive clear button by title
    const clearButton = wrapper.find('button[title="tax.header.delete_title"]')
    expect(clearButton.exists()).toBe(true)
    
    await clearButton.trigger('click')
    expect(wrapper.emitted()).toHaveProperty('clear')
  })

  it('has Sync Web3 and Subir CSV buttons disabled', () => {
    const wrapper = mount(TaxReportHeader)
    const buttons = wrapper.findAllComponents(Button)
    
    const syncButton = buttons.find(b => b.text().includes('tax.header.sync'))
    const uploadButton = buttons.find(b => b.text().includes('tax.header.upload'))
    
    expect(syncButton?.attributes('disabled')).toBeDefined()
    expect(uploadButton?.attributes('disabled')).toBeDefined()
  })
})
