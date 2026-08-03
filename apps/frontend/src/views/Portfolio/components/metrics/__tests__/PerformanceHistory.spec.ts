import { mount } from '@vue/test-utils';
import { describe, it, expect, vi } from 'vitest';
import { ref } from 'vue';
import PerformanceHistory from '../PerformanceHistory.vue';
import type { PerformancePoint, PerformanceMetrics } from '@/core/domain/ports/ICryptoMetricsPort';

// Mock i18n
vi.mock('@/composables/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) => key
  })
}));

// Mock formatters
vi.mock('@/composables/useFormatters', () => ({
  formatCurrency: (v: number) => `$${v}`,
  formatPercent: (v: number) => `${v}%`
}));

// Mock components
vi.mock('@/components/charts/TimeAreaChart.vue', () => ({
  default: {
    name: 'TimeAreaChart',
    template: '<div class="mock-time-area-chart"></div>',
    props: ['data']
  }
}));

// Mock queries
const mockQueryData = {
  isLoading: ref(true),
  data: ref<{ history: PerformancePoint[]; metrics: PerformanceMetrics } | null>(null),
  error: ref<Error | null>(null)
};

vi.mock('@/composables/queries/useCryptoMetricsQueries', () => ({
  usePerformanceHistoryQuery: () => mockQueryData
}));

describe('PerformanceHistory.vue', () => {
  it('renders loading state correctly using Skeleton', () => {
    mockQueryData.isLoading.value = true;
    mockQueryData.data.value = null;
    mockQueryData.error.value = null;
    
    const wrapper = mount(PerformanceHistory);
    // Skeleton component
    expect(wrapper.find('.animate-pulse').exists()).toBe(true);
    expect(wrapper.find('.mock-time-area-chart').exists()).toBe(false);
  });

  it('renders error state correctly', () => {
    mockQueryData.isLoading.value = false;
    mockQueryData.error.value = new Error('Failed to load');
    mockQueryData.data.value = null;
    
    const wrapper = mount(PerformanceHistory);
    expect(wrapper.text()).toContain('metrics.error_loading');
  });

  it('renders the TimeAreaChart and stats correctly when data is loaded', () => {
    mockQueryData.isLoading.value = false;
    mockQueryData.error.value = null;
    mockQueryData.data.value = {
      history: [
        { timestamp: 1696118400, dateStr: '2023-10-01', valueFiat: 10000, costBasisFiat: 9000 },
        { timestamp: 1696204800, dateStr: '2023-10-02', valueFiat: 11000, costBasisFiat: 9000 }
      ],
      metrics: {
        returnFiat: 2000,
        returnPercent: 22.2,
        volatilityPercent: 5.5,
        bestDayPercent: 10.0
      }
    };
    
    const wrapper = mount(PerformanceHistory);
    
    // Check chart
    expect(wrapper.find('.mock-time-area-chart').exists()).toBe(true);
    
    // Check stats rendering
    expect(wrapper.text()).toContain('portfolio.metrics_tabs.performance.stats.return');
    expect(wrapper.text()).toContain('portfolio.metrics_tabs.performance.stats.vs_cost');
    expect(wrapper.text()).toContain('portfolio.metrics_tabs.performance.stats.volatility');
    expect(wrapper.text()).toContain('portfolio.metrics_tabs.performance.stats.best_day');
  });
});
