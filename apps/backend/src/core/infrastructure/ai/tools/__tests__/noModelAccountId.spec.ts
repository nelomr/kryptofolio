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
import { holdingDetailTool, holdingDetailToolInputSchema } from '../holdingDetailTool.js';
import { accountHoldingsTool, accountHoldingsToolInputSchema } from '../accountHoldingsTool.js';
import { taxYearComparisonTool, taxYearComparisonToolInputSchema } from '../taxYearComparisonTool.js';
import { derivativesPnlTool, derivativesPnlToolInputSchema } from '../derivativesPnlTool.js';
import { custodyLocationsTool, custodyLocationsToolInputSchema } from '../custodyLocationsTool.js';
import { dataGapsTool, dataGapsToolInputSchema } from '../dataGapsTool.js';
import { explainMetricTool, explainMetricToolInputSchema } from '../explainMetricTool.js';

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

const emptySummary = {
  metrics: {
    rates_incomplete: false,
    prices_incomplete: false,
    total_equity_fiat: '0.00',
    total_cost_basis_fiat: '0.00',
    total_realized_pnl_fiat: '0.00',
    total_unrealized_pnl_fiat: '0.00',
    total_pnl_fiat: '0.00',
    currency: 'EUR',
  },
  holdings: [],
};

const GROUP_ONE_CASES: ReadonlyArray<Case> = [
  {
    name: 'holding_detail',
    rejects: (i) => !holdingDetailToolInputSchema.safeParse({ symbol: 'BTC', ...i }).success,
    run: (record) =>
      holdingDetailTool(
        { execute: (req) => { record(req); return Promise.reject(FAILING); } },
        { maxChars: 3000 },
      ).execute?.({ symbol: 'BTC' }, summaryContext()) ?? Promise.reject(new Error('no execute')),
  },
  {
    name: 'tax_year_comparison',
    rejects: (i) => !taxYearComparisonToolInputSchema.safeParse({ yearA: 2024, yearB: 2025, ...i }).success,
    run: (record) =>
      taxYearComparisonTool(
        // Two reads, one per year; only the first is recorded so the shared one-request assertion applies.
        { execute: (req) => { if (req.year === 2024) record(req); return Promise.reject(FAILING); } },
        { maxChars: 4000 },
      ).execute?.({ yearA: 2024, yearB: 2025 }, plainContext()) ?? Promise.reject(new Error('no execute')),
  },
  {
    name: 'derivatives_pnl',
    rejects: (i) => !derivativesPnlToolInputSchema.safeParse(i).success,
    run: (record) =>
      derivativesPnlTool(
        { execute: (currency) => { record({ currency }); return Promise.reject(FAILING); } },
        { topNHoldings: 15, maxChars: 4000 },
      ).execute?.({}, summaryContext()) ?? Promise.reject(new Error('no execute')),
  },
  {
    name: 'custody_locations',
    rejects: (i) => !custodyLocationsToolInputSchema.safeParse(i).success,
    run: (record) =>
      custodyLocationsTool(
        { execute: (req) => { record(req); return Promise.reject(FAILING); } },
        { topNHoldings: 15, maxChars: 4000 },
      ).execute?.({}, plainContext()) ?? Promise.reject(new Error('no execute')),
  },
  {
    name: 'data_gaps',
    rejects: (i) => !dataGapsToolInputSchema.safeParse(i).success,
    run: (record) =>
      dataGapsTool(
        {
          portfolioSummary: { execute: (req) => { record(req); return Promise.resolve(emptySummary); } },
          fiscalIntegrity: { execute: () => Promise.reject(FAILING) },
        },
        { maxChars: 4000 },
      ).execute?.({}, summaryContext()) ?? Promise.reject(new Error('no execute')),
  },
  {
    name: 'explain_metric',
    rejects: (i) => !explainMetricToolInputSchema.safeParse({ metric: 'hhi', ...i }).success,
    run: (record) => {
      record({});
      return explainMetricTool({ maxChars: 2000 }).execute?.({ metric: 'hhi' }, summaryContext()) ?? Promise.reject(new Error('no execute'));
    },
  },
];

describe('account_holdings', () => {
  it('rejects a model-supplied accountId; the id it reads with is resolved server-side from a name', () => {
    expect(accountHoldingsToolInputSchema.safeParse({ accountName: 'Kraken', accountId: 'x' }).success).toBe(false);
    expect(Object.keys(accountHoldingsToolInputSchema.shape)).toEqual(['accountName']);
  });

  it('never reads a summary for an id the model typed', async () => {
    const reads: unknown[] = [];
    const tool = accountHoldingsTool(
      {
        listAccounts: { execute: async () => [{ id: 'real-id', name: 'Kraken', type: 'exchange', parentAccountId: null }] },
        portfolioSummary: { execute: async (req) => { reads.push(req); return emptySummary; } },
      },
      { topNHoldings: 15, maxChars: 4000 },
    );

    await tool.execute?.({ accountName: 'real-id' }, summaryContext());

    expect(reads).toEqual([]);
  });
});

describe.each([...CASES, ...GROUP_ONE_CASES])('$name', (c) => {
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
