import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import RiskMetricsCard from '../RiskMetricsCard.vue'

// Mock useI18n
vi.mock('@/composables/useI18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

// Mock the query composable
vi.mock('@/composables/queries/useCryptoMetricsQueries', () => ({
  useRiskMetricsQuery: vi.fn(() => ({
    data: ref({
      sharpeRatio: 2.18,
      sortinoRatio: 2.62,
      betaVsBtc: 0.87,
      alphaPercent: 4.2,
      calmarRatio: 3.41,
      history: [1.5, 1.8, 2.0, 2.18]
    }),
    isLoading: ref(false),
    error: ref(null)
  }))
}))

describe('RiskMetricsCard.vue', () => {
  it('renders correctly with data', () => {
    const wrapper = mount(RiskMetricsCard, {
      global: {
        stubs: {
          ChartSkeleton: true
        }
      }
    })

    // Check if Sharpe ratio is rendered
    expect(wrapper.text()).toContain('2.18')
    
    // Check if bottom stats are rendered (Sharpe, Sortino, Calmar)
    expect(wrapper.text()).toContain('portfolio.metrics_tabs.risk.stats.sharpe')
    expect(wrapper.text()).toContain('portfolio.metrics_tabs.risk.stats.sortino')
    expect(wrapper.text()).toContain('portfolio.metrics_tabs.risk.stats.calmar')
    
    // Check if calmar value is rendered
    expect(wrapper.text()).toContain('3.41')
  })
})
