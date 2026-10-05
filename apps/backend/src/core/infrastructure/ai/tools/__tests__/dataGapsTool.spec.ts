import { describe, it, expect, vi } from 'vitest';
import { RequestContext } from '@mastra/core/request-context';
import { noopObserve } from '@mastra/core/tools';
import { FIFO_QUALITY_FLAGS, FLAG_SEVERITY } from '@kryptofolio/shared-types';
import {
  buildDataGapsToolResult,
  dataGapsTool,
  dataGapsToolInputSchema,
  dataGapsToolOutputSchema,
} from '../dataGapsTool.js';
import { buildFiscalIntegrityFixture } from './fixtures/fiscalIntegrityFixture.js';
import { buildFortyHoldingFixtureWithUnvalued } from './fixtures/portfolioSummaryFixture.js';
import type { FiscalIntegrityReport } from '../../../../application/use-cases/GetFiscalIntegrityUseCase.js';
import type { AdvisorRequestContextValues } from '../../advisorRequestContext.js';

const CONFIG = { maxChars: 8000 };

function ok(result: ReturnType<typeof buildDataGapsToolResult>) {
  if (result.kind !== 'ok') throw new Error('expected ok');
  return result.payload;
}

describe('data_gaps tool', () => {
  it('splits unvalued holdings into no_price (convertible cost basis) and no_rate (unconvertible), by the portfolio_summary predicates', () => {
    const payload = ok(buildDataGapsToolResult(buildFortyHoldingFixtureWithUnvalued(), buildFiscalIntegrityFixture(), CONFIG));

    expect(payload.unvalued.no_price.map((h) => h.symbol)).toEqual(['SYNTH18', 'SYNTH19', 'SYNTH20']);
    expect(payload.unvalued.no_rate.map((h) => h.symbol)).toEqual(['SYNTH21', 'SYNTH22', 'SYNTH23']);
  });

  it('carries identifiers and quantities only for an unvalued holding, never a monetary figure', () => {
    const payload = ok(buildDataGapsToolResult(buildFortyHoldingFixtureWithUnvalued(), buildFiscalIntegrityFixture(), CONFIG));

    for (const holding of [...payload.unvalued.no_price, ...payload.unvalued.no_rate]) {
      expect(Object.keys(holding).sort()).toEqual(['amount', 'symbol']);
    }
  });

  it('reports no gaps when every holding is valued', () => {
    const response = buildFortyHoldingFixtureWithUnvalued();
    const valued = { ...response, holdings: response.holdings.slice(0, 5) };

    const payload = ok(buildDataGapsToolResult(valued, buildFiscalIntegrityFixture(), CONFIG));

    expect(payload.unvalued).toEqual({ no_price: [], no_rate: [] });
  });

  it('bounds integrity groups at 10 while totalDefects keeps the full count, and returns no rows', () => {
    const groups = Array.from({ length: 15 }, (_, i) => {
      const flag = FIFO_QUALITY_FLAGS[i % FIFO_QUALITY_FLAGS.length]!;
      return { quality_flag: flag, severity: FLAG_SEVERITY[flag], count: 100 - i, pendingReview: 0, rows: [] };
    });
    const report: FiscalIntegrityReport = {
      groups,
      totalDefects: 1305,
      pendingReview: 0,
      needsRecalculation: true,
    };

    const payload = ok(buildDataGapsToolResult(buildFortyHoldingFixtureWithUnvalued(), report, CONFIG));

    expect(payload.integrity.groups).toHaveLength(10);
    expect(payload.integrity.totalDefects).toBe(1305);
    expect(payload.integrity.needsRecalculation).toBe(true);
    expect(JSON.stringify(payload)).not.toContain('tx_id');
    expect(JSON.stringify(payload)).not.toContain('"rows"');
  });

  it('points to the detail tools with a fixed list', () => {
    const payload = ok(buildDataGapsToolResult(buildFortyHoldingFixtureWithUnvalued(), buildFiscalIntegrityFixture(), CONFIG));

    expect(payload.nextTools).toEqual(['fiscal_integrity_rows', 'holding_detail']);
  });

  it('passes its strict output schema and truncates through the budget gate', () => {
    const response = buildFortyHoldingFixtureWithUnvalued();
    const report = buildFiscalIntegrityFixture();

    expect(() => dataGapsToolOutputSchema.parse(buildDataGapsToolResult(response, report, CONFIG))).not.toThrow();
    expect(buildDataGapsToolResult(response, report, { maxChars: 10 }).kind).toBe('truncated');
  });

  it('reads the summary for every account in the request currency and the integrity report without a scope', async () => {
    const portfolioSummary = { execute: vi.fn(async () => buildFortyHoldingFixtureWithUnvalued()) };
    const fiscalIntegrity = { execute: vi.fn(async () => buildFiscalIntegrityFixture()) };
    const livePrices = new Map([['BTC', '1']]);
    const tool = dataGapsTool({ portfolioSummary, fiscalIntegrity }, { ...CONFIG, livePrices: async () => livePrices });
    if (!tool.execute) throw new Error('expected tool.execute');

    await tool.execute(
      {},
      {
        requestContext: new RequestContext<AdvisorRequestContextValues>([
          ['locale', 'en'],
          ['baseCurrency', 'EUR'],
        ]),
        observe: noopObserve,
      },
    );

    expect(portfolioSummary.execute).toHaveBeenCalledWith({ targetCurrency: 'EUR', livePrices });
    expect(fiscalIntegrity.execute).toHaveBeenCalledWith({});
    expect(dataGapsToolInputSchema.safeParse({ accountId: 'x' }).success).toBe(false);
  });
});
