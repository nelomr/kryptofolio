/**
 * A display currency is a conversion, not a label.
 *
 * `getHoldingsSnapshot` and `getKpis` both accept a target currency and neither
 * multiplies anything by a rate: the holdings query projects `$1 AS currency`
 * beside an unconverted `unit_cost_fiat`, and the KPI queries take the argument
 * without reading it at all. A euro figure requested in dollars therefore comes
 * back as the euro number wearing a dollar label — the most expensive kind of
 * wrong, because it is the right order of magnitude.
 *
 * The rate must also come from the figure's own date. One uniform rate applied
 * to the whole portfolio is the shape this suite is built to catch, so several
 * assertions below deliberately compare against every single-rate answer rather
 * than only against the unconverted one.
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

const MIGRATIONS = ['002_ledger_schema', '003_currency_schema', '004_fifo_traceability'].map((name) =>
  fs.readFileSync(
    path.resolve(__dirname, `../../../../../../../packages/database/migrations/sqlite/${name}.sql`),
    'utf-8',
  ),
);

/**
 * The ECB — and therefore `exchange_rates` — publishes EUR-based quotes only, so the
 * ledger holds `USD/EUR` and `v_fx_daily` synthesises `EUR/USD` by inversion, bounded
 * at twelve decimals. Every rate below is chosen so its reciprocal is exact at that
 * bound: a fixture whose expected value depends on the twelfth decimal of an inversion
 * would fail for a rounding reason rather than for the conversion reason under test.
 */
const RATES: ReadonlyArray<readonly [date: string, usdPerEurQuote: string, eurUsd: string]> = [
  ['2024-01-15', '0.8', '1.25'], // Monday
  ['2024-03-08', '0.5', '2'], // Friday, before the weekend acquisition
  ['2024-03-14', '0.4', '2.5'], // the disposal date
  ['2024-06-10', '0.625', '1.6'], // Monday
  ['2025-12-01', '0.25', '4'], // the latest rate in the ledger
];

const rateOn = (date: string): Decimal =>
  new Decimal(RATES.find(([d]) => d === date)![2]);

const LATEST_EUR_USD = rateOn('2025-12-01');

/** A figure with more decimals than any rate could survive a round trip through. */
const EXACT_USD_BASIS = '1234.567890123456';

