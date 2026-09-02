/**
 * A micro-priced asset keeps its significant digits, and a cost basis never rounds
 * to zero.
 *
 * The holdings and KPI aggregations multiply a quantity by a unit cost. Operand
 * scales were inherited from `v_portfolio_daily_valuation` rather than chosen against
 * the magnitudes that actually occur, and a `DECIMAL(26,12)` unit cost turns
 * `9.18695e-10` — a value this repository already asserts as real, in
 * `fifo_fx_conversion.spec.ts` — into `9.19e-10`. Three significant digits out of six.
 *
 * Below `1e-12` it turns into `0`, and a cost basis of zero is not a small error: it
 * is a phantom hundred-percent gain on the whole position, on the path a tax report
 * is declared from.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import Decimal from 'decimal.js';
import { DuckDbAdapter } from '@kryptofolio/database';
import { DuckDbPortfolioAnalyticsAdapter } from '../DuckDbPortfolioAnalyticsAdapter';
import { DuckDbMetricsAdapter } from '../DuckDbMetricsAdapter';

const MIGRATIONS = ['002_ledger_schema', '003_currency_schema', '004_fifo_traceability', '007_futures_collateral_movements'].map((name) =>
  fs.readFileSync(
    path.resolve(__dirname, `../../../../../../../packages/database/migrations/sqlite/${name}.sql`),
    'utf-8',
  ),
);

/** The unit cost `fifo_fx_conversion.spec.ts` already treats as a real figure. */
const MICRO_UNIT_COST = '0.000000000918695';
/** 1e9 units of it: a basis of 0.918695, comfortably representable. */
const MICRO_QTY = '1000000000';
const MICRO_BASIS = '0.918695';

/** Below the twelve-decimal cut entirely: the arm that produces a zero basis. */
const SUB_CUT_UNIT_COST = '0.0000000000001';
const SUB_CUT_QTY = '1000000000000';
const SUB_CUT_BASIS = '0.1';

