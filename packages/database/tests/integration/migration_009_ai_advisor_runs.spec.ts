/**
 * migration_009_ai_advisor_runs — Verifies the audit-trail table for AI advisor runs: an
 * append-only, STRICT table recording provenance (model, tools, token counts, outcome) with
 * no column capable of holding prompt, message, or completion text.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { applyMigrations, readMigration, MIGRATIONS_DIR } from '../helpers/migrations.js';

const MIGRATION_009 = '009_ai_advisor_runs.sql';

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
  overrides: Partial<{
    id: string;
    threadId: string;
    outcome: string;
    executionProfile: string;
  }> = {},
): void {
  db.prepare(
    `INSERT INTO ai_advisor_runs
       (id, thread_id, started_at, outcome, execution_profile)
     VALUES (?, ?, '2026-01-01T00:00:00Z', ?, ?)`,
  ).run(
    overrides.id ?? 'run-1',
    overrides.threadId ?? 'thread-1',
    overrides.outcome ?? 'completed',
    overrides.executionProfile ?? 'local',
  );
}

describe('009_ai_advisor_runs migration', () => {
  let dbPath: string;
  let db: DatabaseSync;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `test_mig009_${process.pid}_${Date.now()}_${Math.random()}.db`);
    db = new DatabaseSync(dbPath);
    db.exec('PRAGMA foreign_keys = ON;');
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  it('exists on disk and is discovered by the runner', () => {
    expect(fs.existsSync(path.join(MIGRATIONS_DIR, MIGRATION_009))).toBe(true);
  });

  it('applies cleanly to a database already at 008 and creates ai_advisor_runs', () => {
    applyMigrations(db);
    const rows = db
      .prepare('SELECT filename FROM _schema_migrations WHERE filename = ?')
      .all(MIGRATION_009) as { filename: string }[];
    expect(rows).toHaveLength(1);

    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'ai_advisor_runs'")
      .get();
    expect(row).toBeDefined();
  });

  it('declares ai_advisor_runs as a STRICT table', () => {
    applyMigrations(db);
    const def = tableDefinition(db, 'ai_advisor_runs');
    expect(def).not.toBeNull();
    expect(def).toMatch(/\bSTRICT\b/);
  });

  describe('outcome CHECK constraint', () => {
    beforeEach(() => {
      applyMigrations(db);
    });

    it.each(['completed', 'refused', 'failed', 'aborted'])(
      'admits outcome = %s',
      (outcome) => {
        expect(() => insertRun(db, { id: `run-${outcome}`, outcome })).not.toThrow();
      },
    );

    it('rejects an outcome outside the vocabulary', () => {
      expect(() => insertRun(db, { outcome: 'cancelled' })).toThrow();
    });
  });

  it('defaults tools_called to an empty JSON array', () => {
    applyMigrations(db);
    insertRun(db);
    const row = db.prepare("SELECT tools_called FROM ai_advisor_runs WHERE id = 'run-1'").get() as {
      tools_called: string;
    };
    expect(row.tools_called).toBe('[]');
  });

  it('declares no column holding prompt, message, or completion text', () => {
    applyMigrations(db);
    const columns = db.prepare('PRAGMA table_info(ai_advisor_runs)').all() as { name: string }[];
    const forbidden = /prompt|message|completion|content|text/i;
    for (const column of columns) {
      expect(column.name, `column "${column.name}" looks like it could hold conversation content`).not.toMatch(
        forbidden,
      );
    }
  });

  describe('additive-only (no existing table or CHECK changes)', () => {
    it('leaves every table definition from 001-008 byte-identical', () => {
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
        .prepare("SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name != '_schema_migrations'")
        .all() as { name: string; sql: string }[];
      before.close();

      applyMigrations(db);
      for (const table of beforeTables) {
        expect(tableDefinition(db, table.name), table.name).toBe(table.sql);
      }
    });

    it('009 is a brand-new table only — no ALTER statement in the migration file', () => {
      const sql = readMigration(MIGRATION_009);
      expect(sql).not.toMatch(/ALTER\s+TABLE/i);
    });
  });

  describe('idempotent write per run', () => {
    beforeEach(() => {
      applyMigrations(db);
    });

    it('writing the same id twice leaves exactly one row (upsert on primary key)', () => {
      insertRun(db, { id: 'run-shared', outcome: 'completed' });
      db.prepare(
        `INSERT INTO ai_advisor_runs (id, thread_id, started_at, outcome, execution_profile)
         VALUES ('run-shared', 'thread-1', '2026-01-01T00:01:00Z', 'aborted', 'local')
         ON CONFLICT(id) DO UPDATE SET
           outcome = excluded.outcome,
           finished_at = excluded.finished_at`,
      ).run();

      const rows = db.prepare("SELECT * FROM ai_advisor_runs WHERE id = 'run-shared'").all();
      expect(rows).toHaveLength(1);
      const row = rows[0] as { outcome: string };
      expect(row.outcome).toBe('aborted');
    });
  });

  describe('execution_profile / steps_used / max_steps', () => {
    beforeEach(() => {
      applyMigrations(db);
    });

    it.each(['local', 'metered', 'mixed'])('admits execution_profile = %s', (executionProfile) => {
      expect(() =>
        insertRun(db, { id: `run-${executionProfile}`, executionProfile }),
      ).not.toThrow();
    });

    it('rejects an execution_profile outside the three values', () => {
      expect(() => insertRun(db, { executionProfile: 'cloud' })).toThrow();
    });

    it('accepts steps_used and max_steps as nullable integers', () => {
      db.prepare(
        `INSERT INTO ai_advisor_runs
           (id, thread_id, started_at, outcome, execution_profile, steps_used, max_steps)
         VALUES ('run-steps', 'thread-1', '2026-01-01T00:00:00Z', 'completed', 'local', 3, 10)`,
      ).run();
      const row = db.prepare("SELECT steps_used, max_steps FROM ai_advisor_runs WHERE id = 'run-steps'").get() as {
        steps_used: number;
        max_steps: number;
      };
      expect(row.steps_used).toBe(3);
      expect(row.max_steps).toBe(10);
    });

    it('leaves steps_used and max_steps NULL for a run that never reaches a step', () => {
      insertRun(db, { id: 'run-no-model', outcome: 'failed' });
      const row = db.prepare("SELECT steps_used, max_steps FROM ai_advisor_runs WHERE id = 'run-no-model'").get() as {
        steps_used: number | null;
        max_steps: number | null;
      };
      expect(row.steps_used).toBeNull();
      expect(row.max_steps).toBeNull();
    });
  });
});
