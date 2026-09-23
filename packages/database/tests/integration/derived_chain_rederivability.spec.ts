/**
 * DuckDB holds nothing SQLite does not already hold (design Migration Plan): every one of
 * the six derived relations must be fully re-derivable from the ledger at any time, whether
 * `m_*` is dropped and rebuilt in place or the whole analytical `.duckdb` file is deleted
 * and the process restarts from scratch.
 */

import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { DuckDbAdapter } from '../../src/adapters/DuckDbAdapter.js';
import { applyMigrations } from '../helpers/migrations.js';
import { seedTransferTraceabilityFixture } from '../fixtures/transfer-traceability.js';

const DERIVED_RELATIONS = [
  'flattened_fifo_events',
  'fifo_matches',
  'calculated_tax_lots',
  'calculated_lot_history_events',
  'daily_running_balances',
  'portfolio_daily_valuation',
] as const;

async function snapshotAll(adapter: DuckDbAdapter): Promise<Record<string, unknown[]>> {
  const out: Record<string, unknown[]> = {};
  for (const name of DERIVED_RELATIONS) {
    const columns = await adapter.queryMany<{ column_name: string }>(`DESCRIBE m_${name};`);
    const projection = columns.map((c) => `"${c.column_name}"::VARCHAR AS "${c.column_name}"`).join(', ');
    out[name] = await adapter.queryMany(`SELECT ${projection} FROM m_${name} ORDER BY ALL;`);
  }
  return out;
}

function seedLedger(): { sqliteDbPath: string; cleanup: () => void } {
  const sqliteDbPath = path.join(
    os.tmpdir(),
    `test_ledger_rederive_${Date.now()}_${Math.random().toString(36).slice(2)}.db`,
  );
  const sqliteDb = new DatabaseSync(sqliteDbPath);
  sqliteDb.exec('PRAGMA foreign_keys = ON;');
  applyMigrations(sqliteDb);
  seedTransferTraceabilityFixture(sqliteDb, { normaliseFiatSign: true });
  sqliteDb.close();
  return { sqliteDbPath, cleanup: () => fs.existsSync(sqliteDbPath) && fs.unlinkSync(sqliteDbPath) };
}

describe('derived FIFO chain re-derivability', () => {
  it('produces an identical chain after dropping and rebuilding every m_<name> in place', async () => {
    const { sqliteDbPath, cleanup } = seedLedger();
    const duckDbPath = path.join(
      os.tmpdir(),
      `test_analytical_rederive_a_${Date.now()}.duckdb`,
    );
    process.env.MOCK_MODE = 'false';
    process.env.DUCKDB_PATH = duckDbPath;

    try {
      const adapter = new DuckDbAdapter();
      await adapter.initialize(sqliteDbPath);
      await adapter.rebuildDerivedChain();
      const before = await snapshotAll(adapter);

      for (const name of DERIVED_RELATIONS) {
        await adapter.execute(`DROP TABLE m_${name};`);
      }
      // Recreate the empty placeholders the same way initialize() does, so the public views
      // keep resolving before the rebuild repopulates them.
      await adapter.initialize(sqliteDbPath);
      await adapter.rebuildDerivedChain();
      const after = await snapshotAll(adapter);

      expect(after).toEqual(before);
    } finally {
      cleanup();
      for (const p of [duckDbPath, `${duckDbPath}.wal`]) {
        if (fs.existsSync(p)) fs.unlinkSync(p);
      }
      delete process.env.DUCKDB_PATH;
    }
  });

  it('produces an identical chain after deleting the analytical .duckdb file and restarting', async () => {
    const { sqliteDbPath, cleanup } = seedLedger();
    const duckDbPath = path.join(
      os.tmpdir(),
      `test_analytical_rederive_b_${Date.now()}.duckdb`,
    );
    process.env.MOCK_MODE = 'false';
    process.env.DUCKDB_PATH = duckDbPath;

    try {
      const first = new DuckDbAdapter();
      await first.initialize(sqliteDbPath);
      await first.rebuildDerivedChain();
      const before = await snapshotAll(first);

      for (const p of [duckDbPath, `${duckDbPath}.wal`]) {
        if (fs.existsSync(p)) fs.unlinkSync(p);
      }

      const second = new DuckDbAdapter();
      await second.initialize(sqliteDbPath);
      await second.rebuildDerivedChain();
      const after = await snapshotAll(second);

      expect(after).toEqual(before);
    } finally {
      cleanup();
      for (const p of [duckDbPath, `${duckDbPath}.wal`]) {
        if (fs.existsSync(p)) fs.unlinkSync(p);
      }
      delete process.env.DUCKDB_PATH;
    }
  });
});
