/**
 * A KPI headline is a conversion, not a label.
 *
 * `getKpis` takes a target currency and uses it in exactly two places: the
 * `currency` field it echoes back, and the realized-PnL statement. Equity, cost
 * basis and the unrealized PnL derived from them are summed in whatever currency
 * the underlying rows happen to be denominated in, so the same ledger read in
 * euros and in dollars returns the same headline numbers under two different
 * labels. The whole point of a display currency is that it must not.
 *
 * Per Decision 2, each figure carries its own rate date: a cost basis converts at
 * acquisition, equity at the latest available rate, and the unrealized PnL is the
 * difference of those two already-converted figures rather than a third
 * conversion of its own.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import Decimal from 'decimal.js';
import { DuckDbAdapter } from '@kryptofolio/database';
import { DuckDbMetricsAdapter } from '../DuckDbMetricsAdapter';

const MIGRATIONS = ['002_ledger_schema', '003_currency_schema', '004_fifo_traceability'].map((name) =>
  fs.readFileSync(
    path.resolve(__dirname, `../../../../../../../packages/database/migrations/sqlite/${name}.sql`),
    'utf-8',
  ),
);

/**
 * `exchange_rates` is ECB-quoted, so it holds `USD/EUR` and `v_fx_daily` synthesises
 * `EUR/USD` by inverting at twelve decimals. Every quote below has an exact reciprocal
 * at that bound, so no expectation here can fail for a rounding reason.
 */
const RATES: ReadonlyArray<readonly [date: string, usdPerEurQuote: string, eurUsd: string]> = [
  ['2024-01-15', '0.8', '1.25'], // the acquisition date
  ['2024-03-14', '0.4', '2.5'], // the disposal date
  ['2025-12-01', '0.25', '4'], // the latest rate in the ledger
];

const rateOn = (date: string): Decimal => new Decimal(RATES.find(([d]) => d === date)![2]);

const ACQUIRED_ON = '2024-01-15';
const DISPOSED_ON = '2024-03-14';
const LATEST_ON = '2025-12-01';

/** One held lot, in euros: 1 unit at 1000, worth 1200 at the latest price. */
const HELD_QTY = '1';
const HELD_UNIT_COST_EUR = '1000';
const HELD_PRICE_EUR = '1200';

/** One disposed lot, in euros: acquired at 1000, sold for 1500. */
const REALIZED_GAIN_EUR = '500';

/** Money is compared numerically; `toBeCloseTo` would hide exactly the residue that matters. */
const expectMoney = (actual: string, expected: Decimal, label: string): void => {
  expect(
    new Decimal(actual).equals(expected),
    `${label}: got ${actual}, expected ${expected.toFixed()}`,
  ).toBe(true);
};

