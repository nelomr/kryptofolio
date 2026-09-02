/**
 * `v_calculated_tax_lots` has no guaranteed row order without an explicit `ORDER BY` in its own
 * definition — DuckDB is free to return rows in whatever incidental join/execution order it
 * produces. Every consumer downstream (`DuckDbTaxCalculatorAdapter.calculateLotsAndEvents`,
 * `GetTokenHistoryUseCase`, and the Vue lot tables) renders the array it receives as-is, with no
 * re-sort of its own, so the view itself must be the thing that guarantees FIFO order:
 * chronological by `acquisition_timestamp`, tie-broken by `source_tx_id`.
 *
 * Twenty single-lot acquisitions is what it takes to defeat DuckDB's incidental ordering here — a
 * handful of rows tends to come back already sorted (SQLite's own rowid order, carried through
 * mostly-passthrough views, happens to look chronological when insertion order already is). This
 * fixture inserts the rows in an order that is neither insertion order, id_hash order, nor
 * timestamp order, and lets the ids and timestamps disagree wherever `id_hash` would otherwise
 * accidentally sort correctly.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DuckDbAdapter } from '../../src/adapters/DuckDbAdapter.js';
import { applyMigrations } from '../helpers/migrations.js';

const ACCOUNT = 'acc-order';

interface LotRow {
  source_tx_id: string;
  acquisition_timestamp: string;
}

let duckDb: DuckDbAdapter;
let sqlitePath: string;

// Deliberately scrambled relative to both timestamp order and lexical id_hash order — insertion
// order here (h13, h07, h19, ...) matches none of the three.
const SPECS: { hash: string; timestamp: string }[] = [
  { hash: 'h13', timestamp: '2023-05-13T10:00:00Z' },
  { hash: 'h07', timestamp: '2023-11-07T10:00:00Z' },
  { hash: 'h19', timestamp: '2023-01-19T10:00:00Z' },
  { hash: 'h02', timestamp: '2023-09-02T10:00:00Z' },
  { hash: 'h16', timestamp: '2023-03-16T10:00:00Z' },
  { hash: 'h04', timestamp: '2023-12-04T10:00:00Z' },
  { hash: 'h11', timestamp: '2023-06-11T10:00:00Z' },
  { hash: 'h20', timestamp: '2023-02-20T10:00:00Z' },
  { hash: 'h08', timestamp: '2023-10-08T10:00:00Z' },
  { hash: 'h15', timestamp: '2023-04-15T10:00:00Z' },
  { hash: 'h01', timestamp: '2024-01-01T10:00:00Z' },
  { hash: 'h18', timestamp: '2023-01-18T10:00:00Z' },
  { hash: 'h05', timestamp: '2023-11-05T10:00:00Z' },
  { hash: 'h12', timestamp: '2023-05-12T10:00:00Z' },
  { hash: 'h09', timestamp: '2023-09-09T10:00:00Z' },
  { hash: 'h17', timestamp: '2023-02-17T10:00:00Z' },
  { hash: 'h03', timestamp: '2023-12-03T10:00:00Z' },
  { hash: 'h14', timestamp: '2023-04-14T10:00:00Z' },
  { hash: 'h10', timestamp: '2023-07-10T10:00:00Z' },
  { hash: 'h06', timestamp: '2023-11-06T10:00:00Z' },
];

beforeAll(async () => {
  sqlitePath = path.join(
    os.tmpdir(),
    `test_tax_lot_order_${process.pid}_${Date.now()}_${Math.trunc(performance.now() * 1000)}.db`,
  );
  const sqliteDb = new DatabaseSync(sqlitePath);
  sqliteDb.exec('PRAGMA foreign_keys = ON;');
  applyMigrations(sqliteDb);

  sqliteDb.prepare('INSERT INTO assets (id, symbol, is_fiat) VALUES (?, ?, ?)').run('BTC', 'BTC', 0);
  sqliteDb.prepare('INSERT INTO assets (id, symbol, is_fiat) VALUES (?, ?, ?)').run('EUR', 'EUR', 1);
  sqliteDb
    .prepare('INSERT INTO accounts (id, name, type) VALUES (?, ?, ?)')
    .run(ACCOUNT, 'Kraken', 'exchange');

  const tx = sqliteDb.prepare(
    `INSERT INTO spot_transactions (
       id, id_hash, account_id, tx_type, asset_in_id, amount_in, asset_out_id, amount_out,
       fee_asset_id, fee_amount, total_fiat, price_fiat, fiat_currency, timestamp, status
     ) VALUES (?, ?, ?, 'BUY', 'BTC', '1', 'EUR', '100.00', NULL, NULL, '100.00', '100.00', 'EUR', ?, 'COMPLETED')`,
  );
  for (const spec of SPECS) {
    tx.run(`tx-${spec.hash}`, spec.hash, ACCOUNT, spec.timestamp);
  }
  sqliteDb.close();

  process.env.MOCK_MODE = 'false';
  process.env.DUCKDB_PATH = ':memory:';
  duckDb = new DuckDbAdapter();
  await duckDb.initialize(sqlitePath);
});

afterAll(() => {
  if (fs.existsSync(sqlitePath)) fs.unlinkSync(sqlitePath);
});

describe('v_calculated_tax_lots row order', () => {
  it('returns lots in FIFO order — acquisition_timestamp, then source_tx_id — without a caller-supplied ORDER BY', async () => {
    const rows = (await duckDb.queryMany(
      'SELECT source_tx_id, acquisition_timestamp FROM v_calculated_tax_lots WHERE asset_id = \'BTC\'',
    )) as LotRow[];

    expect(rows).toHaveLength(SPECS.length);

    const expectedOrder = [...SPECS]
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.hash.localeCompare(b.hash))
      .map((s) => s.hash);

    expect(rows.map((r) => r.source_tx_id)).toEqual(expectedOrder);
  });
});

/**
 * The same claim, but through the `WHERE account_id = $1` + `SELECT *` shape
 * `DuckDbTaxCalculatorAdapter.calculateLotsAndEvents` actually uses (`packages/database` cannot
 * import `apps/backend` to call that method directly), and at 100 generated rows rather than 20.
 * `calculateLotsAndEvents`'s own `ORDER BY acquisition_timestamp, source_tx_id` was added to
 * `lotsQuery` as defensive practice — DuckDB documents no guarantee that a view's internal order
 * survives an outer query — though testing here did not find a fixture that lost the order without
 * it; every size and scramble tried already came back correctly ordered. This test is regression
 * coverage for the explicit `ORDER BY` at a second scale and code shape, not proof it was fixing an
 * observed failure.
 */
