import { describe, it, expect, vi } from 'vitest';
import { SearchSpotTransactionsUseCase, toAdvisorSpotRow } from '../SearchSpotTransactionsUseCase.js';
import type {
  ILedgerPort,
  LedgerSpotTransaction,
  LedgerSpotTransactionOverride,
} from '../../../domain/ports/ILedgerPort.js';

function tx(overrides: Partial<LedgerSpotTransaction> & { id_hash: string }): LedgerSpotTransaction {
  return {
    id: `id-${overrides.id_hash}`,
    account_id: 'acc-1',
    tx_type: 'BUY',
    asset_in_id: 'BTC',
    amount_in: '1' as LedgerSpotTransaction['amount_in'],
    total_fiat: '100' as LedgerSpotTransaction['total_fiat'],
    price_fiat: '100' as LedgerSpotTransaction['price_fiat'],
    fiat_currency: 'EUR',
    timestamp: '2024-01-10T12:00:00.000Z',
    status: 'COMPLETED',
    ...overrides,
  } as LedgerSpotTransaction;
}

function override(id_hash: string, patch: Partial<LedgerSpotTransactionOverride>): LedgerSpotTransactionOverride {
  return {
    id_hash,
    amount_in_edited: false,
    amount_in: null,
    amount_out_edited: false,
    amount_out: null,
    price_edited: false,
    price_fiat: null,
    fiat_currency: null,
    total_fiat_edited: false,
    total_fiat: null,
    fee_kind: 'UNCHANGED',
    fee_amount: null,
    fee_asset_id: null,
    timestamp_edited: false,
    timestamp: null,
    tx_type_edited: false,
    tx_type: null,
    ...patch,
  };
}

function build(txs: LedgerSpotTransaction[], overrides: LedgerSpotTransactionOverride[] = []) {
  const ledger = {
    getSpotTransactions: vi.fn(async () => txs),
    getSpotTransactionOverrides: vi.fn(async () => overrides),
  } as unknown as ILedgerPort;
  return { useCase: new SearchSpotTransactionsUseCase(ledger), ledger };
}

const ALL = { kind: 'all' } as const;

async function hashes(useCase: SearchSpotTransactionsUseCase, filters: Parameters<SearchSpotTransactionsUseCase['execute']>[0]) {
  const result = await useCase.execute(filters);
  return result.rows.map((row) => row.id_hash).sort();
}

describe('SearchSpotTransactionsUseCase filters', () => {
  it('returns every transaction when no filter is given', async () => {
    const { useCase } = build([tx({ id_hash: 'a' }), tx({ id_hash: 'b' })]);

    expect(await hashes(useCase, { paging: ALL })).toEqual(['a', 'b']);
  });

  it('searches an edited type as edited, not as stored', async () => {
    const { useCase } = build(
      [tx({ id_hash: 'edited', tx_type: 'BUY' }), tx({ id_hash: 'plain', tx_type: 'BUY' })],
      [override('edited', { tx_type_edited: true, tx_type: 'SELL' })],
    );

    expect(await hashes(useCase, { types: ['SELL'], paging: ALL })).toEqual(['edited']);
    expect(await hashes(useCase, { types: ['BUY'], paging: ALL })).toEqual(['plain']);
  });

  it('searches an edited date as edited', async () => {
    const { useCase } = build(
      [tx({ id_hash: 'moved', timestamp: '2024-01-10T00:00:00.000Z' }), tx({ id_hash: 'old', timestamp: '2024-01-11T00:00:00.000Z' })],
      [override('moved', { timestamp_edited: true, timestamp: '2024-03-05T00:00:00.000Z' })],
    );

    expect(await hashes(useCase, { from: '2024-03-01', paging: ALL })).toEqual(['moved']);
  });

  it('includes both date bounds', async () => {
    const { useCase } = build([
      tx({ id_hash: 'start', timestamp: '2024-02-01T00:00:00.000Z' }),
      tx({ id_hash: 'end', timestamp: '2024-02-28T23:59:59.000Z' }),
      tx({ id_hash: 'before', timestamp: '2024-01-31T23:59:59.000Z' }),
      tx({ id_hash: 'after', timestamp: '2024-03-01T00:00:00.000Z' }),
    ]);

    expect(await hashes(useCase, { from: '2024-02-01', to: '2024-02-28', paging: ALL })).toEqual(['end', 'start']);
  });

  it('matches the symbol on either side of the row', async () => {
    const { useCase } = build([
      tx({ id_hash: 'acquires', asset_in_id: 'ETH' }),
      tx({ id_hash: 'disposes', tx_type: 'SELL', asset_in_id: undefined, asset_out_id: 'ETH' }),
      tx({ id_hash: 'other', asset_in_id: 'BTC' }),
    ]);

    expect(await hashes(useCase, { symbol: 'ETH', paging: ALL })).toEqual(['acquires', 'disposes']);
  });

  it('combines filters conjunctively', async () => {
    const { useCase } = build([
      tx({ id_hash: 'hit', asset_in_id: 'ETH', tx_type: 'BUY' }),
      tx({ id_hash: 'wrong-type', asset_in_id: 'ETH', tx_type: 'SELL' }),
      tx({ id_hash: 'wrong-symbol', asset_in_id: 'BTC', tx_type: 'BUY' }),
    ]);

    expect(await hashes(useCase, { symbol: 'ETH', types: ['BUY'], paging: ALL })).toEqual(['hit']);
  });

  it('reads only: it calls the two read methods and nothing else', async () => {
    const { useCase, ledger } = build([tx({ id_hash: 'a' })]);

    await useCase.execute({ paging: ALL });

    expect(ledger.getSpotTransactions).toHaveBeenCalledTimes(1);
    expect(ledger.getSpotTransactionOverrides).toHaveBeenCalledTimes(1);
    expect(Object.keys(ledger).sort()).toEqual(['getSpotTransactionOverrides', 'getSpotTransactions']);
  });

  it('scopes the ledger read to an account when the route asks for one', async () => {
    const { useCase, ledger } = build([tx({ id_hash: 'a' })]);

    await useCase.execute({ accountId: 'acc-9', paging: ALL });

    expect(ledger.getSpotTransactions).toHaveBeenCalledWith('acc-9');
  });
});

