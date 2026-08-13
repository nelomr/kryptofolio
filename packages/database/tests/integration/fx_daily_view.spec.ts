/**
 * `v_fx_daily` — the single FX resolution primitive.
 *
 * This resolution (direct pair, reciprocal fallback, direct always preferred) was
 * buried inside `v_flattened_fifo_events` as two CTEs. Promoting it to a top-level
 * view is what lets the display-currency conversion reuse it instead of becoming a
 * third independent way to resolve a rate.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DuckDbAdapter } from '../../src/adapters/DuckDbAdapter.js';
import { applyMigrations } from '../helpers/migrations.js';

interface FxRow {
  readonly rate_date: string | Date;
  readonly pair: string;
  readonly rate: string;
  readonly is_reciprocal: number | bigint;
}

let duckDb: DuckDbAdapter;
let sqlitePath: string;

beforeAll(async () => {
  sqlitePath = path.join(
    os.tmpdir(),
    `test_fxdaily_${process.pid}_${Date.now()}_${Math.trunc(performance.now() * 1000)}.db`,
  );
  const sqliteDb = new DatabaseSync(sqlitePath);
  sqliteDb.exec('PRAGMA foreign_keys = ON;');
  applyMigrations(sqliteDb);

  const rate = sqliteDb.prepare(
    'INSERT INTO exchange_rates (date, pair, rate, source) VALUES (?, ?, ?, ?)',
  );
  // Friday; the following Saturday and Sunday are deliberately absent, as the ECB
  // does not publish then.
  rate.run('2023-06-16', 'USD/EUR', '0.916000', 'ECB');
  rate.run('2023-06-19', 'USD/EUR', '0.914500', 'ECB');
  // A date carrying both directions, so "direct wins over reciprocal" is testable
  // rather than merely intended.
  rate.run('2023-06-20', 'USD/EUR', '0.913000', 'ECB');
  rate.run('2023-06-20', 'EUR/USD', '1.095000', 'ECB');
  sqliteDb.close();

  process.env.MOCK_MODE = 'false';
  process.env.DUCKDB_PATH = ':memory:';
  duckDb = new DuckDbAdapter();
  await duckDb.initialize(sqlitePath);
});

afterAll(() => {
  if (fs.existsSync(sqlitePath)) fs.unlinkSync(sqlitePath);
});

const onDate = (pair: string, date: string) =>
  duckDb.queryMany(
    `SELECT rate_date, pair, rate, is_reciprocal FROM v_fx_daily
     WHERE pair = '${pair}' AND rate_date = DATE '${date}'`,
  ) as Promise<FxRow[]>;

/** The backward-looking resolution every consumer of this view performs. */
const asOf = (pair: string, date: string) =>
  duckDb.queryMany(
    `SELECT rate_date, pair, rate, is_reciprocal FROM v_fx_daily
     WHERE pair = '${pair}' AND rate_date <= DATE '${date}'
     ORDER BY rate_date DESC LIMIT 1`,
  ) as Promise<FxRow[]>;

describe('v_fx_daily', () => {
  it('resolves a direct pair', async () => {
    const rows = await onDate('USD/EUR', '2023-06-16');
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].rate)).toBeCloseTo(0.916, 12);
    expect(Number(rows[0].is_reciprocal)).toBe(0);
  });

  it('resolves a reciprocal pair the ledger never stored', async () => {
    const rows = await onDate('EUR/USD', '2023-06-16');
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].rate)).toBeCloseTo(1 / 0.916, 9);
    expect(Number(rows[0].is_reciprocal)).toBe(1);
  });

  it('prefers the direct rate where both directions exist', async () => {
    const rows = await onDate('EUR/USD', '2023-06-20');
    expect(rows).toHaveLength(1);
    // The published 1.095000, not the inversion of 0.913000 (= 1.09529...).
    expect(Number(rows[0].rate)).toBeCloseTo(1.095, 12);
    expect(Number(rows[0].is_reciprocal)).toBe(0);
  });

  it('emits exactly one row per (date, pair)', async () => {
    const rows = (await duckDb.queryMany(
      `SELECT rate_date, pair, COUNT(*) AS n FROM v_fx_daily
       GROUP BY ALL HAVING COUNT(*) > 1`,
    )) as readonly unknown[];
    expect(rows).toEqual([]);
  });

  it('returns nothing for an unknown pair', async () => {
    expect(await onDate('GBP/EUR', '2023-06-16')).toEqual([]);
    expect(await asOf('GBP/EUR', '2023-06-20')).toEqual([]);
  });

  it('resolves a Sunday backward to the preceding Friday', async () => {
    const rows = await asOf('USD/EUR', '2023-06-18');
    expect(rows).toHaveLength(1);
    expect(String(rows[0].rate_date).slice(0, 10)).toBe('2023-06-16');
  });

  it('never returns a rate dated after the target date', async () => {
    // 2023-06-17 lies between the Friday and the Monday; the Monday must not win.
    const rows = await asOf('USD/EUR', '2023-06-17');
    expect(rows).toHaveLength(1);
    expect(String(rows[0].rate_date).slice(0, 10)).toBe('2023-06-16');

    const beforeEverything = await asOf('USD/EUR', '2023-06-15');
    expect(beforeEverything).toEqual([]);
  });
});
