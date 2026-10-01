import { describe, it, expect, vi } from 'vitest';
import { GetPerformanceHistoryUseCase } from '../GetPerformanceHistoryUseCase.js';
import type { IMetricsPort, PerformanceHistoryPoint } from '../../../domain/ports/IMetricsPort.js';
import type { FifoChainFreshnessService } from '../../services/FifoChainFreshnessService.js';
import { toPreciseAmount } from '../../../domain/value-objects/PreciseAmount.js';

const freshness = {
  ensureFresh: vi.fn().mockResolvedValue({ kind: 'fresh', buildId: 'b', builtAt: '2026-01-01T00:00:00Z' }),
} as unknown as FifoChainFreshnessService;

const portReturning = (points: PerformanceHistoryPoint[]) => {
  const getPerformanceHistory = vi.fn<IMetricsPort['getPerformanceHistory']>().mockResolvedValue(points);
  const port = { getPerformanceHistory } as unknown as IMetricsPort;
  return { port, getPerformanceHistory };
};

describe('GetPerformanceHistoryUseCase', () => {
  it('passes days and the display currency through to the port', async () => {
    const { port, getPerformanceHistory } = portReturning([]);

    await new GetPerformanceHistoryUseCase(port, freshness).execute(90, 'USD');

    expect(getPerformanceHistory).toHaveBeenCalledWith(90, 'USD');
  });

  it('returns an unconvertible point untouched', async () => {
    const points: PerformanceHistoryPoint[] = [
      { date: '2024-01-01', portfolioValue: null, drawdownPct: '0.0000' },
      { date: '2024-01-02', portfolioValue: toPreciseAmount('10.00'), drawdownPct: '0.0000' },
    ];
    const { port } = portReturning(points);

    const result = await new GetPerformanceHistoryUseCase(port, freshness).execute(2, 'USD');

    expect(result).toEqual(points);
  });
});