describe('v_calculated_tax_lots row order — through SELECT * ... WHERE account_id = $1 ORDER BY ...', () => {
  const N = 100;
  const generatedSpecs: { hash: string; timestamp: string }[] = [];
  for (let i = 0; i < N; i++) {
    const day = (i * 37) % 3000;
    const ts = new Date(Date.UTC(2015, 0, 1) + day * 86400000).toISOString();
    generatedSpecs.push({ hash: `g${String(i).padStart(5, '0')}`, timestamp: ts });
  }
  for (let i = generatedSpecs.length - 1; i > 0; i--) {
    const j = Math.floor(((i * 2654435761) >>> 0) % (i + 1));
    const tmp = generatedSpecs[i]!;
    generatedSpecs[i] = generatedSpecs[j]!;
    generatedSpecs[j] = tmp;
  }

  let scaleSqlitePath: string;
  let scaleDuckDb: DuckDbAdapter;

  beforeAll(async () => {
    scaleSqlitePath = path.join(
      os.tmpdir(),
      `test_tax_lot_order_scale_${process.pid}_${Date.now()}.db`,
    );
    const sqliteDb = new DatabaseSync(scaleSqlitePath);
    sqliteDb.exec('PRAGMA foreign_keys = ON;');
    applyMigrations(sqliteDb);

    sqliteDb.prepare('INSERT INTO assets (id, symbol, is_fiat) VALUES (?, ?, ?)').run('BTC', 'BTC', 0);
    sqliteDb.prepare('INSERT INTO assets (id, symbol, is_fiat) VALUES (?, ?, ?)').run('EUR', 'EUR', 1);
    sqliteDb
      .prepare('INSERT INTO accounts (id, name, type) VALUES (?, ?, ?)')
      .run(ACCOUNT, 'Kraken', 'exchange');

    const tx = sqliteDb.prepare(
      `INSERT INTO spot_transactions (
         id, id_hash, account_id, tx_type, asset_in_id, amount_in, asset_out_id, amount_out,
         fee_asset_id, fee_amount, total_fiat, price_fiat, fiat_currency, timestamp, status
       ) VALUES (?, ?, ?, 'BUY', 'BTC', '1', 'EUR', '100.00', NULL, NULL, '100.00', '100.00', 'EUR', ?, 'COMPLETED')`,
    );
    for (const spec of generatedSpecs) {
      tx.run(`tx-${spec.hash}`, spec.hash, ACCOUNT, spec.timestamp);
    }
    sqliteDb.close();

    process.env.MOCK_MODE = 'false';
    process.env.DUCKDB_PATH = ':memory:';
    scaleDuckDb = new DuckDbAdapter();
    await scaleDuckDb.initialize(scaleSqlitePath);
  });

  afterAll(() => {
    if (fs.existsSync(scaleSqlitePath)) fs.unlinkSync(scaleSqlitePath);
  });

  const expectedOrder = () =>
    [...generatedSpecs]
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.hash.localeCompare(b.hash))
      .map((s) => s.hash);

  it('holds FIFO order once the outer query carries the same ORDER BY the fixed adapter method adds', async () => {
    const rows = (await scaleDuckDb.queryMany(
      'SELECT * FROM v_calculated_tax_lots WHERE account_id = $1 ORDER BY acquisition_timestamp, source_tx_id',
      [ACCOUNT],
    )) as LotRow[];

    expect(rows).toHaveLength(generatedSpecs.length);
    expect(rows.map((r) => r.source_tx_id)).toEqual(expectedOrder());
  });
});