describe('micro-priced assets keep their significant digits', () => {
  let sqlitePath: string;
  let sqliteDb: DatabaseSync;
  let duckDb: DuckDbAdapter;
  let analytics: DuckDbPortfolioAnalyticsAdapter;

  beforeEach(async () => {
    sqlitePath = path.join(
      os.tmpdir(),
      `test_microprice_${process.pid}_${Date.now()}_${Math.trunc(performance.now() * 1000)}.db`,
    );
    sqliteDb = new DatabaseSync(sqlitePath);
    sqliteDb.exec('PRAGMA foreign_keys = ON;');
    for (const sql of MIGRATIONS) sqliteDb.exec(sql);

    sqliteDb
      .prepare("INSERT INTO accounts (id, name, type) VALUES ('acc-1', 'Bit2Me', 'exchange')")
      .run();

    const asset = sqliteDb.prepare('INSERT INTO assets (id, symbol) VALUES (?, ?)');
    const tx = sqliteDb.prepare(
      `INSERT INTO spot_transactions (id, id_hash, account_id, tx_type, asset_in_id, amount_in,
         total_fiat, price_fiat, fiat_currency, timestamp, status)
       VALUES (?, ?, 'acc-1', 'BUY', ?, ?, ?, ?, 'EUR', '2023-01-02T10:00:00Z', 'COMPLETED')`,
    );
    const lot = sqliteDb.prepare(
      `INSERT INTO tax_lots (id, spot_transaction_id, asset_id, account_id, original_qty, remaining_qty,
         unit_cost_fiat, total_cost_fiat, fiat_currency, acquisition_timestamp, exchange_location, status)
       VALUES (?, ?, ?, 'acc-1', ?, ?, ?, ?, 'EUR', '2023-01-02T10:00:00Z', 'Bit2Me', 'OPEN')`,
    );

    for (const [symbol, qty, unitCost, basis] of [
      ['MICRO', MICRO_QTY, MICRO_UNIT_COST, MICRO_BASIS],
      ['SUBCUT', SUB_CUT_QTY, SUB_CUT_UNIT_COST, SUB_CUT_BASIS],
    ] as const) {
      asset.run(symbol, symbol);
      tx.run(`tx-${symbol}`, `h-${symbol}`, symbol, qty, basis, unitCost);
      lot.run(`lot-${symbol}`, `tx-${symbol}`, symbol, qty, qty, unitCost, basis);
    }

    process.env.MOCK_MODE = 'false';
    process.env.DUCKDB_PATH = ':memory:';
    process.env.PARQUET_DATA_PATH = fs.mkdtempSync(path.join(os.tmpdir(), 'prices-'));
    duckDb = new DuckDbAdapter();
    await duckDb.initialize(sqlitePath);
    analytics = new DuckDbPortfolioAnalyticsAdapter(duckDb);
  });

  afterEach(() => {
    sqliteDb.close();
    if (fs.existsSync(sqlitePath)) fs.unlinkSync(sqlitePath);
  });

  it('keeps six significant digits of a 1e-10 unit cost through the holdings aggregation', async () => {
    const holdings = await analytics.getHoldingsSnapshot('acc-1', 'EUR');
    const micro = holdings.find((h) => h.symbol === 'MICRO');

    // 1e9 × 0.000000000918695 = 0.918695 exactly. Truncating the unit cost to twelve
    // decimal places yields 0.919 — wrong in the third significant digit.
    expect(micro).toBeDefined();
    expect(new Decimal(micro!.totalCostFiat).equals(new Decimal(MICRO_BASIS))).toBe(true);
  });

  it('never rounds a cost basis to zero', async () => {
    const holdings = await analytics.getHoldingsSnapshot('acc-1', 'EUR');
    const subCut = holdings.find((h) => h.symbol === 'SUBCUT');

    // A zero basis is indistinguishable from "acquired for free" and reads as a
    // hundred-percent gain on the whole position.
    expect(subCut).toBeDefined();
    expect(new Decimal(subCut!.totalCostFiat).isZero()).toBe(false);
    expect(new Decimal(subCut!.totalCostFiat).equals(new Decimal(SUB_CUT_BASIS))).toBe(true);
  });

  it('keeps the same precision through the KPI cost basis', async () => {
    const kpis = await new DuckDbMetricsAdapter(duckDb).getKpis('EUR');

    // 0.918695 + 0.1 = 1.018695, which rounds to 1.02 at the KPI's two decimals.
    // Under the twelve-place cut the second lot contributes 0 and this reads 0.92.
    expect(new Decimal(kpis.totalCostBasis).equals(new Decimal('1.02'))).toBe(true);
  });
});

/**
 * Both ends of the magnitude range in one portfolio.
 *
 * Testing either end alone is what let the previous allocation pass twice: a fixture
 * of `0.1` and `0.2` exercises neither the ceiling nor the floor, and every scale
 * looks correct against it.
 */
