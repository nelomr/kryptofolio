/**
 * `v_portfolio_daily_valuation` — where the display currency actually has to be arithmetic.
 *
 * Three properties are asserted here, and each one is a separate way the current view gets the
 * currency wrong rather than three phrasings of one bug:
 *
 *   - the target currency has one home (the vault), so DuckDB must not keep a second copy of it;
 *   - a price whose currency is unknown is unconvertible, never assumed to already be the target;
 *   - a series about many dates converts at many rates, one per point.
 */

import { describe, it, expect, afterAll } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DuckDbAdapter } from '../../src/adapters/DuckDbAdapter.js';
import { applyMigrations } from '../helpers/migrations.js';

/**
 * Money is compared exactly, never through `Number`. `decimal.js` is not a dependency of this
 * package, so the comparisons below scale each figure to a fixed number of integer units and
 * compare as `bigint` — same guarantee, no dependency.
 */
const SCALE = 24;

function units(value: string): bigint {
  const [int, frac = ''] = value.trim().split('.');
  if (frac.length > SCALE) throw new Error(`figure exceeds ${SCALE} decimal places: ${value}`);
  const sign = int.startsWith('-') ? -1n : 1n;
  const digits = `${int.replace('-', '')}${frac.padEnd(SCALE, '0')}`;
  return sign * BigInt(digits);
}

/** Exact product of two decimal strings, expressed in the same fixed units. */
const product = (a: string, b: string): bigint => (units(a) * units(b)) / 10n ** BigInt(SCALE);

const ACCOUNT = 'acc-val';

interface TxSpec {
  readonly id: string;
  readonly tx_type: string;
  readonly timestamp: string;
  readonly asset_in_id?: string;
  readonly amount_in?: string;
  readonly total_fiat?: string;
  readonly fiat_currency?: string;
}

interface PriceSpec {
  readonly symbol: string;
  readonly close: string;
  readonly date: string;
  /** `null` models a price series whose denomination the provider never stated. */
  readonly currency: string | null;
}

interface RateSpec {
  readonly date: string;
  readonly pair: string;
  readonly rate: string;
}

interface ValuationRow {
  readonly date_str: string;
  readonly symbol: string;
  readonly running_balance: string;
  readonly close_price: string;
  readonly price_currency: string | null;
  readonly fx_rate: string | null;
  readonly daily_value: string | null;
}

interface CatalogRow {
  readonly database_name: string;
  readonly schema_name: string;
  readonly table_name: string;
}

interface ViewRow {
  readonly database_name: string;
  readonly view_name: string;
  readonly sql: string;
}

interface Setup {
  readonly duckDb: DuckDbAdapter;
  readonly sqlitePath: string;
}

const created: Setup[] = [];

async function setup(
  label: string,
  spec: {
    readonly txs?: readonly TxSpec[];
    readonly prices?: readonly PriceSpec[];
    readonly rates?: readonly RateSpec[];
  },
): Promise<DuckDbAdapter> {
  const sqlitePath = path.join(
    os.tmpdir(),
    `test_val_${label}_${process.pid}_${Date.now()}_${Math.trunc(performance.now() * 1000)}.db`,
  );
  const sqliteDb = new DatabaseSync(sqlitePath);
  sqliteDb.exec('PRAGMA foreign_keys = ON;');
  applyMigrations(sqliteDb);

  const asset = sqliteDb.prepare('INSERT INTO assets (id, symbol, is_fiat) VALUES (?, ?, ?)');
  for (const [id, isFiat] of [
    ['BTC', 0],
    ['EUR', 1],
    ['USD', 1],
  ] as const) {
    asset.run(id, id, isFiat);
  }
  sqliteDb
    .prepare('INSERT INTO accounts (id, name, type) VALUES (?, ?, ?)')
    .run(ACCOUNT, 'Kraken', 'exchange');

  const insert = sqliteDb.prepare(
    `INSERT INTO spot_transactions (
       id, id_hash, account_id, tx_type, asset_in_id, amount_in,
       total_fiat, fiat_currency, timestamp, status
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'COMPLETED')`,
  );
  for (const t of spec.txs ?? []) {
    insert.run(
      t.id,
      `hash-${t.id}`,
      ACCOUNT,
      t.tx_type,
      t.asset_in_id ?? null,
      t.amount_in ?? null,
      t.total_fiat ?? null,
      t.fiat_currency ?? 'EUR',
      t.timestamp,
    );
  }

  const rate = sqliteDb.prepare(
    'INSERT INTO exchange_rates (date, pair, rate, source) VALUES (?, ?, ?, ?)',
  );
  for (const r of spec.rates ?? []) {
    rate.run(r.date, r.pair, r.rate, 'ECB');
  }
  sqliteDb.close();

  process.env.MOCK_MODE = 'false';
  process.env.DUCKDB_PATH = ':memory:';
  const duckDb = new DuckDbAdapter();
  await duckDb.initialize(sqlitePath);

  for (const p of spec.prices ?? []) {
    await duckDb.execute(
      `INSERT INTO _price_seed (symbol, close, date, currency)
       VALUES ('${p.symbol}', ${p.close}, DATE '${p.date}', ${
         p.currency === null ? 'NULL' : `'${p.currency}'`
       })`,
    );
  }

  created.push({ duckDb, sqlitePath });
  return duckDb;
}

