import { describe, it, expect, vi } from 'vitest';
import { RequestContext } from '@mastra/core/request-context';
import { noopObserve } from '@mastra/core/tools';
import { txSearchTool, txSearchToolOutputSchema, buildTxSearchToolResult } from '../txSearchTool.js';
import type {
  AdvisorSpotRow,
  SearchSpotTransactionsRequest,
  SearchSpotTransactionsResult,
  SpotTransactionRow,
} from '../../../../application/use-cases/SearchSpotTransactionsUseCase.js';

function row(index: number): SpotTransactionRow {
  return {
    id: `id-${index}`,
    id_hash: `hash-${index}`,
    account_id: 'acc-1',
    exchange: 'Kraken',
    tx_type: 'BUY',
    asset_in_id: 'BTC',
    amount_in: '1' as SpotTransactionRow['amount_in'],
    total_fiat: '100' as SpotTransactionRow['total_fiat'],
    price_fiat: '100' as SpotTransactionRow['price_fiat'],
    fiat_currency: 'EUR',
    timestamp: '2024-01-10T12:00:00.000Z',
    status: 'COMPLETED',
    override: { kind: 'NONE' },
  };
}

function pageOf(count: number, extra: Partial<Extract<SearchSpotTransactionsResult, { kind: 'page' }>> = {}) {
  return {
    kind: 'page' as const,
    rows: Array.from({ length: count }, (_, i) => row(i)),
    page: 1,
    pageSize: 25,
    totalPages: 1,
    totalCount: count,
    ...extra,
  };
}

const context = () => ({ requestContext: new RequestContext(), observe: noopObserve });

describe('tx_search tool', () => {
  it('pages with the profile rowsPageSize and the requested filters', async () => {
    const useCase = { execute: vi.fn(async (_r: SearchSpotTransactionsRequest) => pageOf(2)) };
    const tool = txSearchTool(useCase, { rowsPageSize: 100, maxChars: 5000 });
    if (!tool.execute) throw new Error('expected tool.execute');

    await tool.execute({ symbol: 'ETH', from: '2024-01-01', types: ['BUY'], page: 3 }, context());

    expect(useCase.execute).toHaveBeenCalledWith({
      symbol: 'ETH',
      from: '2024-01-01',
      types: ['BUY'],
      paging: { kind: 'page', page: 3, pageSize: 100 },
    });
  });

  it('returns the token_lots paging shape with totals and advisor-projected rows', () => {
    const result = buildTxSearchToolResult(pageOf(2, { page: 2, pageSize: 25, totalPages: 4, totalCount: 80 }), { rowsPageSize: 25, maxChars: 5000 });

    if (result.kind !== 'ok') throw new Error('expected ok');
    expect(result.payload).toMatchObject({ page: 2, pageSize: 25, totalPages: 4, totalCount: 80 });
    const [first] = result.payload.rows as AdvisorSpotRow[];
    expect(first).toMatchObject({ type: 'BUY', edited: false, fee: { kind: 'NONE' }, exchange: 'Kraken' });
    expect(first).not.toHaveProperty('override');
    expect(txSearchToolOutputSchema.parse(result)).toEqual(result);
  });

  it('marks an edited row and never exposes the pre-edit original', () => {
    const edited: SpotTransactionRow = { ...row(1), override: { kind: 'ACTIVE', original: row(9), editedFields: ['tx_type'] } };

    const result = buildTxSearchToolResult(pageOf(0, { rows: [edited] }), { rowsPageSize: 25, maxChars: 5000 });

    if (result.kind !== 'ok') throw new Error('expected ok');
    expect(result.payload.rows[0]).toMatchObject({ edited: true });
    expect(JSON.stringify(result)).not.toContain('original');
  });

  it('forwards a past-the-end page as an empty ok result with the true totals', () => {
    const result = buildTxSearchToolResult(pageOf(0, { page: 9, totalPages: 3, totalCount: 60 }), { rowsPageSize: 25, maxChars: 5000 });

    expect(result).toEqual({ kind: 'ok', payload: { rows: [], page: 9, pageSize: 25, totalPages: 3, totalCount: 60 } });
  });

  it('returns truncated, never the oversized page, when the page exceeds the budget', () => {
    const result = buildTxSearchToolResult(pageOf(25), { rowsPageSize: 25, maxChars: 500 });

    expect(result.kind).toBe('truncated');
    expect(JSON.stringify(result)).not.toContain('BTC');
  });

  it('refuses an invalid call without reading the ledger', async () => {
    const useCase = { execute: vi.fn(async () => pageOf(0)) };
    const tool = txSearchTool(useCase, { rowsPageSize: 25, maxChars: 5000 });
    if (!tool.execute) throw new Error('expected tool.execute');

    await tool.execute({ page: 0 } as never, context());

    expect(useCase.execute).not.toHaveBeenCalled();
  });

  it('declares the profile page size in no input field', () => {
    const tool = txSearchTool({ execute: async () => pageOf(0) }, { rowsPageSize: 25, maxChars: 5000 });

    expect(tool.description).toMatch(/narrow/i);
  });
});
