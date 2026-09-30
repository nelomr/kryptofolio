/**
 * migration_010_nullable_advisor_execution_profile — `ai_advisor_runs.execution_profile` (009)
 * was declared NOT NULL on the assumption a resolved profile always exists before persistence.
 * That assumption does not hold for a run cancelled before any receipt data was ever observed by
 * its caller, which genuinely has no profile to report. This migration loosens the column to
 * nullable, the same rebuild-in-place shape 005 already used to loosen a NOT NULL column.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { applyMigrations, readMigration, MIGRATIONS_DIR } from '../helpers/migrations.js';

const MIGRATION_010 = '010_nullable_advisor_execution_profile.sql';

interface TableDefRow {
  sql: string | null;
}

function tableDefinition(db: DatabaseSync, table: string): string | null {
  const row = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(table) as TableDefRow | undefined;
  return row?.sql ?? null;
}

function insertRun(
  db: DatabaseSync,
  overrides: Partial<{ id: string; outcome: string; executionProfile: string | null }> = {},
): void {
  db.prepare(
    `INSERT INTO ai_advisor_runs
       (id, thread_id, started_at, outcome, execution_profile)
     VALUES (?, 'thread-1', '2026-01-01T00:00:00Z', ?, ?)`,
  ).run(overrides.id ?? 'run-1', overrides.outcome ?? 'aborted', overrides.executionProfile ?? null);
}

describe('010_nullable_advisor_execution_profile migration', () => {
  let dbPath: string;
  let db: DatabaseSync;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `test_mig010_${process.pid}_${Date.now()}_${Math.random()}.db`);
    db = new DatabaseSync(dbPath);
    db.exec('PRAGMA foreign_keys = ON;');
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  it('exists on disk and is discovered by the runner', () => {
    expect(fs.existsSync(path.join(MIGRATIONS_DIR, MIGRATION_010))).toBe(true);
  });

  it('applies cleanly on top of 009 and is recorded', () => {
    applyMigrations(db);
    const rows = db
      .prepare('SELECT filename FROM _schema_migrations WHERE filename = ?')
      .all(MIGRATION_010) as { filename: string }[];
    expect(rows).toHaveLength(1);
  });

  it('leaves ai_advisor_runs STRICT', () => {
    applyMigrations(db);
    const def = tableDefinition(db, 'ai_advisor_runs');
    expect(def).not.toBeNull();
    expect(def).toMatch(/\bSTRICT\b/);
  });

  it('now admits a NULL execution_profile', () => {
    applyMigrations(db);
    expect(() => insertRun(db, { id: 'run-unknown-profile', executionProfile: null })).not.toThrow();
    const row = db.prepare("SELECT execution_profile FROM ai_advisor_runs WHERE id = 'run-unknown-profile'").get() as {
      execution_profile: string | null;
    };
    expect(row.execution_profile).toBeNull();
  });

  it.each(['local', 'metered', 'mixed'])('still admits execution_profile = %s', (executionProfile) => {
    applyMigrations(db);
    expect(() => insertRun(db, { id: `run-${executionProfile}`, executionProfile })).not.toThrow();
  });

  it('still rejects an execution_profile outside the vocabulary', () => {
    applyMigrations(db);
    expect(() => insertRun(db, { executionProfile: 'cloud' })).toThrow();
  });

  it('leaves the outcome CHECK vocabulary untouched', () => {
    applyMigrations(db);
    expect(() => insertRun(db, { id: 'run-bad-outcome', outcome: 'cancelled' })).toThrow();
  });

  it('is a rebuild, not an ALTER, and does not touch any table other than ai_advisor_runs', () => {
    const sql = readMigration(MIGRATION_010);
    expect(sql).not.toMatch(/ALTER\s+TABLE/i);

    const before = new DatabaseSync(':memory:');
    before.exec('PRAGMA foreign_keys = ON;');
    for (const file of [
      '001_vault_schema.sql',
      '002_ledger_schema.sql',
      '003_currency_schema.sql',
      '004_fifo_traceability.sql',
      '005_nullable_fiat_magnitudes.sql',
      '006_fx_conversion_provenance.sql',
      '007_futures_collateral_movements.sql',
      '008_spot_transaction_overrides.sql',
    ]) {
      before.exec(readMigration(file));
    }
    const beforeTables = before
      .prepare(
        "SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name != '_schema_migrations' AND name != 'ai_advisor_runs'",
      )
      .all() as { name: string; sql: string }[];
    before.close();

    applyMigrations(db);
    for (const table of beforeTables) {
      expect(tableDefinition(db, table.name), table.name).toBe(table.sql);
    }
  });
});
