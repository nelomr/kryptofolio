/**
 * The allocation read is a conversion and a quantity report, not a relabel.
 *
 * `v_portfolio_daily_valuation` is canonical EUR. The allocation query used to read it raw and
 * stamp the requested currency on the result, so a dollar reader saw euro amounts under a dollar
 * label. It also divided by a total that silently skipped holdings with no computable value, and a
 * holding with no value crashed the row mapping instead of being reported.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import Decimal from 'decimal.js';
import { DuckDbAdapter } from '@kryptofolio/database';
import { DuckDbMetricsAdapter } from '../DuckDbMetricsAdapter';
import type { AssetAllocationItem } from '../../../domain/ports/IMetricsPort';

const MIGRATIONS = [
  '002_ledger_schema',
  '003_currency_schema',
  '004_fifo_traceability',
  '007_futures_collateral_movements',
  '008_spot_transaction_overrides',
].map((name) =>
  fs.readFileSync(
    path.resolve(__dirname, `../../../../../../../packages/database/migrations/sqlite/${name}.sql`),
    'utf-8',
  ),
);

/** The latest quote has an exact reciprocal at the view's twelve-decimal bound. */
const RATES: ReadonlyArray<readonly [date: string, usdPerEurQuote: string]> = [
  ['2024-01-15', '0.8'],
  ['2025-12-01', '0.25'],
];
const EUR_USD_LATEST = new Decimal(4);

const ACQUIRED_ON = '2024-01-15';
const LATEST_ON = '2025-12-01';

interface Holding {
  symbol: string;
  qty: string;
  price?: { close: string; currency: string };
}

const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

async function createMetrics(holdings: readonly Holding[]): Promise<DuckDbMetricsAdapter> {
  const sqlitePath = path.join(
    os.tmpdir(),
    `test_allocation_${process.pid}_${Date.now()}_${Math.trunc(performance.now() * 1000)}.db`,
  );
  const sqliteDb = new DatabaseSync(sqlitePath);
  sqliteDb.exec('PRAGMA foreign_keys = ON;');
  for (const sql of MIGRATIONS) sqliteDb.exec(sql);

  sqliteDb
    .prepare("INSERT INTO accounts (id, name, type) VALUES ('acc-1', 'Kraken', 'exchange')")
    .run();
  const rate = sqliteDb.prepare(
    "INSERT INTO exchange_rates (date, pair, rate, source) VALUES (?, 'USD/EUR', ?, 'ECB')",
  );
  for (const [date, quote] of RATES) rate.run(date, quote);

  const asset = sqliteDb.prepare('INSERT INTO assets (id, symbol) VALUES (?, ?)');
  const buy = sqliteDb.prepare(
    `INSERT INTO spot_transactions (id, id_hash, account_id, tx_type, asset_in_id, amount_in,
       total_fiat, price_fiat, fiat_currency, timestamp, status)
     VALUES (?, ?, 'acc-1', 'BUY', ?, ?, '1', '1', 'EUR', ?, 'COMPLETED')`,
  );
  for (const h of holdings) {
    asset.run(h.symbol, h.symbol);
    buy.run(`tx-${h.symbol}`, `h-${h.symbol}`, h.symbol, h.qty, `${ACQUIRED_ON}T10:00:00Z`);
  }
  sqliteDb.close();

  process.env.MOCK_MODE = 'false';
  process.env.DUCKDB_PATH = ':memory:';
  process.env.PARQUET_DATA_PATH = fs.mkdtempSync(path.join(os.tmpdir(), 'prices-'));
  const duckDb = new DuckDbAdapter();
  await duckDb.initialize(sqlitePath);
  await duckDb.rebuildDerivedChain();
  for (const h of holdings) {
    if (!h.price) continue;
    await duckDb.execute(
      `INSERT INTO _price_seed (symbol, close, date, currency)
       VALUES ('${h.symbol}', ${h.price.close}, DATE '${LATEST_ON}', '${h.price.currency}')`,
    );
  }
  await duckDb.rebuildDerivedChain();

  cleanups.push(() => {
    if (fs.existsSync(sqlitePath)) fs.unlinkSync(sqlitePath);
  });
  return new DuckDbMetricsAdapter(duckDb);
}

