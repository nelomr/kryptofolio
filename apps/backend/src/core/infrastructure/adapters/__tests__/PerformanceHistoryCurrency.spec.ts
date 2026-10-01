import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import Decimal from 'decimal.js';
import { DuckDbAdapter, applyMigrations } from '@kryptofolio/database';
import { DuckDbMetricsAdapter } from '../DuckDbMetricsAdapter.js';
import type { PerformanceHistoryPoint } from '../../../domain/ports/IMetricsPort.js';

/**
 * `exchange_rates` is ECB-quoted: it holds `USD/EUR` and `v_fx_daily` synthesises `EUR/USD` by
 * inverting at twelve decimals. Every quote below has an exact reciprocal at that bound.
 */
const FRIDAY = '2024-01-19';
const SUNDAY = '2024-01-21';
const MONDAY = '2024-01-22';
const BEFORE_FIRST_RATE = '2024-01-18';
const RATES: ReadonlyArray<readonly [date: string, usdPerEurQuote: string, eurUsd: string]> = [
  [FRIDAY, '0.8', '1.25'],
  [MONDAY, '0.5', '2'],
];

const HELD_QTY = '2';
const OLD_PRICE_EUR = '100';
const NEW_PRICE_EUR = '200';
const REPRICED_ON = '2024-01-17';
const HISTORY_DAYS = 5000;

const eurValueOn = (date: string): Decimal =>
  new Decimal(HELD_QTY).times(date >= REPRICED_ON ? NEW_PRICE_EUR : OLD_PRICE_EUR);

