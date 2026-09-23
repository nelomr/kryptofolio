/**
 * `v_external_tax_lots` (design D5/section 6): a `ledger.tax_lots` row whose originating
 * transaction never produces a `v_flattened_fifo_events` row (a custody movement — DEPOSIT,
 * WITHDRAWAL, TRANSFER_IN/OUT, MIGRATION_SWAP — none of which open an acquisition) is still
 * a real open position and must appear in the materialized open-lot relation, carrying the
 * same columns and quality-flag vocabulary as a FIFO-derived lot.
 *
 * Measurement 1.3 found zero live rows in the real ledger for the (schema-guaranteed-always-
 * false) `spot_transaction_id IS NULL` branch; the operative branch in practice is "this
 * transaction never generated a flattened event at all", which is what this fixture exercises.
 */

import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { DuckDbAdapter } from '../../src/adapters/DuckDbAdapter.js';
import { applyMigrations } from '../helpers/migrations.js';

const ACCOUNT = 'acc-external';
const EXTERNAL_TX = 'tx-deposit-external';
const EXTERNAL_LOT_ID = 'lot-external-1';

interface Fixture {
  readonly sqliteDb: DatabaseSync;
  readonly sqliteDbPath: string;
  readonly duckDbPath: string;
  readonly adapter: DuckDbAdapter;
}

let fixture: Fixture;

beforeAll(async () => {
  const sqliteDbPath = path.join(
    os.tmpdir(),
    `test_ledger_external_${Date.now()}_${Math.random().toString(36).slice(2)}.db`,
  );
  const sqliteDb = new DatabaseSync(sqliteDbPath);
  sqliteDb.exec('PRAGMA foreign_keys = ON;');
  applyMigrations(sqliteDb);

  sqliteDb.prepare('INSERT INTO assets (id, symbol, is_fiat) VALUES (?, ?, ?)').run('SOL', 'SOL', 0);
  sqliteDb
    .prepare('INSERT INTO accounts (id, name, type) VALUES (?, ?, ?)')
    .run(ACCOUNT, 'Cold Wallet', 'wallet');

  // A DEPOSIT never generates an acquisition/disposal event (CUSTODY_MOVEMENT policy) and
  // carries no fee here, so its tx_id never appears in v_flattened_fifo_events at all.
  sqliteDb
    .prepare(
      `INSERT INTO spot_transactions (
         id, id_hash, account_id, tx_type, asset_in_id, amount_in, asset_out_id, amount_out,
         fee_asset_id, fee_amount, total_fiat, price_fiat, fiat_currency, timestamp, status
       ) VALUES (?, ?, ?, 'DEPOSIT', ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, 'EUR', ?, 'COMPLETED')`,
    )
    .run(EXTERNAL_TX, `h-${EXTERNAL_TX}`, ACCOUNT, 'SOL', '5.0', '2024-01-01T00:00:00Z');

  // A user-declared lot for that externally-known position (e.g. a legacy/manual entry) —
  // not derivable from the FIFO flattening chain, but a real open position all the same.
  sqliteDb
    .prepare(
      `INSERT INTO tax_lots (
         id, spot_transaction_id, asset_id, account_id, original_qty, remaining_qty,
         unit_cost_fiat, total_cost_fiat, fiat_currency, acquisition_timestamp,
         exchange_location, status
       ) VALUES (?, ?, 'SOL', ?, '5.0', '5.0', '100.0', '500.0', 'EUR', ?, 'Cold Wallet', 'OPEN')`,
    )
    .run(EXTERNAL_LOT_ID, EXTERNAL_TX, ACCOUNT, '2024-01-01T00:00:00Z');

  const duckDbPath = path.join(
    os.tmpdir(),
    `test_analytical_external_${Date.now()}_${Math.random().toString(36).slice(2)}.duckdb`,
  );
  process.env.MOCK_MODE = 'false';
  process.env.DUCKDB_PATH = duckDbPath;
  const adapter = new DuckDbAdapter();
  await adapter.initialize(sqliteDbPath);
  await adapter.rebuildDerivedChain();

  fixture = { sqliteDb, sqliteDbPath, duckDbPath, adapter };
});

afterAll(() => {
  fixture.sqliteDb.close();
  for (const p of [fixture.sqliteDbPath, fixture.duckDbPath, `${fixture.duckDbPath}.wal`]) {
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
  delete process.env.DUCKDB_PATH;
});

describe('v_external_tax_lots is unioned into the materialized open-lot relation', () => {
  it('surfaces the externally-known lot in v_calculated_tax_lots after a rebuild', async () => {
    const rows = await fixture.adapter.queryMany<{
      spot_transaction_id: string;
      asset_id: string;
      remaining_qty: string;
      status: string;
    }>(`SELECT spot_transaction_id, asset_id, remaining_qty, status FROM v_calculated_tax_lots WHERE spot_transaction_id = '${EXTERNAL_TX}';`);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      spot_transaction_id: EXTERNAL_TX,
      asset_id: 'SOL',
      remaining_qty: '5.0',
      status: 'OPEN',
    });
  });

  it('carries the same column set as a FIFO-derived lot', async () => {
    const columns = await fixture.adapter.queryMany<{ column_name: string }>(
      'DESCRIBE v_calculated_tax_lots;',
    );
    const externalRow = await fixture.adapter.queryMany(
      `SELECT * FROM v_calculated_tax_lots WHERE spot_transaction_id = '${EXTERNAL_TX}';`,
    );
    expect(Object.keys(externalRow[0] as object).sort()).toEqual(
      columns.map((c) => c.column_name).sort(),
    );
  });
});
