import { mount } from '@vue/test-utils';
import { describe, it, expect, vi } from 'vitest';
import { ref } from 'vue';
import PerformanceHistory from '../PerformanceHistory.vue';
import type { PerformancePoint, PerformanceMetrics } from '@/core/domain/ports/ICryptoMetricsPort';

// Mock i18n
vi.mock('@/composables/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) => (params ? `${key}${JSON.stringify(params)}` : key)
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

const mockKpis = {
  data: ref<{ totalCostBasisFiat: number } | null>(null)
};

vi.mock('@/composables/queries/useCryptoMetricsQueries', () => ({
  usePerformanceHistoryQuery: () => mockQueryData,
  useCryptoKpisQuery: () => mockKpis
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
        { timestamp: 1696118400, dateStr: '2023-10-01', valueFiat: 10000 },
        { timestamp: 1696204800, dateStr: '2023-10-02', valueFiat: 11000 }
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

  describe('unconvertible return', () => {
    const loadWith = (metrics: PerformanceMetrics) => {
      mockQueryData.isLoading.value = false;
      mockQueryData.error.value = null;
      mockQueryData.data.value = {
        history: [{ timestamp: 1696118400, dateStr: '2023-10-01', valueFiat: null }],
        metrics
      };
    };

    it('renders a dash and neither the profit nor the loss class for a null return', () => {
      loadWith({ returnFiat: null, returnPercent: null, volatilityPercent: 0, bestDayPercent: 0 });

      const stats = mount(PerformanceHistory).findAll('.stat');
      const returnValue = stats[0].findAll('span').at(-1)!;
      const percentValue = stats[1].findAll('span').at(-1)!;

      expect(returnValue.text()).toBe('—');
      expect(percentValue.text()).toBe('—');
      expect(returnValue.classes()).not.toContain('text-profit');
      expect(returnValue.classes()).not.toContain('text-loss');
      expect(percentValue.classes()).not.toContain('text-profit');
      expect(percentValue.classes()).not.toContain('text-loss');
    });

    it('still colours a genuine zero return as a gain, distinct from null', () => {
      loadWith({ returnFiat: 0, returnPercent: 0, volatilityPercent: 0, bestDayPercent: 0 });

      const returnValue = mount(PerformanceHistory).findAll('.stat')[0].findAll('span').at(-1)!;

      expect(returnValue.classes()).toContain('text-profit');
    });
  });

  describe('description cost', () => {
    const loadHistory = () => {
      mockQueryData.isLoading.value = false;
      mockQueryData.error.value = null;
      mockQueryData.data.value = {
        history: [{ timestamp: 1696118400, dateStr: '2023-10-01', valueFiat: 10 }],
        metrics: { returnFiat: 5, returnPercent: 5, volatilityPercent: 1, bestDayPercent: 1 }
      };
    };

    it('takes the cost from the KPI total cost basis', () => {
      loadHistory();
      mockKpis.data.value = { totalCostBasisFiat: 9000 };

      const text = mount(PerformanceHistory).text();

      expect(text).toContain('portfolio.metrics_tabs.performance.desc{"cost":"$9000"}');
    });

    it('hides the cost clause while the KPI query has no data, instead of showing zero', () => {
      loadHistory();
      mockKpis.data.value = null;

      const text = mount(PerformanceHistory).text();

      expect(text).toContain('portfolio.metrics_tabs.performance.desc_no_cost');
      expect(text).not.toContain('$0');
      expect(text).not.toContain('"cost"');
    });
  });
});