describe('KPI display-currency conversion', () => {
  let sqlitePath: string;
  let sqliteDb: DatabaseSync;
  let duckDb: DuckDbAdapter;
  let metrics: DuckDbMetricsAdapter;

  beforeEach(async () => {
    sqlitePath = path.join(
      os.tmpdir(),
      `test_kpifx_${process.pid}_${Date.now()}_${Math.trunc(performance.now() * 1000)}.db`,
    );
    sqliteDb = new DatabaseSync(sqlitePath);
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
       VALUES (?, ?, 'acc-1', 'BUY', ?, ?, ?, ?, 'EUR', ?, 'COMPLETED')`,
    );
    const lot = sqliteDb.prepare(
      `INSERT INTO tax_lots (id, spot_transaction_id, asset_id, account_id, original_qty, remaining_qty,
         unit_cost_fiat, total_cost_fiat, fiat_currency, acquisition_timestamp, exchange_location, status)
       VALUES (?, ?, ?, 'acc-1', ?, ?, ?, ?, 'EUR', ?, 'Kraken', 'OPEN')`,
    );

    const seedLot = (symbol: string, qty: string, unitCost: string, timestamp: string): void => {
      const basis = new Decimal(unitCost).times(qty).toFixed();
      buy.run(`tx-${symbol}`, `h-${symbol}`, symbol, qty, basis, unitCost, timestamp);
      lot.run(`lot-${symbol}`, `tx-${symbol}`, symbol, qty, qty, unitCost, basis, timestamp);
    };

    for (const symbol of ['HELD', 'SOLD']) asset.run(symbol, symbol);

    seedLot('HELD', HELD_QTY, HELD_UNIT_COST_EUR, `${ACQUIRED_ON}T10:00:00Z`);

    // A buy and a later disposal, so a realized gain exists with a rate date of its own.
    seedLot('SOLD', '1', '1000', `${ACQUIRED_ON}T10:00:00Z`);
    sqliteDb
      .prepare(
        `INSERT INTO spot_transactions (id, id_hash, account_id, tx_type, asset_out_id, amount_out,
           total_fiat, price_fiat, fiat_currency, timestamp, status)
         VALUES ('tx-SOLD-sell', 'h-SOLD-sell', 'acc-1', 'SELL', 'SOLD', '1',
                 '1500', '1500', 'EUR', '${DISPOSED_ON}T10:00:00Z', 'COMPLETED')`,
      )
      .run();

    process.env.MOCK_MODE = 'false';
    process.env.DUCKDB_PATH = ':memory:';
    process.env.PARQUET_DATA_PATH = fs.mkdtempSync(path.join(os.tmpdir(), 'prices-'));
    duckDb = new DuckDbAdapter();
    await duckDb.initialize(sqlitePath);

    await duckDb.execute(`
      INSERT INTO _price_seed (date, asset_id, symbol, open, high, low, close, volume, currency, year)
      VALUES (DATE '${LATEST_ON}', 'HELD', 'HELD', ${HELD_PRICE_EUR}, ${HELD_PRICE_EUR},
              ${HELD_PRICE_EUR}, ${HELD_PRICE_EUR}, 0, 'EUR', 2025);
    `);

    metrics = new DuckDbMetricsAdapter(duckDb);
  });

  afterEach(() => {
    sqliteDb.close();
    if (fs.existsSync(sqlitePath)) fs.unlinkSync(sqlitePath);
  });

  it('returns different equity, cost basis and unrealized PnL for the same ledger in EUR and USD', async () => {
    const eur = await metrics.getKpis('EUR');
    const usd = await metrics.getKpis('USD');

    // The ledger is denominated in EUR throughout, so the EUR read is the identity:
    // no rate is applied and every figure is the native one.
    const nativeCost = new Decimal(HELD_UNIT_COST_EUR).times(HELD_QTY);
    const nativeEquity = new Decimal(HELD_PRICE_EUR).times(HELD_QTY);
    const nativeUnrealized = nativeEquity.minus(nativeCost);

    expectMoney(eur.totalCostBasis, nativeCost, 'EUR totalCostBasis');
    expectMoney(eur.totalEquity, nativeEquity, 'EUR totalEquity');
    expectMoney(eur.totalUnrealizedPnl, nativeUnrealized, 'EUR totalUnrealizedPnl');

    // A cost basis is a past figure and converts at its acquisition date.
    const expectedUsdCost = nativeCost.times(rateOn(ACQUIRED_ON));
    // Equity is a present figure and converts at the latest available rate.
    const expectedUsdEquity = nativeEquity.times(rateOn(LATEST_ON));
    // Unrealized PnL is the difference of those two, never a third conversion.
    const expectedUsdUnrealized = expectedUsdEquity.minus(expectedUsdCost);

    expectMoney(usd.totalCostBasis, expectedUsdCost, 'USD totalCostBasis');
    expectMoney(usd.totalEquity, expectedUsdEquity, 'USD totalEquity');
    expectMoney(usd.totalUnrealizedPnl, expectedUsdUnrealized, 'USD totalUnrealizedPnl');

    // And each of the three must genuinely move between the two reads — the failure
    // mode under test is the euro number wearing a dollar label.
    expect(
      new Decimal(usd.totalCostBasis).equals(eur.totalCostBasis),
      'totalCostBasis identical in EUR and USD',
    ).toBe(false);
    expect(
      new Decimal(usd.totalEquity).equals(eur.totalEquity),
      'totalEquity identical in EUR and USD',
    ).toBe(false);
    expect(
      new Decimal(usd.totalUnrealizedPnl).equals(eur.totalUnrealizedPnl),
      'totalUnrealizedPnl identical in EUR and USD',
    ).toBe(false);
  });

  it('converts realized PnL at the disposal date, and that alone is not enough', async () => {
    const eur = await metrics.getKpis('EUR');
    const usd = await metrics.getKpis('USD');

    const nativeGain = new Decimal(REALIZED_GAIN_EUR);
    expectMoney(eur.totalRealizedPnl, nativeGain, 'EUR totalRealizedPnl');
    expectMoney(
      usd.totalRealizedPnl,
      nativeGain.times(rateOn(DISPOSED_ON)),
      'USD totalRealizedPnl',
    );

    // Realized PnL converting on its own does not make the headline coherent: the
    // ROI it feeds is realized plus unrealized, and unrealized is still unconverted.
    const expectedUsdRoi = nativeGain
      .times(rateOn(DISPOSED_ON))
      .plus(
        new Decimal(HELD_PRICE_EUR)
          .times(HELD_QTY)
          .times(rateOn(LATEST_ON))
          .minus(new Decimal(HELD_UNIT_COST_EUR).times(HELD_QTY).times(rateOn(ACQUIRED_ON))),
      );
    expect(usd.totalRoiFiat, 'no totalRoiFiat returned').toBeDefined();
    expectMoney(usd.totalRoiFiat!, expectedUsdRoi, 'USD totalRoiFiat');
  });
});