describe('SearchSpotTransactionsUseCase paging', () => {
  const many = (count: number) =>
    Array.from({ length: count }, (_, i) =>
      tx({ id_hash: `h${String(i).padStart(3, '0')}`, timestamp: `2024-01-01T00:00:${String(i % 60).padStart(2, '0')}.000Z` }),
    );

  it('totals describe the filtered set and the first page is full', async () => {
    const { useCase } = build(many(60));

    const result = await useCase.execute({ paging: { kind: 'page', page: 1, pageSize: 25 } });

    expect(result).toMatchObject({ kind: 'page', page: 1, pageSize: 25, totalCount: 60, totalPages: 3 });
    expect(result.rows).toHaveLength(25);
  });

  it('totals count only rows matching the filters, not the whole ledger', async () => {
    const txs = [...many(30), ...many(30).map((t) => ({ ...t, id_hash: `x${t.id_hash}`, tx_type: 'SELL' as const }))];
    const { useCase } = build(txs);

    const result = await useCase.execute({ types: ['SELL'], paging: { kind: 'page', page: 1, pageSize: 25 } });

    expect(result).toMatchObject({ totalCount: 30, totalPages: 2 });
  });

  it('returns a partial last page', async () => {
    const { useCase } = build(many(60));

    const result = await useCase.execute({ paging: { kind: 'page', page: 3, pageSize: 25 } });

    expect(result.rows).toHaveLength(10);
  });

  it('returns an empty page with the true totals when the page is past the end, instead of clamping', async () => {
    const { useCase } = build(many(60));

    const result = await useCase.execute({ paging: { kind: 'page', page: 9, pageSize: 25 } });

    expect(result).toMatchObject({ kind: 'page', page: 9, pageSize: 25, totalCount: 60, totalPages: 3 });
    expect(result.rows).toEqual([]);
  });

  it('gives zero totals and an empty page one when nothing matches', async () => {
    const { useCase } = build(many(5));

    const result = await useCase.execute({ symbol: 'NOPE', paging: { kind: 'page', page: 1, pageSize: 25 } });

    expect(result).toMatchObject({ kind: 'page', page: 1, totalCount: 0, totalPages: 0 });
    expect(result.rows).toEqual([]);
  });

  it('rejects a page or page size below one', async () => {
    const { useCase } = build(many(3));

    await expect(useCase.execute({ paging: { kind: 'page', page: 0, pageSize: 25 } })).rejects.toThrow(RangeError);
    await expect(useCase.execute({ paging: { kind: 'page', page: -1, pageSize: 25 } })).rejects.toThrow(RangeError);
    await expect(useCase.execute({ paging: { kind: 'page', page: 1, pageSize: 0 } })).rejects.toThrow(RangeError);
  });

  it('orders a page newest first with the id hash as the tiebreak', async () => {
    const { useCase } = build([
      tx({ id_hash: 'b', timestamp: '2024-01-02T00:00:00.000Z' }),
      tx({ id_hash: 'new', timestamp: '2024-05-01T00:00:00.000Z' }),
      tx({ id_hash: 'a', timestamp: '2024-01-02T00:00:00.000Z' }),
    ]);

    const result = await useCase.execute({ paging: { kind: 'page', page: 1, pageSize: 25 } });

    expect(result.rows.map((r) => r.id_hash)).toEqual(['new', 'a', 'b']);
  });

  it('orders by the effective timestamp, so an edited date moves the row', async () => {
    const { useCase } = build(
      [tx({ id_hash: 'moved', timestamp: '2024-01-01T00:00:00.000Z' }), tx({ id_hash: 'later', timestamp: '2024-02-01T00:00:00.000Z' })],
      [override('moved', { timestamp_edited: true, timestamp: '2024-09-01T00:00:00.000Z' })],
    );

    const result = await useCase.execute({ paging: { kind: 'page', page: 1, pageSize: 25 } });

    expect(result.rows.map((r) => r.id_hash)).toEqual(['moved', 'later']);
  });

  it('keeps the ledger order and returns no page fields for the all arm', async () => {
    const { useCase } = build([
      tx({ id_hash: 'first', timestamp: '2024-01-01T00:00:00.000Z' }),
      tx({ id_hash: 'second', timestamp: '2024-06-01T00:00:00.000Z' }),
    ]);

    const result = await useCase.execute({ paging: ALL });

    expect(result.kind).toBe('all');
    expect(result.rows.map((r) => r.id_hash)).toEqual(['first', 'second']);
    expect(result).not.toHaveProperty('totalPages');
  });

  it('delegates ordering to the core-domain helper instead of sorting itself', async () => {
    const { readFileSync } = await import('node:fs');
    const { dirname, join } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../SearchSpotTransactionsUseCase.ts'), 'utf-8');

    expect(source).not.toMatch(/\.sort\(/);
    expect(source).toMatch(/orderByIsoDateDescendingThenKey/);
  });
});

describe('toAdvisorSpotRow', () => {
  const rowOf = async (t: LedgerSpotTransaction, o: LedgerSpotTransactionOverride[] = []) => {
    const { useCase } = build([t], o);
    const result = await useCase.execute({ paging: ALL });
    const [row] = result.rows;
    if (!row) throw new Error('expected a row');
    return row;
  };

  it('flags an edited row and carries its effective values', async () => {
    const row = await rowOf(tx({ id_hash: 'e' }), [override('e', { tx_type_edited: true, tx_type: 'SELL' })]);

    expect(toAdvisorSpotRow(row)).toMatchObject({ edited: true, type: 'SELL' });
  });

  it('flags an unedited row as not edited', async () => {
    expect(toAdvisorSpotRow(await rowOf(tx({ id_hash: 'u' }))).edited).toBe(false);
  });

  it('omits the pre-edit original and every internal identifier', async () => {
    const row = await rowOf(tx({ id_hash: 'e' }), [override('e', { price_edited: true, price_fiat: '5' as never, fiat_currency: 'EUR' })]);

    const projected = toAdvisorSpotRow(row);

    expect(projected).not.toHaveProperty('override');
    expect(projected).not.toHaveProperty('original');
    expect(projected.priceFiat).toBe('5');
    expect(JSON.stringify(projected)).not.toContain('"priceFiat":"100"');
    for (const internal of ['id', 'id_hash', 'account_id']) expect(projected).not.toHaveProperty(internal);
  });

  it('keeps an explicit zero fee as a charged zero, distinct from no fee', async () => {
    const zero = toAdvisorSpotRow(await rowOf(tx({ id_hash: 'z', fee_amount: '0' as never, fee_asset_id: 'EUR' })));
    const none = toAdvisorSpotRow(await rowOf(tx({ id_hash: 'n' })));

    expect(zero.fee).toEqual({ kind: 'CHARGED', amount: '0', assetId: 'EUR' });
    expect(none.fee).toEqual({ kind: 'NONE' });
  });

  it('reports a fee edited to none as none', async () => {
    const row = await rowOf(tx({ id_hash: 'f', fee_amount: '2' as never, fee_asset_id: 'EUR' }), [
      override('f', { fee_kind: 'NONE' }),
    ]);

    expect(toAdvisorSpotRow(row).fee).toEqual({ kind: 'NONE' });
  });

  it('carries date, assets, amounts, prices and the exchange name', async () => {
    const row = await rowOf(
      tx({
        id_hash: 'all',
        exchange: 'Kraken',
        asset_out_id: 'EUR',
        amount_out: '100' as never,
        price_fiat: null,
      }),
    );

    expect(toAdvisorSpotRow(row)).toMatchObject({
      date: '2024-01-10T12:00:00.000Z',
      type: 'BUY',
      assetIn: 'BTC',
      amountIn: '1',
      assetOut: 'EUR',
      amountOut: '100',
      priceFiat: null,
      totalFiat: '100',
      fiatCurrency: 'EUR',
      exchange: 'Kraken',
    });
  });
});
