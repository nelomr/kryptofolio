import { mount } from '@vue/test-utils';
import { describe, it, expect, vi } from 'vitest';
import { ref } from 'vue';
import VolatilityHeatmap from '../VolatilityHeatmap.vue';
import type { VolatilityHeatmapEntity } from '@/core/domain/ports/ICryptoMetricsPort';

// Mock i18n
vi.mock('@/composables/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) => key
  })
}));

// Mock queries
const mockQueryData = {
  isLoading: ref(true),
  data: ref<VolatilityHeatmapEntity | null>(null),
  error: ref<Error | null>(null)
};

vi.mock('@/composables/queries/useCryptoMetricsQueries', () => ({
  useVolatilityHeatmapQuery: () => mockQueryData
}));

describe('VolatilityHeatmap.vue', () => {
  it('renders loading state correctly using Skeleton', () => {
    mockQueryData.isLoading.value = true;
    mockQueryData.data.value = null;
    mockQueryData.error.value = null;
    
    const wrapper = mount(VolatilityHeatmap);
    // Skeleton component usually has animate-pulse class
    expect(wrapper.find('.animate-pulse').exists()).toBe(true);
  });

  it('renders error state correctly', () => {
    mockQueryData.isLoading.value = false;
    mockQueryData.error.value = new Error('Failed to load');
    mockQueryData.data.value = null;
    
    const wrapper = mount(VolatilityHeatmap);
    expect(wrapper.text()).toContain('metrics.error_loading');
  });

  it('renders the Heatmap when data is loaded', () => {
    mockQueryData.isLoading.value = false;
    mockQueryData.error.value = null;
    mockQueryData.data.value = {
      grid: Array.from({ length: 7 }, () => Array(15).fill(null)),
      stats: {
        best: 2.5,
        worst: -1.0,
        positiveDays: 1,
        totalDays: 2,
        avg: 0.75
      }
    };
    
    const wrapper = mount(VolatilityHeatmap);
    
    // Check if grid is rendered
    expect(wrapper.find('.grid').exists()).toBe(true);
    // Check footer labels exist
    expect(wrapper.text()).toContain('metrics.volatility.stats.best_day');
    expect(wrapper.text()).toContain('metrics.volatility.stats.worst_day');
    expect(wrapper.text()).toContain('metrics.volatility.stats.bullish_days');
  });

  it('renders tooltips for heatmap cells with correct formatting', () => {
    mockQueryData.isLoading.value = false;
    mockQueryData.error.value = null;
    const grid = Array.from({ length: 7 }, () => Array(15).fill(null));
    grid[0][0] = { dateStr: '2024-01-01', returnPercent: 5.5 };
    mockQueryData.data.value = {
      grid,
      stats: { best: 5.5, worst: -1.0, positiveDays: 1, totalDays: 2, avg: 0.75 }
    };
    
    const wrapper = mount(VolatilityHeatmap, {
      global: {
        stubs: {
          TooltipProvider: { template: '<div><slot /></div>' },
          Tooltip: { template: '<div><slot /></div>' },
          TooltipTrigger: { template: '<div><slot /></div>' },
          TooltipContent: { template: '<div><slot /></div>' }
        }
      }
    });
    
    expect(wrapper.text()).toContain('2024-01-01');
    expect(wrapper.text()).toContain('+5.50%');
  });
});
