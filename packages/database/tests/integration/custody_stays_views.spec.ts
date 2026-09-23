/**
 * Custody stays a separate relation set of VIEWS, never materialized (design non-goal:
 * "No materialization of the custody chain (v_custody_*, v_lot_*)"). A rebuild of the six
 * FIFO derived relations must never produce an `m_` table for any custody relation.
 */
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { DuckDbAdapter } from '../../src/adapters/DuckDbAdapter.js';
import { applyMigrations } from '../helpers/migrations.js';

const CUSTODY_RELATIONS = [
  'custody_balances',
  'custody_entries',
  'custody_movements',
  'lot_current_location',
  'lot_custody_allocation',
  'lot_custody_timeline',
] as const;

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
    `test_ledger_custody_views_${Date.now()}_${Math.random().toString(36).slice(2)}.db`,
  );
  const sqliteDb = new DatabaseSync(sqliteDbPath);
  sqliteDb.exec('PRAGMA foreign_keys = ON;');
  applyMigrations(sqliteDb);

  const duckDbPath = path.join(
    os.tmpdir(),
    `test_analytical_custody_views_${Date.now()}_${Math.random().toString(36).slice(2)}.duckdb`,
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

describe('custody relations stay views after a rebuild', () => {
  it('has no m_<name> table for any custody relation', async () => {
    const tables = (
      await fixture.adapter.queryMany<{ table_name: string }>(
        "SELECT table_name FROM duckdb_tables() WHERE schema_name = 'main';",
      )
    ).map((r) => r.table_name);

    for (const name of CUSTODY_RELATIONS) {
      expect(tables, `m_${name} must not exist`).not.toContain(`m_${name}`);
    }
  });

  it('still exposes every custody relation as a view', async () => {
    const views = (
      await fixture.adapter.queryMany<{ view_name: string }>(
        "SELECT view_name FROM duckdb_views() WHERE schema_name = 'main';",
      )
    ).map((r) => r.view_name);

    for (const name of CUSTODY_RELATIONS) {
      expect(views, `v_${name} must exist as a view`).toContain(`v_${name}`);
    }
  });
});