const valuationOn = (duckDb: DuckDbAdapter, dates: readonly string[]) =>
  duckDb.queryMany(
    `SELECT
       CAST(date AS VARCHAR) AS date_str,
       symbol,
       CAST(running_balance AS VARCHAR) AS running_balance,
       CAST(close_price AS VARCHAR) AS close_price,
       price_currency,
       CAST(fx_rate AS VARCHAR) AS fx_rate,
       CAST(daily_value AS VARCHAR) AS daily_value
     FROM v_portfolio_daily_valuation
     WHERE date IN (${dates.map((d) => `DATE '${d}'`).join(', ')})
     ORDER BY date`,
  ) as Promise<ValuationRow[]>;

afterAll(() => {
  for (const s of created) {
    if (fs.existsSync(s.sqlitePath)) fs.unlinkSync(s.sqlitePath);
  }
});

describe('the display currency has exactly one home', () => {
  it('keeps no DuckDB-local user_settings copy of it', async () => {
    const duckDb = await setup('nosettings', {});

    // The ATTACHed SQLite ledger legitimately carries a `user_settings` table; the defect is a
    // *second* one inside DuckDB's own catalog. Both are read here so the assertion is known to
    // be distinguishing them rather than finding nothing at all.
    const all = (await duckDb.queryMany(
      `SELECT database_name, schema_name, table_name
       FROM duckdb_tables() WHERE table_name = 'user_settings'`,
    )) as CatalogRow[];

    expect(all.map((r) => r.database_name)).toContain('ledger');

    const duckDbLocal = all.filter((r) => r.database_name !== 'ledger');
    expect(duckDbLocal).toEqual([]);
  });

  it('resolves no view target currency from anything but a bound parameter', async () => {
    const duckDb = await setup('noviewref', {});

    const views = (await duckDb.queryMany(
      `SELECT database_name, view_name, sql FROM duckdb_views()
       WHERE database_name NOT IN ('system', 'temp')`,
    )) as ViewRow[];

    expect(views.length).toBeGreaterThan(0);

    const offenders = views
      .filter((v) => /user_settings/i.test(v.sql))
      .map((v) => `${v.database_name}.${v.view_name}`);
    expect(offenders).toEqual([]);
  });
});

describe('a price whose currency is unknown', () => {
  const NULL_CURRENCY = {
    txs: [
      {
        id: 'tx-buy-null-ccy',
        tx_type: 'BUY',
        timestamp: '2024-03-01T10:00:00Z',
        asset_in_id: 'BTC',
        amount_in: '10',
        total_fiat: '1000',
      },
    ],
    prices: [{ symbol: 'BTC', close: '100.000000000', date: '2024-03-01', currency: null }],
    rates: [{ date: '2024-03-01', pair: 'USD/EUR', rate: '0.800000' }],
  } as const;

  it('is not reported as if it were denominated in the target currency', async () => {
    const duckDb = await setup('nullccy_label', NULL_CURRENCY);

    const [row] = await valuationOn(duckDb, ['2024-03-01']);
    expect(row).toBeDefined();
    expect(row!.symbol).toBe('BTC');

    // An unstated currency is unknown, not "whatever we happen to be converting into".
    expect(row!.price_currency).toBeNull();
  });

  it('contributes as unconvertible rather than at an implied factor of one', async () => {
    const duckDb = await setup('nullccy_value', NULL_CURRENCY);

    const [row] = await valuationOn(duckDb, ['2024-03-01']);
    expect(row).toBeDefined();

    // 10 × 100 — the figure produced only by assuming the price was already in the target.
    const naive = product(row!.running_balance, row!.close_price);
    const actual = row!.daily_value === null ? null : units(row!.daily_value);

    expect(
      actual === null || actual !== naive,
      `daily_value ${String(row!.daily_value)} equals balance × price, i.e. the NULL-currency ` +
        `price was valued as if it were already in the target currency`,
    ).toBe(true);
  });
});