describe('display currency conversion', () => {
  let sqlitePath: string;
  let sqliteDb: DatabaseSync;
  let duckDb: DuckDbAdapter;
  let analytics: DuckDbPortfolioAnalyticsAdapter;

  beforeEach(async () => {
    sqlitePath = path.join(
      os.tmpdir(),
      `test_displayfx_${process.pid}_${Date.now()}_${Math.trunc(performance.now() * 1000)}.db`,
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
       VALUES (?, ?, 'acc-1', 'BUY', ?, ?, ?, ?, ?, ?, 'COMPLETED')`,
    );
    const lot = sqliteDb.prepare(
      `INSERT INTO tax_lots (id, spot_transaction_id, asset_id, account_id, original_qty, remaining_qty,
         unit_cost_fiat, total_cost_fiat, fiat_currency, acquisition_timestamp, exchange_location, status)
       VALUES (?, ?, ?, 'acc-1', ?, ?, ?, ?, ?, ?, 'Kraken', 'OPEN')`,
    );

    const seedLot = (
      symbol: string,
      suffix: string,
      qty: string,
      unitCost: string,
      currency: string,
      timestamp: string,
    ): void => {
      const id = `${symbol}-${suffix}`;
      const basis = new Decimal(unitCost).times(qty).toFixed();
      buy.run(`tx-${id}`, `h-${id}`, symbol, qty, basis, unitCost, currency, timestamp);
      lot.run(`lot-${id}`, `tx-${id}`, symbol, qty, qty, unitCost, basis, currency, timestamp);
    };

    for (const symbol of ['USDX', 'EURSINGLE', 'EURWEEKEND', 'EURTWO', 'EURPNL', 'SELLA']) {
      asset.run(symbol, symbol);
    }

    // Stored in the display currency the identity test asks for.
    seedLot('USDX', 'a', '1', EXACT_USD_BASIS, 'USD', '2024-01-15T10:00:00Z');
    // 1000 EUR acquired at EUR/USD 1.25.
    seedLot('EURSINGLE', 'a', '1', '1000', 'EUR', '2024-01-15T10:00:00Z');
    // A Sunday, for which no rate is published; the Friday 2024-03-08 rate (2) applies.
    seedLot('EURWEEKEND', 'a', '1', '1000', 'EUR', '2024-03-10T10:00:00Z');
    // Two lots of one asset, acquired at 1.25 and at 1.6.
    seedLot('EURTWO', 'a', '1', '1000', 'EUR', '2024-01-15T10:00:00Z');
    seedLot('EURTWO', 'b', '1', '1000', 'EUR', '2024-06-10T10:00:00Z');
    // Basis converts at acquisition (1.25); current value converts at the latest rate (4).
    seedLot('EURPNL', 'a', '1', '1000', 'EUR', '2024-01-15T10:00:00Z');

    // A buy and a later disposal, so a realized gain exists with a date of its own.
    seedLot('SELLA', 'a', '1', '1000', 'EUR', '2024-01-15T10:00:00Z');
    sqliteDb
      .prepare(
        `INSERT INTO spot_transactions (id, id_hash, account_id, tx_type, asset_out_id, amount_out,
           total_fiat, price_fiat, fiat_currency, timestamp, status)
         VALUES ('tx-SELLA-sell', 'h-SELLA-sell', 'acc-1', 'SELL', 'SELLA', '1',
                 '1500', '1500', 'EUR', '2024-03-14T10:00:00Z', 'COMPLETED')`,
      )
      .run();

    process.env.MOCK_MODE = 'false';
    process.env.DUCKDB_PATH = ':memory:';
    process.env.PARQUET_DATA_PATH = fs.mkdtempSync(path.join(os.tmpdir(), 'prices-'));
    duckDb = new DuckDbAdapter();
    await duckDb.initialize(sqlitePath);

    // A live price for the unrealized-PnL reconciliation, denominated in EUR like the lot.
    await duckDb.execute(`
      INSERT INTO _price_seed (date, asset_id, symbol, open, high, low, close, volume, currency, year)
      VALUES (DATE '2025-12-01', 'EURPNL', 'EURPNL', 1000, 1000, 1000, 1000, 0, 'EUR', 2025);
    `);

    analytics = new DuckDbPortfolioAnalyticsAdapter(duckDb);
  });

  afterEach(() => {
    sqliteDb.close();
    if (fs.existsSync(sqlitePath)) fs.unlinkSync(sqlitePath);
  });

  const basisOf = async (symbol: string, currency: string): Promise<Decimal> => {
    const holdings = await analytics.getHoldingsSnapshot('acc-1', currency);
    const row = holdings.find((h) => h.symbol === symbol);
    expect(row, `no holding returned for ${symbol}`).toBeDefined();
    return new Decimal(row!.totalCostFiat);
  };

  it('returns a dollar figure displayed in dollars exactly, bit for bit', async () => {
    // The identity arm: a conversion to the currency you are already in is the
    // identity function, not a multiplication by a rate of 1 and not a round trip
    // through EUR — `EUR/USD` is an inversion bounded at twelve decimals, and this
    // figure has fifteen significant decimals precisely so a round trip would show.
    const basis = await basisOf('USDX', 'USD');

    expect(basis.toFixed()).toBe(EXACT_USD_BASIS);
  });

  it("converts a euro lot at its own acquisition date's rate", async () => {
    const basis = await basisOf('EURSINGLE', 'USD');

    // 1000 EUR × 1.25 (2024-01-15) = 1250 USD.
    const expected = new Decimal('1000').times(rateOn('2024-01-15'));
    expect(basis.toFixed()).toBe(expected.toFixed());
    // And the unconverted euro figure is the exact failure this asserts against.
    expect(basis.equals(new Decimal('1000'))).toBe(false);
  });

  it('converts two lots of one asset at two different rates', async () => {
    const basis = await basisOf('EURTWO', 'USD');

    // 1000 × 1.25 + 1000 × 1.6 = 2850.
    const expected = new Decimal('1000')
      .times(rateOn('2024-01-15'))
      .plus(new Decimal('1000').times(rateOn('2024-06-10')));
    expect(basis.toFixed()).toBe(expected.toFixed());

    // The assertion that rules out one uniform rate applied to everything: the
    // aggregate must not be the euro aggregate scaled by any single rate in the
    // ledger, including the latest one and the reciprocal identity.
    const nativeAggregate = new Decimal('2000');
    for (const [, , eurUsd] of RATES) {
      expect(
        basis.equals(nativeAggregate.times(eurUsd)),
        `converted basis equals the native aggregate scaled by the single rate ${eurUsd}`,
      ).toBe(false);
    }
    expect(basis.equals(nativeAggregate)).toBe(false);
  });

  it('resolves a Sunday acquisition to the preceding published Friday rate', async () => {
    const basis = await basisOf('EURWEEKEND', 'USD');

    // Acquired 2024-03-10, a Sunday with no published row; 2024-03-08 holds 2.
    const expected = new Decimal('1000').times(rateOn('2024-03-08'));
    expect(basis.toFixed()).toBe(expected.toFixed());
    // Resolution is backward-looking: the next published row (2024-03-14, 2.5) must
    // not be reached forward for.
    expect(basis.equals(new Decimal('1000').times(rateOn('2024-03-14')))).toBe(false);
  });

  it("converts a realized gain at its disposal date's rate, not the latest", async () => {
    // `getKpis` accepts a target currency today and reads it nowhere; the realized
    // PnL it returns is the raw sum of `gain_loss_fiat`, in whatever currency the
    // disposals happened to be denominated in.
    const kpis = await new DuckDbMetricsAdapter(duckDb).getKpis('USD');
    const realized = new Decimal(kpis.totalRealizedPnl);

    // 1500 − 1000 = 500 EUR realized on 2024-03-14, where EUR/USD is 2.5.
    const nativeGain = new Decimal('500');
    const expected = nativeGain.times(rateOn('2024-03-14'));

    expect(realized.toFixed()).toBe(expected.toFixed());
    expect(realized.equals(nativeGain), 'realized gain returned unconverted').toBe(false);
    expect(
      realized.equals(nativeGain.times(LATEST_EUR_USD)),
      'realized gain converted at the latest rate rather than the disposal date rate',
    ).toBe(false);
  });

  it('reconciles unrealized PnL against operands converted at different dates', async () => {
    const holdings = await analytics.getHoldingsSnapshot('acc-1', 'USD');
    const row = holdings.find((h) => h.symbol === 'EURPNL');
    expect(row).toBeDefined();
    expect(row!.currentValueFiat, 'no live price resolved for EURPNL').toBeDefined();

    const basis = new Decimal(row!.totalCostFiat);
    const value = new Decimal(row!.currentValueFiat!);
    const pnl = new Decimal(row!.unrealizedPnlFiat!);

    // The basis is a past figure, converted at 2024-01-15 (1.25); the value is a
    // present figure, converted at the latest rate (4). The two operands are
    // therefore converted at different dates, which is the case where a PnL
    // converted as a figure in its own right stops reconciling.
    expect(basis.toFixed()).toBe(new Decimal('1000').times(rateOn('2024-01-15')).toFixed());
    expect(value.toFixed()).toBe(new Decimal('1000').times(LATEST_EUR_USD).toFixed());
    expect(pnl.equals(value.minus(basis))).toBe(true);
    // A PnL converted as a figure of its own would be the EUR PnL times one rate.
    expect(pnl.equals(new Decimal('0').times(LATEST_EUR_USD))).toBe(false);
  });
});