describe('Performance history in the display currency', () => {
  let sqlitePath: string;
  let sqliteDb: DatabaseSync;
  let duckDb: DuckDbAdapter;
  let metrics: DuckDbMetricsAdapter;

  const seedRates = async (rates = RATES): Promise<void> => {
    const rate = sqliteDb.prepare(
      "INSERT INTO exchange_rates (date, pair, rate, source) VALUES (?, 'USD/EUR', ?, 'ECB')",
    );
    for (const [date, quote] of rates) rate.run(date, quote);
    await duckDb.rebuildDerivedChain();
  };

  const pointOn = (series: PerformanceHistoryPoint[], date: string): PerformanceHistoryPoint => {
    const point = series.find((p) => p.date === date);
    if (point === undefined) throw new Error(`no point on ${date}`);
    return point;
  };

  beforeEach(async () => {
    sqlitePath = path.join(
      os.tmpdir(),
      `test_perfccy_${process.pid}_${Date.now()}_${Math.trunc(performance.now() * 1000)}.db`,
    );
    sqliteDb = new DatabaseSync(sqlitePath);
    sqliteDb.exec('PRAGMA foreign_keys = ON;');
    applyMigrations(sqliteDb);

    sqliteDb
      .prepare("INSERT INTO accounts (id, name, type) VALUES ('acc-1', 'Kraken', 'exchange')")
      .run();
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
    const seedLot = (symbol: string, timestamp: string): void => {
      asset.run(symbol, symbol);
      const basis = new Decimal(OLD_PRICE_EUR).times(HELD_QTY).toFixed();
      buy.run(`tx-${symbol}`, `h-${symbol}`, symbol, HELD_QTY, basis, OLD_PRICE_EUR, timestamp);
      lot.run(`lot-${symbol}`, `tx-${symbol}`, symbol, HELD_QTY, HELD_QTY, OLD_PRICE_EUR, basis, timestamp);
    };
    seedLot('HELD', '2024-01-15T10:00:00Z');
    seedLot('UNPRICED', '2024-01-16T10:00:00Z');

    process.env.MOCK_MODE = 'false';
    process.env.DUCKDB_PATH = ':memory:';
    process.env.PARQUET_DATA_PATH = fs.mkdtempSync(path.join(os.tmpdir(), 'prices-'));
    duckDb = new DuckDbAdapter();
    await duckDb.initialize(sqlitePath);
    await duckDb.rebuildDerivedChain();

    await duckDb.execute(`
      INSERT INTO _price_seed (date, asset_id, symbol, open, high, low, close, volume, currency, year)
      VALUES (DATE '2024-01-15', 'HELD', 'HELD', ${OLD_PRICE_EUR}, ${OLD_PRICE_EUR}, ${OLD_PRICE_EUR}, ${OLD_PRICE_EUR}, 0, 'EUR', 2024),
             (DATE '${REPRICED_ON}', 'HELD', 'HELD', ${NEW_PRICE_EUR}, ${NEW_PRICE_EUR}, ${NEW_PRICE_EUR}, ${NEW_PRICE_EUR}, 0, 'EUR', 2024);
    `);
    await duckDb.rebuildDerivedChain();

    metrics = new DuckDbMetricsAdapter(duckDb);
  });

  afterEach(() => {
    sqliteDb.close();
    if (fs.existsSync(sqlitePath)) fs.unlinkSync(sqlitePath);
  });

  it('converts each point at its own date rather than at one uniform rate', async () => {
    await seedRates();
    const usd = await metrics.getPerformanceHistory(HISTORY_DAYS, 'USD');

    expect(pointOn(usd, FRIDAY).portfolioValue).toBe(eurValueOn(FRIDAY).times('1.25').toFixed(2));
    expect(pointOn(usd, MONDAY).portfolioValue).toBe(eurValueOn(MONDAY).times('2').toFixed(2));
  });

  it('resolves the preceding published rate for a date without one', async () => {
    await seedRates();
    const usd = await metrics.getPerformanceHistory(HISTORY_DAYS, 'USD');

    expect(pointOn(usd, SUNDAY).portfolioValue).toBe(eurValueOn(SUNDAY).times('1.25').toFixed(2));
  });

  it('returns the canonical EUR value unchanged for EUR, with no FX rows stored', async () => {
    const eur = await metrics.getPerformanceHistory(HISTORY_DAYS, 'EUR');

    expect(pointOn(eur, BEFORE_FIRST_RATE).portfolioValue).toBe(
      eurValueOn(BEFORE_FIRST_RATE).toFixed(2),
    );
    expect(pointOn(eur, MONDAY).portfolioValue).toBe(eurValueOn(MONDAY).toFixed(2));
  });

  it('defaults to EUR when no currency is given', async () => {
    const implicit = await metrics.getPerformanceHistory(HISTORY_DAYS);
    const explicit = await metrics.getPerformanceHistory(HISTORY_DAYS, 'EUR');

    expect(implicit).toEqual(explicit);
  });

  it('reports a date before the first stored rate as null and still returns the point', async () => {
    await seedRates();
    const usd = await metrics.getPerformanceHistory(HISTORY_DAYS, 'USD');
    const point = pointOn(usd, BEFORE_FIRST_RATE);

    expect(point.portfolioValue).toBeNull();
    expect(point.date).toBe(BEFORE_FIRST_RATE);
  });

  it('reports every point as null for a currency with no stored rates', async () => {
    await seedRates();
    const jpy = await metrics.getPerformanceHistory(HISTORY_DAYS, 'JPY');

    expect(jpy.length).toBeGreaterThan(0);
    expect(jpy.every((p) => p.portfolioValue === null)).toBe(true);
  });

  it('keeps drawdownPct identical across display currencies', async () => {
    await seedRates();
    const eur = await metrics.getPerformanceHistory(HISTORY_DAYS, 'EUR');
    const usd = await metrics.getPerformanceHistory(HISTORY_DAYS, 'USD');

    expect(usd.map((p) => p.drawdownPct)).toEqual(eur.map((p) => p.drawdownPct));
    expect(usd.map((p) => p.date)).toEqual(eur.map((p) => p.date));
  });

  it('retains no currency between calls', async () => {
    await seedRates();
    await metrics.getPerformanceHistory(HISTORY_DAYS, 'USD');
    const eur = await metrics.getPerformanceHistory(HISTORY_DAYS, 'EUR');

    expect(pointOn(eur, MONDAY).portfolioValue).toBe(eurValueOn(MONDAY).toFixed(2));
  });

  it('sums a partially priced EUR day instead of nulling it', async () => {
    const eur = await metrics.getPerformanceHistory(HISTORY_DAYS, 'EUR');
    const point = pointOn(eur, '2024-01-16');

    expect(point.portfolioValue).toBe(eurValueOn('2024-01-16').toFixed(2));
  });

  it('reports an EUR day on which no held asset is priced as null instead of throwing', async () => {
    await duckDb.execute('DELETE FROM _price_seed');
    await duckDb.rebuildDerivedChain();

    const eur = await metrics.getPerformanceHistory(HISTORY_DAYS, 'EUR');

    expect(eur.length).toBeGreaterThan(0);
    expect(eur.every((p) => p.portfolioValue === null)).toBe(true);
  });

  it('equals the daily valuation series converted at the same date rate', async () => {
    await seedRates();
    const usd = await metrics.getPerformanceHistory(HISTORY_DAYS, 'USD');
    const valuation = await duckDb.queryMany<{ date: string; total: string }>(
      `SELECT CAST(date AS VARCHAR) AS date, CAST(SUM(daily_value) AS VARCHAR) AS total
       FROM v_portfolio_daily_valuation GROUP BY date`,
      [],
    );
    const rateFor = (date: string): Decimal | null => {
      const applicable = RATES.filter(([d]) => d <= date);
      const last = applicable[applicable.length - 1];
      return last === undefined ? null : new Decimal(last[2]);
    };

    const convertible = valuation.filter((v) => rateFor(v.date) !== null);
    expect(convertible.length).toBeGreaterThan(0);
    for (const v of convertible) {
      const expected = new Decimal(v.total).times(rateFor(v.date)!).toFixed(2);
      expect(pointOn(usd, v.date).portfolioValue, v.date).toBe(expected);
    }
  });
});
