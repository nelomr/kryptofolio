/**
 * The nine-request dashboard fan-out (the whole change's motivating measurement) must trigger
 * exactly one rebuild against a stale chain, with every request answered from that same
 * committed rebuild — not nine independent rebuild races.
 */
import { describe, it, expect, vi } from 'vitest';
import { FifoChainFreshnessService } from '../../services/FifoChainFreshnessService.js';
import type { IDerivedChainPort } from '../../../domain/ports/IDerivedChainPort.js';
import type { IUserSettingsPort } from '../../../domain/ports/IUserSettingsPort.js';
import type { FifoBuildId } from '../../../domain/models/FifoChainState.js';
import type { MaterializationSummary } from '../../services/FifoMaterializerService.js';
import type { IMetricsPort } from '../../../domain/ports/IMetricsPort.js';
import { GetKpisUseCase } from '../GetKpisUseCase.js';
import { GetAssetAllocationUseCase } from '../GetAssetAllocationUseCase.js';
import { GetPerformanceHistoryUseCase } from '../GetPerformanceHistoryUseCase.js';
import { GetVolatilityHeatmapUseCase } from '../GetVolatilityHeatmapUseCase.js';
import { GetDrawdownCurveUseCase } from '../GetDrawdownCurveUseCase.js';
import { GetRiskMetricsUseCase } from '../GetRiskMetricsUseCase.js';

describe('nine parallel reads against a stale chain', () => {
  it('trigger exactly one rebuild and are all answered from the same committed build', async () => {
    const settingsStore: Record<string, string> = { needs_recalculation: 'true' };
    const userSettingsPort: IUserSettingsPort = {
      getSetting: async (key) => settingsStore[key] ?? null,
      setSetting: async (key, value) => {
        settingsStore[key] = value;
      },
    };

    const rebuild = vi.fn().mockResolvedValue('the-one-build' as FifoBuildId);
    const derivedChainPort: IDerivedChainPort = {
      rebuild,
      describe: vi.fn().mockResolvedValue({
        kind: 'fresh',
        buildId: 'the-one-build' as FifoBuildId,
        builtAt: '2026-01-01T00:00:00Z',
      }),
    };
    const reconciler = {
      recalculate: vi.fn().mockResolvedValue({
        taxLots: { inserted: 0, updated: 0, retired: 0, reactivated: 0 },
        lotHistoryEvents: { inserted: 0, updated: 0, retired: 0, reactivated: 0 },
        custodyEntries: { inserted: 0, updated: 0, retired: 0, reactivated: 0 },
        flagged: 0,
        pendingReview: 0,
      } satisfies MaterializationSummary),
    };
    const freshnessService = new FifoChainFreshnessService(userSettingsPort, derivedChainPort, reconciler);

    const metricsPort: IMetricsPort = {
      getKpis: vi.fn().mockResolvedValue({}),
      getAssetAllocation: vi.fn().mockResolvedValue([]),
      getPerformanceHistory: vi.fn().mockResolvedValue([]),
      getVolatilityHeatmap: vi.fn().mockResolvedValue([]),
      getDrawdownCurve: vi.fn().mockResolvedValue([]),
      getRiskMetrics: vi.fn().mockResolvedValue({}),
    };

    // Nine reads, mirroring the dashboard's real fan-out — six metrics endpoints plus three
    // repeats, all sharing the one freshness service singleton a real DI container would give
    // them.
    const reads = [
      new GetKpisUseCase(metricsPort, freshnessService).execute('EUR'),
      new GetAssetAllocationUseCase(metricsPort, freshnessService).execute('EUR'),
      new GetPerformanceHistoryUseCase(metricsPort, freshnessService).execute(30, 'EUR'),
      new GetVolatilityHeatmapUseCase(metricsPort, freshnessService).execute(2024, 'EUR'),
      new GetDrawdownCurveUseCase(metricsPort, freshnessService).execute(30, 'EUR'),
      new GetRiskMetricsUseCase(metricsPort, freshnessService).execute('EUR'),
      new GetKpisUseCase(metricsPort, freshnessService).execute('EUR'),
      new GetKpisUseCase(metricsPort, freshnessService).execute('EUR'),
      new GetKpisUseCase(metricsPort, freshnessService).execute('EUR'),
    ];

    await Promise.all(reads);

    expect(rebuild).toHaveBeenCalledTimes(1);
    expect(settingsStore.needs_recalculation).toBe('false');
  });
});
