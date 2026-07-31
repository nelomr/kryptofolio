import type { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The SQLite migration runner.
 *
 * Lives here because the migration files live here. Anything that needs to bring a ledger up to
 * date — the backend adapter, an integration test in either package — resolves the directory
 * through this module rather than guessing a relative path from its own location.
 */

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

export const MIGRATIONS_DIR = path.resolve(MODULE_DIR, '../../migrations/sqlite');

/** Migration filenames in the order the runner applies them. */
export function migrationFiles(): string[] {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

/**
 * Applies every not-yet-applied migration, recording each in `_schema_migrations`, and returns the
 * filenames it applied.
 *
 * Safe to call repeatedly: the second call is a no-op and returns an empty array. Callers must not
 * `exec` the files blindly instead — SQLite has no `ALTER TABLE ADD COLUMN IF NOT EXISTS`, so a
 * blind second pass fails on any migration that adds a column.
 */
export function applyMigrations(db: DatabaseSync): string[] {
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

  const newlyApplied: string[] = [];

  for (const file of migrationFiles()) {
    if (applied.has(file)) continue;
    db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8'));
    db.prepare('INSERT INTO _schema_migrations (filename) VALUES (?)').run(file);
    applied.add(file);
    newlyApplied.push(file);
  }

  return newlyApplied;
}

/** Reads the raw SQL of one migration, for assertions about what it does and does not contain. */
export function readMigration(filename: string): string {
  return fs.readFileSync(path.join(MIGRATIONS_DIR, filename), 'utf-8');
}
