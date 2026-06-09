import { computed } from 'vue';
import type { Ref } from 'vue';
import type { VolatilityHeatmapEntity } from '@/core/domain/ports/ICryptoMetricsPort';

export const getCellBg = (pct: number): string => 
  pct >= 5 ? 'bg-profit' :
  pct >= 2 ? 'bg-profit-medium' :
  pct >= 0 ? 'bg-profit-soft' :
  pct >= -2 ? 'bg-loss-soft' :
  pct >= -5 ? 'bg-loss-medium' :
  'bg-loss';

export function useVolatilityGrid(data: Ref<VolatilityHeatmapEntity | undefined>) {
  const heatmapCells = computed(() => {
    if (!data.value) {
      return Array.from({ length: 7 }, () => Array(15).fill(null));
    }
    return data.value.grid;
  });

  const stats = computed(() => {
    if (!data.value) {
      return { best: 0, worst: 0, positiveDays: 0, totalDays: 0, avg: 0 };
    }
    return data.value.stats;
  });

  return {
    heatmapCells,
    stats,
    getCellBg,
  };
}
