import { mount } from '@vue/test-utils';
import { describe, it, expect, vi } from 'vitest';
import { ref } from 'vue';
import DrawdownCurve from '../DrawdownCurve.vue';

// Mock i18n
vi.mock('@/composables/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) => key
  })
}));

// Mock TimeAreaChart
vi.mock('@/components/charts/TimeAreaChart.vue', () => ({
  default: {
    name: 'TimeAreaChart',
    template: '<div class="mock-time-area-chart"></div>',
    props: ['data', 'isPercent', 'hideCostBasis', 'baselineValue', 'lineColor', 'topColor', 'bottomColor', 'tooltipLabel']
  }
}));

// Mock queries
const mockQueryData = {
  isLoading: ref(true),
  data: ref<any>(null),
  error: ref<any>(null)
};

vi.mock('@/composables/queries/useCryptoMetricsQueries', () => ({
  useDrawdownCurveQuery: () => mockQueryData
}));

describe('DrawdownCurve.vue', () => {
  it('renders loading state correctly using Skeleton', () => {
    mockQueryData.isLoading.value = true;
    mockQueryData.data.value = null;
    mockQueryData.error.value = null;
    
    const wrapper = mount(DrawdownCurve);
    expect(wrapper.find('.animate-pulse').exists()).toBe(true);
    expect(wrapper.find('.mock-time-area-chart').exists()).toBe(false);
  });

  it('renders error state correctly', () => {
    mockQueryData.isLoading.value = false;
    mockQueryData.error.value = new Error('Failed to load');
    mockQueryData.data.value = null;
    
    const wrapper = mount(DrawdownCurve);
    expect(wrapper.text()).toContain('metrics.error_loading');
  });

  it('renders TimeAreaChart with drawdown data when loaded', () => {
    mockQueryData.isLoading.value = false;
    mockQueryData.error.value = null;
    mockQueryData.data.value = [
      { timestamp: 1672531200, drawdownPercent: -1.2 },
      { timestamp: 1672617600, drawdownPercent: -0.5 }
    ];
    
    const wrapper = mount(DrawdownCurve);
    const chart = wrapper.findComponent({ name: 'TimeAreaChart' });
    
    expect(chart.exists()).toBe(true);
    expect(chart.props('data')).toEqual(mockQueryData.data.value);
    expect(chart.props('isPercent')).toBe(true);
    expect(chart.props('hideCostBasis')).toBe(true);
    expect(chart.props('baselineValue')).toBe(0);
  });
});
