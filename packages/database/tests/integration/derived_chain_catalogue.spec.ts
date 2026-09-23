/**
 * The catalogue shape of the six derived FIFO relations after `initialize()` (design D1).
 *
 * Each relation splits into three catalogue objects: `v_<name>__def` (the relocated view
 * SQL), `m_<name>` (the materialized storage table), and `v_<name>` (the public view over
 * the table). `initialize()` must leave all three in place before any rebuild has run —
 * `m_<name>` starts as an empty placeholder (DuckDB refuses to create a view over a table
 * that does not exist yet), and no `m_fifo_build` stamp exists, meaning the chain has never
 * been built.
 */

import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { DuckDbAdapter } from '../../src/adapters/DuckDbAdapter.js';
import { applyMigrations } from '../helpers/migrations.js';

const DERIVED_RELATIONS = [
  'flattened_fifo_events',
  'fifo_matches',
  'calculated_tax_lots',
  'calculated_lot_history_events',
  'daily_running_balances',
  'portfolio_daily_valuation',
] as const;

describe('derived FIFO chain catalogue (post-initialize)', () => {
  let sqliteDbPath: string;
  let sqliteDb: DatabaseSync;
  let duckDbPath: string;

  beforeEach(() => {
    sqliteDbPath = path.join(
      os.tmpdir(),
      `test_ledger_catalogue_${Date.now()}_${Math.random().toString(36).slice(2)}.db`,
    );
    sqliteDb = new DatabaseSync(sqliteDbPath);
    sqliteDb.exec('PRAGMA foreign_keys = ON;');
    applyMigrations(sqliteDb);

    duckDbPath = path.join(
      os.tmpdir(),
      `test_analytical_catalogue_${Date.now()}_${Math.random().toString(36).slice(2)}.duckdb`,
    );
    process.env.MOCK_MODE = 'false';
    process.env.DUCKDB_PATH = duckDbPath;
  });

  afterEach(() => {
    sqliteDb.close();
    for (const p of [sqliteDbPath, duckDbPath, `${duckDbPath}.wal`]) {
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
    delete process.env.DUCKDB_PATH;
  });

  it('creates the three-object shape for every derived relation', async () => {
    const adapter = new DuckDbAdapter();
    await adapter.initialize(sqliteDbPath);

    const views = (await adapter.queryMany<{ view_name: string }>(
      "SELECT view_name FROM duckdb_views() WHERE schema_name = 'main'",
    )).map((r) => r.view_name);
    const tables = (await adapter.queryMany<{ table_name: string }>(
      "SELECT table_name FROM duckdb_tables() WHERE schema_name = 'main'",
    )).map((r) => r.table_name);

    for (const name of DERIVED_RELATIONS) {
      expect(views, `v_${name}__def must be a view`).toContain(`v_${name}__def`);
      expect(views, `v_${name} must be a public view`).toContain(`v_${name}`);
      expect(tables, `m_${name} must be a materialized table`).toContain(`m_${name}`);

      const rows = await adapter.queryMany(`SELECT * FROM v_${name}`);
      expect(rows, `v_${name} must be empty before any rebuild`).toHaveLength(0);
    }

    expect(tables, 'm_fifo_build must not exist before any rebuild').not.toContain(
      'm_fifo_build',
    );
  });

  it('drops a stale pre-existing m_<name> table on re-initialize, not merely leaves it', async () => {
    const first = new DuckDbAdapter();
    await first.initialize(sqliteDbPath);

    // Simulate a residual table from a previous, incompatible schema — a single bogus
    // column that would not match `v_flattened_fifo_events__def`'s real shape.
    await first.execute('DROP TABLE m_flattened_fifo_events;');
    await first.execute('CREATE TABLE m_flattened_fifo_events AS SELECT 999 AS bogus_column;');
    await first.execute("CREATE OR REPLACE VIEW v_flattened_fifo_events AS SELECT * FROM m_flattened_fifo_events;");

    const second = new DuckDbAdapter();
    await second.initialize(sqliteDbPath);

    const columns = (await second.queryMany<{ column_name: string }>(
      "DESCRIBE m_flattened_fifo_events",
    )).map((r) => r.column_name);
    expect(columns, 'the stale bogus column must be gone').not.toContain('bogus_column');
    expect(columns, 're-initialize must rebuild the correct placeholder schema').toContain(
      'tx_id',
    );
  });
});
