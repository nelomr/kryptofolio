/**
 * Materialization is semantically neutral (design context, D9): `m_<name>` must be exactly
 * what `v_<name>__def` computes, for every one of the six derived relations, over a
 * non-trivial ledger. Every decimal column is compared as an exact string — no float
 * comparison can sneak a rounding difference past this test.
 */

import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
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

/**
 * A pinned monetary column per relation, and the type it must carry (design D3/rule 4).
 *
 * `calculated_tax_lots` and `calculated_lot_history_events` sit at the SQLite persistence
 * boundary — their money columns are deliberately cast to `VARCHAR` there already (they
 * become `PreciseAmount` on the way into SQLite's `TEXT` + `GLOB` columns), so pinning
 * `DECIMAL` for them would assert a boundary that was never meant to exist at this layer.
 * The other four relations are internal to the DuckDB chain and must stay `DECIMAL`.
 */
const MONEY_COLUMN: Record<(typeof DERIVED_RELATIONS)[number], { column: string; type: 'DECIMAL' | 'VARCHAR' }> = {
  flattened_fifo_events: { column: 'total_fiat', type: 'DECIMAL' },
  fifo_matches: { column: 'gain_loss_fiat', type: 'DECIMAL' },
  calculated_tax_lots: { column: 'unit_cost_fiat', type: 'VARCHAR' },
  calculated_lot_history_events: { column: 'gain_loss_fiat', type: 'VARCHAR' },
  daily_running_balances: { column: 'running_balance', type: 'DECIMAL' },
  portfolio_daily_valuation: { column: 'daily_value', type: 'DECIMAL' },
};

interface Fixture {
  readonly sqliteDb: DatabaseSync;
  readonly sqliteDbPath: string;
  readonly duckDbPath: string;
  readonly adapter: DuckDbAdapter;
}

let fixture: Fixture;

async function describeColumns(
  adapter: DuckDbAdapter,
  relation: string,
): Promise<{ column_name: string; column_type: string }[]> {
  return adapter.queryMany<{ column_name: string; column_type: string }>(`DESCRIBE ${relation};`);
}

async function selectAllAsStrings(adapter: DuckDbAdapter, relation: string): Promise<unknown[]> {
  const columns = await describeColumns(adapter, relation);
  const projection = columns.map((c) => `"${c.column_name}"::VARCHAR AS "${c.column_name}"`).join(', ');
  return adapter.queryMany(`SELECT ${projection} FROM ${relation} ORDER BY ALL;`);
}

beforeAll(async () => {
  const sqliteDbPath = path.join(
    os.tmpdir(),
    `test_ledger_equivalence_${Date.now()}_${Math.random().toString(36).slice(2)}.db`,
  );
  const sqliteDb = new DatabaseSync(sqliteDbPath);
  sqliteDb.exec('PRAGMA foreign_keys = ON;');
  applyMigrations(sqliteDb);
  seedTransferTraceabilityFixture(sqliteDb, { normaliseFiatSign: true });

  const duckDbPath = path.join(
    os.tmpdir(),
    `test_analytical_equivalence_${Date.now()}_${Math.random().toString(36).slice(2)}.duckdb`,
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

describe('materialized chain is semantically neutral (equivalence)', () => {
  for (const name of DERIVED_RELATIONS) {
    it(`m_${name} is byte-for-byte identical to v_${name}__def`, async () => {
      const [defRows, tableRows] = await Promise.all([
        selectAllAsStrings(fixture.adapter, `v_${name}__def`),
        selectAllAsStrings(fixture.adapter, `m_${name}`),
      ]);

      // Non-vacuity guard: an empty relation trivially "matches" another empty one, which
      // would pass this test for the wrong reason. The fixture is non-trivial (12 ledger
      // scenarios across multiple assets), so every one of the six relations must produce
      // at least one row.
      expect(defRows.length, `v_${name}__def must not be empty`).toBeGreaterThan(0);

      expect(tableRows).toEqual(defRows);
    });
  }

  for (const name of DERIVED_RELATIONS) {
    const { column, type } = MONEY_COLUMN[name];
    it(`m_${name} preserves ${column} as ${type}`, async () => {
      const columns = await describeColumns(fixture.adapter, `m_${name}`);
      const moneyColumn = columns.find((c) => c.column_name === column);
      expect(moneyColumn, `${column} must exist on m_${name}`).toBeDefined();
      if (type === 'DECIMAL') {
        expect(moneyColumn!.column_type, `${column} must be DECIMAL, never a float`).toMatch(
          /^DECIMAL/,
        );
      } else {
        expect(
          moneyColumn!.column_type,
          `${column} is the SQLite-boundary column and must stay VARCHAR (PreciseAmount)`,
        ).toBe('VARCHAR');
      }
    });
  }
});
