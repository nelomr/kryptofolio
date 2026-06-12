import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import TaxReportHeader from './TaxReportHeader.vue'
import { Button } from '@/components/ui/button'

vi.mock('@/composables/useI18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

vi.mock('../composables/useWalletsPort', () => ({
  useWalletsPort: () => ({
    walletNames: ['All Wallets', 'Tangem'],
    uploadWalletCsv: vi.fn(),
    isUploading: false
  })
}))

describe('TaxReportHeader.vue', () => {
  it('renders wallet dropdown with default props', () => {
    const wrapper = mount(TaxReportHeader)
    const buttonTexts = wrapper.findAll('button').map(b => b.text())
    expect(buttonTexts.some(t => t.includes('All Wallets'))).toBe(true)
  })



  it('has Sync Web3 and Subir CSV buttons disabled', () => {
    const wrapper = mount(TaxReportHeader)
    const buttons = wrapper.findAllComponents(Button)
    
    const syncButton = buttons.find(b => b.text().includes('tax.header.sync'))
    const uploadButton = buttons.find(b => b.text().includes('tax.header.upload'))
    
    expect(syncButton?.attributes('disabled')).toBeDefined()
    expect(uploadButton?.attributes('disabled')).toBeDefined()
  })

  it('renders Upload Wallets button and hidden input', () => {
    const wrapper = mount(TaxReportHeader)
    const buttons = wrapper.findAllComponents(Button)
    const uploadWalletsButton = buttons.find(b => b.text().includes('Subir Wallets') || b.text().includes('Upload Wallets') || b.text().includes('tax.wallets.upload'))
    
    expect(uploadWalletsButton?.exists()).toBe(true)
    
    const hiddenInput = wrapper.find('input[type="file"]')
    expect(hiddenInput.exists()).toBe(true)
  })
})
