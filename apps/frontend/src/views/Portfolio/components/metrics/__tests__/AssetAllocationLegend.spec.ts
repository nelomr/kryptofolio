import { mount } from '@vue/test-utils'
import { describe, it, expect, vi } from 'vitest'
import AssetAllocationLegend from '../AssetAllocationLegend.vue'

// Mock useI18n to just return the key
vi.mock('@/composables/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) => key
  })
}))

describe('AssetAllocationLegend.vue', () => {
  it('renders a list of items correctly', () => {
    const mockItems = [
      { symbol: 'BTC', name: 'Bitcoin', allocationPercent: 70, valueFiat: 7000, colorHex: '#F7931A' },
      { symbol: 'ETH', name: 'Ethereum', allocationPercent: 30, valueFiat: 3000, colorHex: '#627EEA' }
    ] as any // type casting to avoid strict issues if other props are missing, but it should match

    const wrapper = mount(AssetAllocationLegend, {
      props: {
        items: mockItems
      }
    })

    // Assert that we have two rows
    const rows = wrapper.findAll('.row')
    expect(rows.length).toBe(2)

    // Assert first row content (BTC)
    const firstRow = rows[0]
    expect(firstRow.find('.swatch').attributes('style')).toMatch(/background:\s*(#F7931A|rgb\(247,\s*147,\s*26\))/i)
    expect(firstRow.find('.tk').text()).toContain('BTC')
    expect(firstRow.find('.tk span').text()).toContain('Bitcoin')
    expect(firstRow.find('.pct').text()).toBe('70%')
    
    // Assert second row content (ETH)
    const secondRow = rows[1]
    expect(secondRow.find('.tk').text()).toContain('ETH')
    expect(secondRow.find('.pct').text()).toBe('30%')
  })

  it('renders empty when no items provided', () => {
    const wrapper = mount(AssetAllocationLegend, {
      props: {
        items: []
      }
    })

    const rows = wrapper.findAll('.row')
    expect(rows.length).toBe(0)
  })
})
