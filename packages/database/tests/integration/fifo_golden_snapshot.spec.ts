/**
 * A regression fence for the FIFO view graph.
 *
 * "The suite still passes" and "the FIFO output is byte-identical" are different
 * claims. The display-currency change refactors the FX resolution CTEs out into
 * their own view and moves several money expressions off `DOUBLE`; both are meant
 * to leave the *non-converted* FIFO output untouched. This snapshot is what makes
 * that checkable rather than asserted — any drift shows up here as a diff over the
 * three views the tax report is built from, not as a silently different number.
 *
 * A changed digit is a stop condition until it is accounted for.
 */

import { describe, it, expect, afterAll } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DuckDbAdapter } from '../../src/adapters/DuckDbAdapter.js';
import { applyMigrations } from '../helpers/migrations.js';

const ACCOUNT = 'acc-golden';

/** Row shapes are unknown to this suite by design — it snapshots whatever the views emit. */
type ViewRow = Record<string, unknown>;

interface Fixture {
  readonly duckDb: DuckDbAdapter;
  readonly cleanup: () => void;
}

let fixture: Fixture | undefined;

async function buildFixture(): Promise<Fixture> {
  const sqlitePath = path.join(
    os.tmpdir(),
    `test_golden_${process.pid}_${Date.now()}_${Math.trunc(performance.now() * 1000)}.db`,
  );
  const sqliteDb = new DatabaseSync(sqlitePath);
  sqliteDb.exec('PRAGMA foreign_keys = ON;');
  applyMigrations(sqliteDb);

  const asset = sqliteDb.prepare('INSERT INTO assets (id, symbol, is_fiat) VALUES (?, ?, ?)');
  for (const [id, isFiat] of [
    ['BTC', 0],
    ['ETH', 0],
    ['EUR', 1],
    ['USD', 1],
  ] as const) {
    asset.run(id, id, isFiat);
  }
  sqliteDb
    .prepare('INSERT INTO accounts (id, name, type) VALUES (?, ?, ?)')
    .run(ACCOUNT, 'Kraken', 'exchange');

  const tx = sqliteDb.prepare(
    `INSERT INTO spot_transactions (
       id, id_hash, account_id, tx_type, asset_in_id, amount_in, asset_out_id, amount_out,
       fee_asset_id, fee_amount, total_fiat, price_fiat, fiat_currency, timestamp, status
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'COMPLETED')`,
  );

  // A EUR-quoted buy: the plain path, no FX involved at all.
  tx.run('tx-buy-eur', 'h-buy-eur', ACCOUNT, 'BUY', 'BTC', '1.5', 'EUR', '30000.00',
    'EUR', '15.00', '30000.00', '20000.00', 'EUR', '2023-02-01T10:00:00Z');

  // A reward with no stated fiat total: valued from the USD price series and
  // converted to the transaction's own EUR reporting currency. Exercises fx_resolved.
  tx.run('tx-reward-usd', 'h-reward-usd', ACCOUNT, 'STAKING', 'ETH', '10', null, null,
    null, null, null, null, 'EUR', '2023-03-06T09:00:00Z');

  // The same shape on a later date, resolving backward to the newest rate on or
  // before it — the carry-forward arm.
  tx.run('tx-reward-norate', 'h-reward-norate', ACCOUNT, 'STAKING', 'ETH', '4', null, null,
    null, null, null, null, 'EUR', '2023-04-11T09:00:00Z');

  // Older than every stored rate: nothing resolves backward, so this is the
  // MISSING_FX_RATE arm and the lot this change must report as UNCONVERTIBLE.
  tx.run('tx-reward-preledger', 'h-reward-preledger', ACCOUNT, 'STAKING', 'ETH', '3', null, null,
    null, null, null, null, 'EUR', '2022-05-09T09:00:00Z');

  // A partial disposal against the EUR buy — produces a realized gain event.
  tx.run('tx-sell-eur', 'h-sell-eur', ACCOUNT, 'SELL', 'EUR', '25000.00', 'BTC', '1.0',
    'EUR', '20.00', '25000.00', '25000.00', 'EUR', '2023-06-15T14:00:00Z');

  const rate = sqliteDb.prepare(
    'INSERT INTO exchange_rates (date, pair, rate, source) VALUES (?, ?, ?, ?)',
  );
  // Deliberately only around the March reward: the April one must stay uncovered.
  rate.run('2023-03-03', 'USD/EUR', '0.918695', 'ECB');
  rate.run('2023-03-06', 'USD/EUR', '0.923400', 'ECB');
  rate.run('2023-06-15', 'USD/EUR', '0.911200', 'ECB');

  sqliteDb.close();

  process.env.MOCK_MODE = 'false';
  process.env.DUCKDB_PATH = ':memory:';
  const duckDb = new DuckDbAdapter();
  await duckDb.initialize(sqlitePath);

  const prices: readonly (readonly [string, string, string, string])[] = [
    ['ETH', '1650.25', '2023-03-06', 'USD'],
    ['ETH', '1800.50', '2023-04-11', 'USD'],
    ['ETH', '2100.75', '2022-05-09', 'USD'],
    ['BTC', '20000.00', '2023-02-01', 'EUR'],
    ['BTC', '25000.00', '2023-06-15', 'EUR'],
  ];
  for (const [symbol, close, date, currency] of prices) {
    await duckDb.execute(
      `INSERT INTO _price_seed (symbol, close, date, currency)
       VALUES ('${symbol}', ${close}, DATE '${date}', '${currency}')`,
    );
  }

  return {
    duckDb,
    cleanup: () => {
      if (fs.existsSync(sqlitePath)) fs.unlinkSync(sqlitePath);
    },
  };
}

async function getFixture(): Promise<Fixture> {
  fixture ??= await buildFixture();
  return fixture;
}

/**
 * DuckDB hands back BigInt and Date values that no snapshot serialiser renders
 * stably across platforms; every column is stringified so a diff means a changed
 * value rather than a changed representation.
 */
function normalise(rows: readonly ViewRow[]): readonly Record<string, string | null>[] {
  return rows.map((row) => {
    const out: Record<string, string | null> = {};
    for (const key of Object.keys(row).sort()) {
      const value = row[key];
      out[key] =
        value === null || value === undefined
          ? null
          : value instanceof Date
            ? value.toISOString()
            : String(value);
    }
    return out;
  });
}

afterAll(() => fixture?.cleanup());

describe('FIFO view graph — golden snapshot', () => {
  it('v_flattened_fifo_events', async () => {
    const { duckDb } = await getFixture();
    const rows = (await duckDb.queryMany(
      'SELECT * FROM v_flattened_fifo_events ORDER BY tx_id, event_type, asset_id',
    )) as ViewRow[];
    expect(rows.length).toBeGreaterThan(0);
    expect(normalise(rows)).toMatchSnapshot();
  });

  it('v_calculated_tax_lots', async () => {
    const { duckDb } = await getFixture();
    const rows = (await duckDb.queryMany(
      'SELECT * FROM v_calculated_tax_lots ORDER BY acquisition_timestamp, spot_transaction_id',
    )) as ViewRow[];
    expect(rows.length).toBeGreaterThan(0);
    expect(normalise(rows)).toMatchSnapshot();
  });

  it('v_calculated_lot_history_events', async () => {
    const { duckDb } = await getFixture();
    const rows = (await duckDb.queryMany(
      'SELECT * FROM v_calculated_lot_history_events ORDER BY disposal_date, spot_transaction_id',
    )) as ViewRow[];
    expect(rows.length).toBeGreaterThan(0);
    expect(normalise(rows)).toMatchSnapshot();
  });
});
