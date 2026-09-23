/**
 * The rebuild transaction (design D2-D3): one explicit transaction over all six derived
 * relations, dependency-ordered, that either commits a fully consistent chain or leaves the
 * previous one untouched — readers on another connection must never observe a half-built
 * chain, and a widened decimal type must abort the rebuild before COMMIT.
 */

import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { DuckDbAdapter } from '../../src/adapters/DuckDbAdapter.js';
import { applyMigrations } from '../helpers/migrations.js';

const ACCOUNT = 'acc-rebuild';

function seedLedger(sqliteDb: DatabaseSync): void {
  const asset = sqliteDb.prepare('INSERT INTO assets (id, symbol, is_fiat) VALUES (?, ?, ?)');
  for (const [id, isFiat] of [
    ['BTC', 0],
    ['EUR', 1],
  ] as const) {
    asset.run(id, id, isFiat);
  }
  sqliteDb
    .prepare('INSERT INTO accounts (id, name, type) VALUES (?, ?, ?)')
    .run(ACCOUNT, 'Kraken', 'exchange');

  sqliteDb
    .prepare(
      `INSERT INTO spot_transactions (
         id, id_hash, account_id, tx_type, asset_in_id, amount_in, asset_out_id, amount_out,
         fee_asset_id, fee_amount, total_fiat, price_fiat, fiat_currency, timestamp, status
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'COMPLETED')`,
    )
    .run(
      'tx-buy-1',
      'h-buy-1',
      ACCOUNT,
      'BUY',
      'BTC',
      '1.0',
      'EUR',
      '20000.00',
      'EUR',
      '10.00',
      '20000.00',
      '20000.00',
      'EUR',
      '2023-01-01T10:00:00Z',
    );
}

function insertSecondTx(sqliteDb: DatabaseSync): void {
  sqliteDb
    .prepare(
      `INSERT INTO spot_transactions (
         id, id_hash, account_id, tx_type, asset_in_id, amount_in, asset_out_id, amount_out,
         fee_asset_id, fee_amount, total_fiat, price_fiat, fiat_currency, timestamp, status
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'COMPLETED')`,
    )
    .run(
      'tx-buy-2',
      'h-buy-2',
      ACCOUNT,
      'BUY',
      'BTC',
      '0.5',
      'EUR',
      '10000.00',
      'EUR',
      '5.00',
      '10000.00',
      '20000.00',
      'EUR',
      '2023-02-01T10:00:00Z',
    );
}

interface Fixture {
  readonly sqliteDb: DatabaseSync;
  readonly sqliteDbPath: string;
  readonly duckDbPath: string;
  readonly adapter: DuckDbAdapter;
}

async function buildFixture(): Promise<Fixture> {
  const sqliteDbPath = path.join(
    os.tmpdir(),
    `test_ledger_rebuild_${Date.now()}_${Math.random().toString(36).slice(2)}.db`,
  );
  const sqliteDb = new DatabaseSync(sqliteDbPath);
  sqliteDb.exec('PRAGMA foreign_keys = ON;');
  applyMigrations(sqliteDb);
  seedLedger(sqliteDb);

  const duckDbPath = path.join(
    os.tmpdir(),
    `test_analytical_rebuild_${Date.now()}_${Math.random().toString(36).slice(2)}.duckdb`,
  );
  process.env.MOCK_MODE = 'false';
  process.env.DUCKDB_PATH = duckDbPath;
  const adapter = new DuckDbAdapter();
  await adapter.initialize(sqliteDbPath);

  return { sqliteDb, sqliteDbPath, duckDbPath, adapter };
}