describe('both ends of the range survive together', () => {
  let sqlitePath: string;
  let sqliteDb: DatabaseSync;
  let duckDb: DuckDbAdapter;

  beforeEach(async () => {
    sqlitePath = path.join(
      os.tmpdir(),
      `test_bothends_${process.pid}_${Date.now()}_${Math.trunc(performance.now() * 1000)}.db`,
    );
    sqliteDb = new DatabaseSync(sqlitePath);
    sqliteDb.exec('PRAGMA foreign_keys = ON;');
    for (const sql of MIGRATIONS) sqliteDb.exec(sql);
    sqliteDb
      .prepare("INSERT INTO accounts (id, name, type) VALUES ('acc-1', 'Kraken', 'exchange')")
      .run();

    const asset = sqliteDb.prepare('INSERT INTO assets (id, symbol) VALUES (?, ?)');
    const tx = sqliteDb.prepare(
      `INSERT INTO spot_transactions (id, id_hash, account_id, tx_type, asset_in_id, amount_in,
         total_fiat, price_fiat, fiat_currency, timestamp, status)
       VALUES (?, ?, 'acc-1', 'BUY', ?, ?, ?, ?, 'EUR', '2023-01-02T10:00:00Z', 'COMPLETED')`,
    );
    const lot = sqliteDb.prepare(
      `INSERT INTO tax_lots (id, spot_transaction_id, asset_id, account_id, original_qty, remaining_qty,
         unit_cost_fiat, total_cost_fiat, fiat_currency, acquisition_timestamp, exchange_location, status)
       VALUES (?, ?, ?, 'acc-1', ?, ?, ?, ?, 'EUR', '2023-01-02T10:00:00Z', 'Kraken', 'OPEN')`,
    );

    for (const [symbol, qty, unitCost, basis] of [
      // The largest basis the view chain can carry: basis_fiat is DECIMAL(38,30),
      // eight integer digits. Chosen at the boundary rather than past it, because
      // past it the correct behaviour is the loud failure, asserted separately below.
      ['WHALE', '1000', '99999.5', '99999500'],
      // And a micro price in the same portfolio, at satoshi quantity precision.
      ['MICRO', '0.00000001', '0.000000000918695', '0.00000000000000000918695'],
    ] as const) {
      asset.run(symbol, symbol);
      tx.run(`tx-${symbol}`, `h-${symbol}`, symbol, qty, basis, unitCost);
      lot.run(`lot-${symbol}`, `tx-${symbol}`, symbol, qty, qty, unitCost, basis);
    }

    process.env.MOCK_MODE = 'false';
    process.env.DUCKDB_PATH = ':memory:';
    process.env.PARQUET_DATA_PATH = fs.mkdtempSync(path.join(os.tmpdir(), 'prices-'));
    duckDb = new DuckDbAdapter();
    await duckDb.initialize(sqlitePath);
  });

  afterEach(() => {
    sqliteDb.close();
    if (fs.existsSync(sqlitePath)) fs.unlinkSync(sqlitePath);
  });

  it('holds a basis past 1e8 and a 1e-10 unit price at once', async () => {
    const holdings = await new DuckDbPortfolioAnalyticsAdapter(duckDb).getHoldingsSnapshot(
      'acc-1',
      'EUR',
    );

    const whale = holdings.find((h) => h.symbol === 'WHALE');
    const micro = holdings.find((h) => h.symbol === 'MICRO');

    // 1000 × 99999.5 = 99,999,500 — eight integer digits, the chain's ceiling, and
    // four orders of magnitude above the largest figure measured on the real ledger
    // (a 79163 unit cost, a 12k portfolio total).
    expect(new Decimal(whale!.totalCostFiat).equals(new Decimal('99999500'))).toBe(true);
    // 1e-8 × 9.18695e-10 — a genuine non-zero that must not collapse.
    expect(new Decimal(micro!.totalCostFiat).isZero()).toBe(false);
  });

  it('fails loudly rather than silently past the chain ceiling', async () => {
    // `basis_fiat` in v_flattened_fifo_events is DECIMAL(38,30) — eight integer
    // digits. Those thirty decimal places are deliberate: they keep a 1e-21 price
    // distinguishable from zero so the round-to-zero guard can flag it instead of
    // persisting a silent 0. The cost is a ceiling on the total, and the comment
    // justifying the scale reasons about a unit price, which a total is not.
    //
    // Widening it would trade a guard that prevents a phantom gain for headroom no
    // measured figure needs. So the ceiling stays, and this test pins it: past it the
    // engine must throw, never truncate.
    sqliteDb
      .prepare(
        `INSERT INTO spot_transactions (id, id_hash, account_id, tx_type, asset_in_id, amount_in,
           total_fiat, price_fiat, fiat_currency, timestamp, status)
         VALUES ('tx-OVER', 'h-OVER', 'acc-1', 'BUY', 'WHALE', '1000', '999995000', '999995',
                 'EUR', '2023-03-02T10:00:00Z', 'COMPLETED')`,
      )
      .run();

    await expect(
      new DuckDbPortfolioAnalyticsAdapter(duckDb).getHoldingsSnapshot('acc-1', 'EUR'),
    ).rejects.toThrow(/out of range/);
  });
});
