/**
 * Every read use case that consumes the derived FIFO chain must await `ensureFresh()` before
 * its first port read (design D4) — in the use case itself, not a route middleware, so it is
 * correct when invoked outside HTTP. This enumerates every such use case and proves the call
 * order directly, rather than trusting that each file remembered to add the line.
 */
import { describe, it, expect, vi } from 'vitest';
import type { FifoChainFreshnessService } from '../../services/FifoChainFreshnessService.js';
import type { FreshChain } from '../../../domain/models/FifoChainState.js';
import type { FifoBuildId } from '../../../domain/models/FifoChainState.js';

import { GetKpisUseCase } from '../GetKpisUseCase.js';
import { GetAssetAllocationUseCase } from '../GetAssetAllocationUseCase.js';
import { GetPerformanceHistoryUseCase } from '../GetPerformanceHistoryUseCase.js';
import { GetVolatilityHeatmapUseCase } from '../GetVolatilityHeatmapUseCase.js';
import { GetDrawdownCurveUseCase } from '../GetDrawdownCurveUseCase.js';
import { GetRiskMetricsUseCase } from '../GetRiskMetricsUseCase.js';
import { GetSpanishTaxReportUseCase } from '../GetSpanishTaxReportUseCase.js';
import { GetFiscalIntegrityUseCase } from '../GetFiscalIntegrityUseCase.js';
import { GetTokenHistoryUseCase } from '../GetTokenHistoryUseCase.js';
import { GetPortfolioSummaryUseCase } from '../GetPortfolioSummaryUseCase.js';

const FRESH: FreshChain = {
  kind: 'fresh',
  buildId: 'test-build' as FifoBuildId,
  builtAt: '2026-01-01T00:00:00Z',
};

/** Records "ensureFresh" once, before the port double records its own call. */
function trackingFreshnessService(callOrder: string[]): FifoChainFreshnessService {
  return {
    ensureFresh: vi.fn(async () => {
      callOrder.push('ensureFresh');
      return FRESH;
    }),
  } as unknown as FifoChainFreshnessService;
}

function tracked(callOrder: string[], name: string, value: unknown) {
  return vi.fn(async () => {
    callOrder.push(name);
    return value;
  });
}

interface Case {
  readonly name: string;
  readonly run: (callOrder: string[]) => Promise<unknown>;
}

const CASES: Case[] = [
  {
    name: 'GetKpisUseCase',
    run: async (callOrder) => {
      const freshness = trackingFreshnessService(callOrder);
      const port = { getKpis: tracked(callOrder, 'getKpis', {}) };
      await new GetKpisUseCase(port as never, freshness).execute('EUR');
    },
  },
  {
    name: 'GetAssetAllocationUseCase',
    run: async (callOrder) => {
      const freshness = trackingFreshnessService(callOrder);
      const port = { getAssetAllocation: tracked(callOrder, 'getAssetAllocation', []) };
      await new GetAssetAllocationUseCase(port as never, freshness).execute('EUR');
    },
  },
  {
    name: 'GetPerformanceHistoryUseCase',
    run: async (callOrder) => {
      const freshness = trackingFreshnessService(callOrder);
      const port = { getPerformanceHistory: tracked(callOrder, 'getPerformanceHistory', []) };
      await new GetPerformanceHistoryUseCase(port as never, freshness).execute(30, 'EUR');
    },
  },
  {
    name: 'GetVolatilityHeatmapUseCase',
    run: async (callOrder) => {
      const freshness = trackingFreshnessService(callOrder);
      const port = { getVolatilityHeatmap: tracked(callOrder, 'getVolatilityHeatmap', []) };
      await new GetVolatilityHeatmapUseCase(port as never, freshness).execute(2024, 'EUR');
    },
  },
  {
    name: 'GetDrawdownCurveUseCase',
    run: async (callOrder) => {
      const freshness = trackingFreshnessService(callOrder);
      const port = { getDrawdownCurve: tracked(callOrder, 'getDrawdownCurve', []) };
      await new GetDrawdownCurveUseCase(port as never, freshness).execute(30, 'EUR');
    },
  },
  {
    name: 'GetRiskMetricsUseCase',
    run: async (callOrder) => {
      const freshness = trackingFreshnessService(callOrder);
      const port = { getRiskMetrics: tracked(callOrder, 'getRiskMetrics', {}) };
      await new GetRiskMetricsUseCase(port as never, freshness).execute('EUR');
    },
  },
  {
    name: 'GetSpanishTaxReportUseCase',
    run: async (callOrder) => {
      const freshness = trackingFreshnessService(callOrder);
      const port = {
        getSpanishTaxReport: tracked(callOrder, 'getSpanishTaxReport', {
          currency: 'EUR',
          conversion: 'NATIVE',
          unconvertibleEvents: [],
          spotCapitalGains: '0',
          savingsBaseYields: '0',
          generalBaseAirdrops: '0',
          excludedFlaggedEvents: 0,
          excludedUnresolvedIncomeCount: 0,
        }),
        getConvertedDisposalEvents: tracked(callOrder, 'getConvertedDisposalEvents', []),
      };
      const settings = { getSetting: vi.fn().mockResolvedValue('EUR'), setSetting: vi.fn() };
      await new GetSpanishTaxReportUseCase(port as never, settings, freshness).execute({
        year: 2024,
      });
    },
  },
  {
    name: 'GetFiscalIntegrityUseCase',
    run: async (callOrder) => {
      const freshness = trackingFreshnessService(callOrder);
      const port = { getDataQuality: tracked(callOrder, 'getDataQuality', []) };
      const settings = { getSetting: vi.fn().mockResolvedValue(null), setSetting: vi.fn() };
      await new GetFiscalIntegrityUseCase(port as never, settings, freshness).execute({});
    },
  },
  {
    name: 'GetTokenHistoryUseCase',
    run: async (callOrder) => {
      const freshness = trackingFreshnessService(callOrder);
      const port = {
        calculateLotsAndEvents: tracked(callOrder, 'calculateLotsAndEvents', { lots: [] }),
        getConvertedDisposalEvents: tracked(callOrder, 'getConvertedDisposalEvents', []),
        getLotCustodyLocations: tracked(callOrder, 'getLotCustodyLocations', []),
        getLotCustodyTimeline: tracked(callOrder, 'getLotCustodyTimeline', []),
      };
      const settings = { getSetting: vi.fn().mockResolvedValue('USD'), setSetting: vi.fn() };
      await new GetTokenHistoryUseCase(port as never, settings, freshness).execute({
        symbol: 'BTC',
      });
    },
  },
  {
    name: 'GetPortfolioSummaryUseCase',
    run: async (callOrder) => {
      const freshness = trackingFreshnessService(callOrder);
      const analyticsPort = {
        getHoldingsSnapshot: tracked(callOrder, 'getHoldingsSnapshot', []),
      };
      await new GetPortfolioSummaryUseCase(analyticsPort as never, freshness).execute({});
    },
  },
];

describe('every derived-chain read use case awaits ensureFresh() before its first port read', () => {
  for (const { name, run } of CASES) {
    it(name, async () => {
      const callOrder: string[] = [];
      await run(callOrder);

      expect(callOrder[0], `${name} must call ensureFresh() first`).toBe('ensureFresh');
      expect(callOrder.length, `${name} must have read at least one port method`).toBeGreaterThan(1);
    });
  }
});
