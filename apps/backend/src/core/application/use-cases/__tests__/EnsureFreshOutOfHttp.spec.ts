/**
 * Design D4: "A use case must be correct when invoked outside HTTP." This calls a
 * derived-chain read use case as a plain function — no Hono request, no route, no
 * middleware anywhere in the path — using the REAL `FifoChainFreshnessService`, and proves
 * the staleness check and the synchronous rebuild still happen.
 */
import { describe, it, expect, vi } from 'vitest';
import { FifoChainFreshnessService } from '../../services/FifoChainFreshnessService.js';
import type { IDerivedChainPort } from '../../../domain/ports/IDerivedChainPort.js';
import type { IUserSettingsPort } from '../../../domain/ports/IUserSettingsPort.js';
import type { FifoBuildId } from '../../../domain/models/FifoChainState.js';
import type { MaterializationSummary } from '../../services/FifoMaterializerService.js';
import type { IMetricsPort } from '../../../domain/ports/IMetricsPort.js';
import { GetKpisUseCase } from '../GetKpisUseCase.js';

describe('a derived-chain read use case is correct invoked outside HTTP', () => {
  it('runs the staleness check and a synchronous rebuild with no HTTP framework in the path', async () => {
    const settingsStore: Record<string, string> = { needs_recalculation: 'true' };
    const userSettingsPort: IUserSettingsPort = {
      getSetting: async (key) => settingsStore[key] ?? null,
      setSetting: async (key, value) => {
        settingsStore[key] = value;
      },
    };

    const rebuild = vi.fn().mockResolvedValue('build-1' as FifoBuildId);
    const derivedChainPort: IDerivedChainPort = {
      rebuild,
      describe: vi.fn().mockResolvedValue({
        kind: 'fresh',
        buildId: 'build-1' as FifoBuildId,
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
    // The real service — no test double standing in for the coalescence/rebuild logic itself.
    const freshnessService = new FifoChainFreshnessService(userSettingsPort, derivedChainPort, reconciler);

    const getKpis = vi.fn().mockResolvedValue({ currency: 'EUR' });
    const unused = vi.fn().mockRejectedValue(new Error('not read by GetKpisUseCase'));
    const metricsPort: IMetricsPort = {
      getKpis,
      getPerformanceHistory: unused,
      getAssetAllocation: unused,
      getVolatilityHeatmap: unused,
      getRiskMetrics: unused,
      getDrawdownCurve: unused,
    };

    // A bare object construction and a bare method call — this is what "directly tool-callable"
    // means: nothing here is an HTTP request, a route handler, or middleware.
    const useCase = new GetKpisUseCase(metricsPort, freshnessService);
    await useCase.execute('EUR');

    expect(rebuild).toHaveBeenCalledTimes(1);
    expect(settingsStore.needs_recalculation).toBe('false');
    expect(getKpis).toHaveBeenCalledTimes(1);
  });
});
