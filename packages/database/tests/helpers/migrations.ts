/**
 * migrations — Test helper that applies the SQLite migrations the same way production does.
 *
 * Mirrors `SQLiteLedgerAdapter.applyMigrations`: filename-tracked in `_schema_migrations`, applied
 * in sorted order, each file executed at most once. Tests must not `exec` the files blindly —
 * SQLite has no `ALTER TABLE ADD COLUMN IF NOT EXISTS`, so a blind second pass fails on migrations
 * that add columns, and "is this migration idempotent?" would be testing the wrong thing.
 */

import type { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

export const MIGRATIONS_DIR = path.resolve(__dirname, '../../migrations/sqlite');

/** Migration filenames in the order the runner applies them. */
export function migrationFiles(): string[] {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

/**
 * Applies every not-yet-applied migration, recording each in `_schema_migrations`.
 *
 * Safe to call repeatedly on the same database: the second call is a no-op, which is exactly the
 * production guarantee.
 */
export function applyMigrations(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
    );
  `);

  const applied = new Set(
    (db.prepare('SELECT filename FROM _schema_migrations').all() as { filename: string }[]).map(
      (r) => r.filename
    )
  );

  for (const file of migrationFiles()) {
    if (applied.has(file)) continue;
    db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8'));
    db.prepare('INSERT INTO _schema_migrations (filename) VALUES (?)').run(file);
    applied.add(file);
  }
}

/** Reads the raw SQL of one migration, for assertions about what it does and does not contain. */
export function readMigration(filename: string): string {
  return fs.readFileSync(path.join(MIGRATIONS_DIR, filename), 'utf-8');
}
