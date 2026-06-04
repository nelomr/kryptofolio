import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import CustomChartLegend from '@/components/charts/CustomChartLegend.vue'

const sampleAssets = [
  { label: 'BTC', value: 600, color: '#F7931A', change24h: 2.5 },
  { label: 'ETH', value: 400, color: '#627EEA', change24h: -1.2 },
]

describe('CustomChartLegend', () => {
  it('renders a list of assets with correct percentages', () => {
    const wrapper = mount(CustomChartLegend, {
      props: { assets: sampleAssets }
    })
    
    const items = wrapper.findAll('div.flex.items-center.justify-between')
    expect(items).toHaveLength(2)
    
    // Total is 1000. BTC is 60%, ETH is 40%
    expect(items[0].text()).toContain('BTC')
    expect(items[0].text()).toContain('60.0%')
    expect(items[0].text()).toContain('+2.50%')
    
    expect(items[1].text()).toContain('ETH')
    expect(items[1].text()).toContain('40.0%')
    expect(items[1].text()).toContain('-1.20%')
  })

  it('emits hover event on mouseenter and mouseleave', async () => {
    const wrapper = mount(CustomChartLegend, {
      props: { assets: sampleAssets }
    })
    
    const items = wrapper.findAll('div.flex.items-center.justify-between')
    
    // Hover over BTC (index 0)
    await items[0].trigger('mouseenter')
    expect(wrapper.emitted('hover')).toBeTruthy()
    expect(wrapper.emitted('hover')![0]).toEqual([0])
    
    // Leave BTC
    await items[0].trigger('mouseleave')
    expect(wrapper.emitted('hover')![1]).toEqual([null])
  })
})
