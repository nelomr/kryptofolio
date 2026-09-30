import { describe, it, expect } from 'vitest';
import { RequestContext } from '@mastra/core/request-context';
import { noopObserve } from '@mastra/core/tools';
import type { AdvisorRequestContextValues } from '../../advisorRequestContext.js';
import { portfolioSummaryTool, portfolioSummaryToolInputSchema } from '../portfolioSummaryTool.js';
import { fiscalIntegrityTool, fiscalIntegrityToolInputSchema } from '../fiscalIntegrityTool.js';
import { fiscalIntegrityRowsTool, fiscalIntegrityRowsToolInputSchema } from '../fiscalIntegrityRowsTool.js';
import { tokenHistoryTool, tokenHistoryToolInputSchema } from '../tokenHistoryTool.js';
import { tokenLotsTool, tokenLotsToolInputSchema } from '../tokenLotsTool.js';
import { spanishTaxReportTool, spanishTaxReportToolInputSchema } from '../spanishTaxReportTool.js';

/**
 * A model cannot know a valid account id and neither can the user, so no tool lets it supply one.
 * Every tool reads the whole ledger: tax is computed per asset across accounts, never per wallet.
 */

const CONFIG = { maxChars: 6000 };
const FAILING = new Error('stop after the call');

function requestContext(): RequestContext<AdvisorRequestContextValues> {
  return new RequestContext<AdvisorRequestContextValues>([
    ['locale', 'en'],
    ['baseCurrency', 'EUR'],
  ]);
}

type Case = {
  name: string;
  rejects: (input: Record<string, unknown>) => boolean;
  run: (record: (request: unknown) => void) => Promise<unknown>;
};

const summaryContext = () => ({ requestContext: requestContext(), observe: noopObserve });
const plainContext = () => ({ requestContext: new RequestContext(), observe: noopObserve });

const CASES: ReadonlyArray<Case> = [
  {
    name: 'portfolio_summary',
    rejects: (i) => !portfolioSummaryToolInputSchema.safeParse(i).success,
    run: (record) =>
      portfolioSummaryTool(
        { execute: (req) => { record(req); return Promise.reject(FAILING); } },
        { ...CONFIG, topNHoldings: 15 },
      ).execute?.({}, summaryContext()) ?? Promise.reject(new Error('no execute')),
  },
  {
    name: 'fiscal_integrity',
    rejects: (i) => !fiscalIntegrityToolInputSchema.safeParse(i).success,
    run: (record) =>
      fiscalIntegrityTool(
        { execute: (req) => { record(req); return Promise.reject(FAILING); } },
        CONFIG,
      ).execute?.({}, plainContext()) ?? Promise.reject(new Error('no execute')),
  },
  {
    name: 'fiscal_integrity_rows',
    rejects: (i) =>
      !fiscalIntegrityRowsToolInputSchema.safeParse({ qualityFlag: 'MISSING_PRICE', ...i }).success,
    run: (record) =>
      fiscalIntegrityRowsTool(
        { execute: (req) => { record(req); return Promise.reject(FAILING); } },
        { ...CONFIG, rowsPageSize: 25 },
      ).execute?.({ qualityFlag: 'MISSING_PRICE', page: 0 }, plainContext()) ??
      Promise.reject(new Error('no execute')),
  },
  {
    name: 'token_history',
    rejects: (i) => !tokenHistoryToolInputSchema.safeParse({ symbol: 'BTC', ...i }).success,
    run: (record) =>
      tokenHistoryTool(
        { execute: (req) => { record(req); return Promise.reject(FAILING); } },
        { ...CONFIG, lotsPageSize: 20 },
      ).execute?.({ symbol: 'BTC' }, plainContext()) ?? Promise.reject(new Error('no execute')),
  },
  {
    name: 'token_lots',
    rejects: (i) => !tokenLotsToolInputSchema.safeParse({ symbol: 'BTC', ...i }).success,
    run: (record) =>
      tokenLotsTool(
        { execute: (req) => { record(req); return Promise.reject(FAILING); } },
        { ...CONFIG, lotsPageSize: 20 },
      ).execute?.({ symbol: 'BTC', page: 0 }, plainContext()) ?? Promise.reject(new Error('no execute')),
  },
  {
    name: 'spanish_tax_report',
    rejects: (i) => !spanishTaxReportToolInputSchema.safeParse({ year: 2024, ...i }).success,
    run: (record) =>
      spanishTaxReportTool(
        { execute: (req) => { record(req); return Promise.reject(FAILING); } },
        CONFIG,
      ).execute?.({ year: 2024 }, plainContext()) ?? Promise.reject(new Error('no execute')),
  },
];

describe.each(CASES)('$name', (c) => {
  it('rejects a model-supplied accountId', () => {
    expect(c.rejects({ accountId: '11111111-1111-4111-8111-111111111111' })).toBe(true);
  });

  it('reads every account: its use case is called without an account filter', async () => {
    const requests: unknown[] = [];

    await c.run((request) => requests.push(request)).catch(() => undefined);

    expect(requests).toHaveLength(1);
    expect(requests[0] ?? {}).not.toHaveProperty('accountId');
  });
});
