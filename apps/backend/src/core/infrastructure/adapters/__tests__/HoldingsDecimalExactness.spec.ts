/**
 * Money is never born of a multiplication or a sum evaluated in floating point.
 *
 * The holdings query computes cost basis, current value and unrealized PnL by
 * casting through `DOUBLE`. Layering an FX rate on top of a `DOUBLE` product would
 * let this change ship a spec requiring decimal arithmetic over code that is binary
 * floating point underneath — a test passing while the rule is broken.
 *
 * The fixture uses `0.1` and `0.2`, which have no exact binary representation, so
 * the difference between the two arithmetics is visible rather than theoretical.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DuckDbAdapter } from '@kryptofolio/database';
import Decimal from 'decimal.js';
import { DuckDbPortfolioAnalyticsAdapter } from '../DuckDbPortfolioAnalyticsAdapter';
import { DuckDbMetricsAdapter } from '../DuckDbMetricsAdapter';

const MIGRATIONS = ['002_ledger_schema', '003_currency_schema', '004_fifo_traceability'].map((name) =>
  fs.readFileSync(
    path.resolve(__dirname, `../../../../../../../packages/database/migrations/sqlite/${name}.sql`),
    'utf-8',
  ),
);

describe('holdings arithmetic is exact', () => {
  let sqlitePath: string;
  let sqliteDb: DatabaseSync;
  let duckDb: DuckDbAdapter;
  let adapter: DuckDbPortfolioAnalyticsAdapter;

  beforeEach(async () => {
    sqlitePath = path.join(
      os.tmpdir(),
      `test_decimal_exact_${process.pid}_${Date.now()}_${Math.trunc(performance.now() * 1000)}.db`,
    );
    sqliteDb = new DatabaseSync(sqlitePath);
    sqliteDb.exec('PRAGMA foreign_keys = ON;');
    for (const sql of MIGRATIONS) sqliteDb.exec(sql);

    sqliteDb.prepare("INSERT INTO assets (id, symbol) VALUES ('XRP', 'XRP')").run();
    sqliteDb
      .prepare("INSERT INTO accounts (id, name, type) VALUES ('acc-1', 'Kraken', 'exchange')")
      .run();
    sqliteDb
      .prepare(
        `INSERT INTO spot_transactions (id, id_hash, account_id, tx_type, asset_in_id, amount_in,
           total_fiat, price_fiat, fiat_currency, timestamp, status)
         VALUES ('tx-1', 'h1', 'acc-1', 'BUY', 'XRP', '3', '0.3', '0.1', 'EUR',
                 '2023-01-02T10:00:00Z', 'COMPLETED')`,
      )
      .run();
    // 3 units at 0.1 each: a cost basis of exactly 0.3, which DOUBLE cannot hold.
    sqliteDb
      .prepare(
        `INSERT INTO tax_lots (id, spot_transaction_id, asset_id, account_id, original_qty, remaining_qty,
           unit_cost_fiat, total_cost_fiat, fiat_currency, acquisition_timestamp, exchange_location, status)
         VALUES ('lot-1', 'tx-1', 'XRP', 'acc-1', '3', '3', '0.1', '0.3', 'EUR',
                 '2023-01-02T10:00:00Z', 'Kraken', 'OPEN')`,
      )
      .run();

    process.env.MOCK_MODE = 'false';
    process.env.DUCKDB_PATH = ':memory:';
    // `historical_prices` federates a Parquet tree that defaults to the real data
    // directory. Left unset, this fixture's marked price is whatever the developer
    // last ingested, and the exactness assertions below become non-deterministic.
    process.env.PARQUET_DATA_PATH = fs.mkdtempSync(path.join(os.tmpdir(), 'prices-'));
    duckDb = new DuckDbAdapter();
    await duckDb.initialize(sqlitePath);
    // Marked at 0.2: a current value of exactly 0.6 and a PnL of exactly 0.3.
    await duckDb.execute(
      `INSERT INTO _price_seed (symbol, close, date, currency)
       VALUES ('XRP', 0.2, DATE '2023-06-15', 'EUR')`,
    );

    adapter = new DuckDbPortfolioAnalyticsAdapter(duckDb);
  });

  afterEach(() => {
    sqliteDb.close();
    if (fs.existsSync(sqlitePath)) fs.unlinkSync(sqlitePath);
  });

  it('computes cost basis, current value and PnL exactly', async () => {
    const [xrp] = await adapter.getHoldingsSnapshot('acc-1', 'EUR');

    // Written as full-scale decimal strings: `toBeCloseTo` is precisely the
    // assertion that would not notice the defect this test exists to catch.
    expect(xrp.totalCostFiat).toBe('0.300000000000000000');
    expect(xrp.currentValueFiat).toBe('0.600000000000000000');
    expect(xrp.unrealizedPnlFiat).toBe('0.300000000000000000');
  });

  it('reconciles: PnL is exactly current value minus cost basis', async () => {
    const [xrp] = await adapter.getHoldingsSnapshot('acc-1', 'EUR');

    const value = new Decimal(xrp.currentValueFiat ?? '0');
    const basis = new Decimal(xrp.totalCostFiat);
    const pnl = new Decimal(xrp.unrealizedPnlFiat ?? '0');

    // Three figures a user sees side by side. Computed in DOUBLE they disagree in
    // their last places, and a subtraction that does not reconcile on screen is
    // read as a bug — correctly.
    expect(pnl.equals(value.minus(basis))).toBe(true);
  });
});

