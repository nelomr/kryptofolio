import { mount } from '@vue/test-utils'
import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'
import AssetAllocation from '../AssetAllocation.vue'
import type { AssetAllocationItem } from '@/core/domain/ports/ICryptoMetricsPort'

vi.mock('@/composables/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) => key
  })
}))

vi.mock('vue-chartjs', () => ({
  Doughnut: {
    name: 'Doughnut',
    template: '<div class="mock-doughnut"></div>',
    props: ['data', 'options']
  }
}))

// We create a factory to let us override the mocked query results per test
const mockQueryData = {
  isLoading: ref(true),
  data: ref<{ items: AssetAllocationItem[]; totalAssets: number; hhiScore: number } | null>(null),
  error: ref<Error | null>(null)
}

vi.mock('@/composables/queries/useCryptoMetricsQueries', () => ({
  useAssetAllocationQuery: () => mockQueryData
}))

describe('AssetAllocation.vue', () => {
  it('renders loading state correctly using Skeleton component', () => {
    mockQueryData.isLoading.value = true
    mockQueryData.data.value = null
    mockQueryData.error.value = null
    
    const wrapper = mount(AssetAllocation)
    // shadcn Skeleton components use animate-pulse
    expect(wrapper.find('.animate-pulse').exists()).toBe(true)
    // Verify it doesn't render the chart yet
    expect(wrapper.find('.mock-doughnut').exists()).toBe(false)
  })

  it('renders error state correctly', () => {
    mockQueryData.isLoading.value = false
    mockQueryData.error.value = new Error('Failed to load')
    mockQueryData.data.value = null
    
    const wrapper = mount(AssetAllocation)
    expect(wrapper.text()).toContain('metrics.error_loading')
  })

  it('renders the Donut Chart and Legend correctly when data is loaded', () => {
    mockQueryData.isLoading.value = false
    mockQueryData.error.value = null
    mockQueryData.data.value = {
      items: [
        { symbol: 'BTC', name: 'Bitcoin', allocationPercent: 70, valueFiat: 7000, colorHex: '#F7931A' },
        { symbol: 'ETH', name: 'Ethereum', allocationPercent: 30, valueFiat: 3000, colorHex: '#627EEA' }
      ],
      totalAssets: 2,
      hhiScore: 5800
    }

    const wrapper = mount(AssetAllocation)

    // Check if the vue-chartjs Doughnut component is rendered
    expect(wrapper.find('.mock-doughnut').exists()).toBe(true)

    // Check center text overlay renders totalAssets (ICryptoMetricsPort types this as a
    // plain count, not a pre-formatted label; the component interpolates it as-is)
    expect(wrapper.text()).toContain('2')
    
    // Check if HHI score is rendered properly with number formatting
    expect(wrapper.text()).toContain('metrics.hhi_kicker')
    expect(wrapper.text()).toContain('5,800')
  })
})