const bySymbol = (items: readonly AssetAllocationItem[], symbol: string): AssetAllocationItem => {
  const item = items.find((i) => i.symbol === symbol);
  expect(item, `no allocation item for ${symbol}`).toBeDefined();
  return item!;
};

function valued(item: AssetAllocationItem): Extract<AssetAllocationItem, { kind: 'valued' }> {
  expect(item.kind, `${item.symbol} should be valued`).toBe('valued');
  if (item.kind !== 'valued') throw new Error('unreachable');
  return item;
}

const PRICED: readonly Holding[] = [
  { symbol: 'BIG', qty: '2', price: { close: '1200', currency: 'EUR' } },
  { symbol: 'SMALL', qty: '1', price: { close: '300', currency: 'EUR' } },
];

describe('asset allocation read', () => {
  it('reports the held quantity of each asset as an exact decimal string', async () => {
    const metrics = await createMetrics(PRICED);

    const items = await metrics.getAssetAllocation('EUR');

    expect(bySymbol(items, 'BIG').amount).toBe('2');
    expect(bySymbol(items, 'SMALL').amount).toBe('1');
  });

  it('keeps euro figures as they are when the display currency is EUR', async () => {
    const metrics = await createMetrics(PRICED);

    const big = valued(bySymbol(await metrics.getAssetAllocation('EUR'), 'BIG'));

    expect(big.currency).toBe('EUR');
    expect(new Decimal(big.valueFiat).equals('2400')).toBe(true);
    expect(big.allocationPct).toBe('88.89');
  });

  it('converts the value into a non-EUR display currency instead of relabelling it', async () => {
    const metrics = await createMetrics(PRICED);

    const items = await metrics.getAssetAllocation('USD');
    const big = valued(bySymbol(items, 'BIG'));
    const small = valued(bySymbol(items, 'SMALL'));

    expect(big.currency).toBe('USD');
    expect(
      new Decimal(big.valueFiat).equals(new Decimal('2400').times(EUR_USD_LATEST)),
      `BIG valued ${big.valueFiat}, expected 9600 USD`,
    ).toBe(true);
    expect(new Decimal(small.valueFiat).equals(new Decimal('300').times(EUR_USD_LATEST))).toBe(
      true,
    );
    expect(big.allocationPct).toBe('88.89');
    expect(big.amount).toBe('2');
  });

  it('reports a holding priced in a currency with no rate as unvalued, keeping its quantity', async () => {
    const metrics = await createMetrics([
      ...PRICED,
      { symbol: 'NORATE', qty: '3', price: { close: '10', currency: 'GBP' } },
    ]);

    const items = await metrics.getAssetAllocation('EUR');

    const norate = bySymbol(items, 'NORATE');
    expect(norate.kind).toBe('unvalued');
    expect(norate.amount).toBe('3');
    expect('valueFiat' in norate).toBe(false);
    expect(valued(bySymbol(items, 'BIG')).allocationPct).toBe('88.89');
  });

  it('reports a holding with no price series as unvalued and out of the percentage denominator', async () => {
    const metrics = await createMetrics([...PRICED, { symbol: 'NOPRICE', qty: '7' }]);

    const items = await metrics.getAssetAllocation('EUR');

    const noprice = bySymbol(items, 'NOPRICE');
    expect(noprice.kind).toBe('unvalued');
    expect(noprice.amount).toBe('7');
    const pctSum = items
      .filter((i): i is Extract<AssetAllocationItem, { kind: 'valued' }> => i.kind === 'valued')
      .reduce((sum, i) => sum.plus(i.allocationPct), new Decimal(0));
    expect(pctSum.toFixed(2)).toBe('100.00');
    expect(valued(bySymbol(items, 'BIG')).allocationPct).toBe('88.89');
    expect(valued(bySymbol(items, 'SMALL')).allocationPct).toBe('11.11');
    expect('allocationPct' in noprice).toBe(false);
  });

  it('reports a valued holding as unvalued when the display currency has no rate', async () => {
    const metrics = await createMetrics(PRICED);

    const items = await metrics.getAssetAllocation('JPY');

    const big = bySymbol(items, 'BIG');
    expect(big.kind).toBe('unvalued');
    expect(big.amount).toBe('2');
  });
});