describe('a missing price and a missing rate are two different conditions', () => {
  interface SignalRow {
    readonly symbol: string;
    readonly unpriced: boolean;
    readonly unconvertible: boolean;
    readonly daily_value: string | null;
  }

  const signalsOn = (duckDb: DuckDbAdapter, date: string) =>
    duckDb.queryMany(
      `SELECT symbol, unpriced, unconvertible, CAST(daily_value AS VARCHAR) AS daily_value
       FROM v_portfolio_daily_valuation
       WHERE date = DATE '${date}'
       ORDER BY symbol`,
    ) as Promise<SignalRow[]>;

  it('reports an asset with no price series as unpriced, not as a missing rate', async () => {
    const duckDb = await setup('unpriced_only', {
      txs: [
        {
          id: 'tx-buy-unpriced',
          tx_type: 'BUY',
          timestamp: '2024-03-01T10:00:00Z',
          asset_in_id: 'BTC',
          amount_in: '10',
          total_fiat: '1000',
        },
      ],
      // No price row at all, while the FX ledger covers every pair the view could need.
      rates: [{ date: '2024-03-01', pair: 'USD/EUR', rate: '0.800000' }],
    });

    const [row] = await signalsOn(duckDb, '2024-03-01');
    expect(row).toBeDefined();
    expect(row!.symbol).toBe('BTC');

    expect(row!.unpriced).toBe(true);
    expect(
      row!.unconvertible,
      'an asset with no price series was reported as an FX coverage failure, which sends a ' +
        'reader to seed the rate ledger for a hole only the price series can fill',
    ).toBe(false);

    // Separating the signals must not put the figure back into the total at a factor of one.
    expect(row!.daily_value).toBeNull();
  });

  it('reports a priced asset the FX ledger cannot cover as a missing rate, not as unpriced', async () => {
    const duckDb = await setup('rate_only', {
      txs: [
        {
          id: 'tx-buy-rate',
          tx_type: 'BUY',
          timestamp: '2024-03-01T10:00:00Z',
          asset_in_id: 'BTC',
          amount_in: '10',
          total_fiat: '1000',
        },
      ],
      prices: [{ symbol: 'BTC', close: '100.000000000', date: '2024-03-01', currency: 'USD' }],
      // Every rate is later than the date under test, so nothing resolves backward from it.
      rates: [{ date: '2025-06-01', pair: 'USD/EUR', rate: '0.800000' }],
    });

    const [row] = await signalsOn(duckDb, '2024-03-01');
    expect(row).toBeDefined();

    expect(row!.unconvertible).toBe(true);
    expect(row!.unpriced, 'a priced asset was reported as having no price series').toBe(false);
    expect(row!.daily_value).toBeNull();
  });
});

describe('the daily valuation series', () => {
  const dates = ['2024-03-01', '2024-03-02', '2024-03-03'] as const;

  const build = (label: string) =>
    setup(label, {
      txs: [
        {
          id: 'tx-buy-series',
          tx_type: 'BUY',
          timestamp: '2024-03-01T10:00:00Z',
          asset_in_id: 'BTC',
          amount_in: '10',
          total_fiat: '1000',
        },
      ],
      // Constant balance, constant price: every movement in the series must come from FX.
      prices: [{ symbol: 'BTC', close: '100.000000000', date: '2024-03-01', currency: 'USD' }],
      rates: [
        { date: '2024-03-01', pair: 'USD/EUR', rate: '0.800000' },
        { date: '2024-03-03', pair: 'USD/EUR', rate: '0.500000' },
      ],
    });

  it('converts each point at its own date rate rather than one uniform rate', async () => {
    const duckDb = await build('series_rate');

    const rows = await valuationOn(duckDb, dates);
    expect(rows.map((r) => r.date_str.slice(0, 10))).toEqual([...dates]);

    const values = rows.map((r) => units(r.daily_value ?? '0'));
    const [d1, , d3] = values as [bigint, bigint, bigint];

    expect(d1).not.toBe(0n);

    // d3 / d1 must be 0.5 / 0.8 = 5/8, asserted by cross-multiplication so no division is
    // performed on a monetary figure.
    expect(
      d3 * 8n === d1 * 5n,
      `daily values ${values.join(', ')} — balance and price are constant, so anything other ` +
        `than the 5:8 ratio of the two rates means the points did not convert at their own dates`,
    ).toBe(true);
  });

  it('is not a single rate scaling a constant series', async () => {
    const duckDb = await build('series_uniform');

    const rows = await valuationOn(duckDb, dates);
    const values = rows.map((r) => units(r.daily_value ?? '0'));

    const distinct = new Set(values.map((v) => v.toString()));
    expect(
      distinct.size > 1,
      `every point valued at ${[...distinct].join(', ')} — a series scaled by one rate`,
    ).toBe(true);

    // Each point must also state the rate that its own date resolved to.
    const rates = rows.map((r) => r.fx_rate);
    expect(new Set(rates).size).toBeGreaterThan(1);
  });
});
