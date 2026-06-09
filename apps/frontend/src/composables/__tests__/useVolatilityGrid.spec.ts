import { describe, it, expect } from 'vitest';
import { ref } from 'vue';
import { useVolatilityGrid, getCellBg } from '../useVolatilityGrid';
import type { VolatilityHeatmapEntity } from '@/core/domain/ports/ICryptoMetricsPort';

describe('useVolatilityGrid', () => {
  it('returns default grid and stats when data is undefined', () => {
    const { heatmapCells, stats } = useVolatilityGrid(ref(undefined));
    
    expect(heatmapCells.value).toHaveLength(7);
    expect(heatmapCells.value[0]).toHaveLength(15);
    expect(heatmapCells.value[0][0]).toBeNull();
    
    expect(stats.value).toEqual({ best: 0, worst: 0, positiveDays: 0, totalDays: 0, avg: 0 });
  });

  it('passes through grid and stats correctly from entity', () => {
    const mockEntity: VolatilityHeatmapEntity = {
      grid: Array.from({ length: 7 }, () => Array(15).fill(null)),
      stats: {
        best: 5.0,
        worst: -1.0,
        positiveDays: 2,
        totalDays: 2,
        avg: 2.0
      }
    };
    
    const { heatmapCells, stats } = useVolatilityGrid(ref(mockEntity));
    
    // Check stats
    expect(stats.value.best).toBe(5.0);
    expect(stats.value.worst).toBe(-1.0);
    expect(stats.value.positiveDays).toBe(2);
    expect(stats.value.totalDays).toBe(2);
    expect(stats.value.avg).toBe(2.0);
    
    // Grid alignment
    expect(heatmapCells.value.length).toBe(7);
    expect(heatmapCells.value[0].length).toBe(15);
    
    // Test getCellBg
    expect(getCellBg(6)).toBe('bg-profit');
    expect(getCellBg(3)).toBe('bg-profit-medium');
    expect(getCellBg(1)).toBe('bg-profit-soft');
    expect(getCellBg(-1)).toBe('bg-loss-soft');
    expect(getCellBg(-3)).toBe('bg-loss-medium');
    expect(getCellBg(-6)).toBe('bg-loss');
  });
});