function cleanup(fixture: Fixture): void {
  fixture.sqliteDb.close();
  for (const p of [fixture.sqliteDbPath, fixture.duckDbPath, `${fixture.duckDbPath}.wal`]) {
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
  delete process.env.DUCKDB_PATH;
}

describe('derived FIFO chain rebuild transaction', () => {
  let fixture: Fixture;

  beforeEach(async () => {
    fixture = await buildFixture();
  });

  afterEach(() => cleanup(fixture));

  it('never lets a second connection observe a half-built chain (isolation)', async () => {
    const { adapter, sqliteDb } = fixture;

    await adapter.rebuildDerivedChain();
    const beforeRows = await adapter.queryMany<{ n: bigint }>(
      'SELECT COUNT(*) AS n FROM v_calculated_tax_lots',
    );
    const before = Number(beforeRows[0]!.n);
    expect(before).toBe(1);

    insertSecondTx(sqliteDb);

    const connectionB = await adapter.getInstance().connect();
    let sawDuringRebuild: number | undefined;

    await adapter.rebuildDerivedChain({
      beforeCommit: async () => {
        const reader = await connectionB.runAndReadAll(
          'SELECT COUNT(*) AS n FROM m_calculated_tax_lots',
        );
        const rows = reader.getRowObjects() as { n: bigint }[];
        sawDuringRebuild = Number(rows[0]!.n);
      },
    });

    // Before COMMIT, connection B must still see the PREVIOUS build's row count.
    expect(sawDuringRebuild).toBe(before);

    const afterRows = await adapter.queryMany<{ n: bigint }>(
      'SELECT COUNT(*) AS n FROM v_calculated_tax_lots',
    );
    expect(Number(afterRows[0]!.n)).toBe(2);
  });

  it('rolls back entirely when one chain statement raises partway through', async () => {
    const { adapter } = fixture;

    await adapter.rebuildDerivedChain();
    const before = await adapter.queryMany('SELECT * FROM v_calculated_tax_lots');
    expect(before.length).toBeGreaterThan(0);

    // Force a mid-chain failure: drop a definition the chain depends on further downstream.
    await adapter.execute('DROP VIEW v_calculated_lot_history_events__def;');

    await expect(adapter.rebuildDerivedChain()).rejects.toThrow();

    // The previous, successfully-committed chain must be completely untouched.
    const after = await adapter.queryMany('SELECT * FROM v_calculated_tax_lots');
    expect(after).toEqual(before);
  });

  it('aborts before COMMIT when a rebuild step would widen a DECIMAL column to DOUBLE', async () => {
    const { adapter } = fixture;

    await adapter.rebuildDerivedChain();
    const before = await adapter.queryMany('SELECT * FROM v_calculated_tax_lots');

    // Degrade one monetary column's declared type in the definition, simulating the exact
    // defect class D3 exists to catch.
    await adapter.execute(`
      CREATE OR REPLACE VIEW v_flattened_fifo_events__def AS
      SELECT
        CAST(NULL AS VARCHAR) AS tx_id,
        CAST(NULL AS VARCHAR) AS id_hash,
        CAST(NULL AS VARCHAR) AS account_id,
        CAST(NULL AS TIMESTAMP) AS timestamp,
        CAST(NULL AS VARCHAR) AS asset_id,
        CAST(NULL AS VARCHAR) AS event_type,
        CAST(NULL AS DECIMAL(38,18)) AS amount,
        CAST(NULL AS DOUBLE) AS total_fiat,
        CAST(NULL AS DECIMAL(38,18)) AS price_fiat,
        CAST(NULL AS VARCHAR) AS disposal_type,
        CAST(NULL AS BOOLEAN) AS taxable_disposal,
        CAST(NULL AS VARCHAR) AS value_provenance,
        CAST(NULL AS DECIMAL(18,12)) AS fx_rate,
        CAST(NULL AS VARCHAR) AS fx_rate_date,
        CAST(NULL AS BOOLEAN) AS missing_fx_rate,
        CAST(NULL AS BOOLEAN) AS currency_mismatch,
        CAST(NULL AS BOOLEAN) AS rounds_to_zero
      WHERE FALSE;
    `);

    await expect(adapter.rebuildDerivedChain()).rejects.toThrow(/DECIMAL|DOUBLE|type/i);

    const after = await adapter.queryMany('SELECT * FROM v_calculated_tax_lots');
    expect(after).toEqual(before);
  });
});
