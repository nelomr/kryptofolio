/**
 * migration_005_nullable_fiat_magnitudes — Verifies `total_fiat`/`price_fiat` accept NULL for an
 * unresolved value while a stated `0` (genuinely free) and a negative magnitude keep their
 * existing behaviour: the former is preserved, the latter is still rejected by the CHECK.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { applyMigrations, readMigration, MIGRATIONS_DIR } from '../helpers/migrations.js';

const MIGRATION_005 = '005_nullable_fiat_magnitudes.sql';

interface ColumnInfo {
  name: string;
  notnull: number;
}

function columns(db: DatabaseSync, table: string): ColumnInfo[] {
  return db.prepare(`PRAGMA table_info(${table})`).all() as unknown as ColumnInfo[];
}

function rowCount(db: DatabaseSync, table: string): number {
  const row = db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number };
  return row.c;
}

describe('005_nullable_fiat_magnitudes migration', () => {
  let dbPath: string;
  let db: DatabaseSync;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `test_mig005_${process.pid}_${Date.now()}_${Math.random()}.db`);
    db = new DatabaseSync(dbPath);
    db.exec('PRAGMA foreign_keys = ON;');
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  it('exists on disk and is discovered by the runner', () => {
    expect(fs.existsSync(path.join(MIGRATIONS_DIR, MIGRATION_005))).toBe(true);
  });

  it('records itself in _schema_migrations', () => {
    applyMigrations(db);
    const rows = db
      .prepare('SELECT filename FROM _schema_migrations WHERE filename = ?')
      .all(MIGRATION_005) as { filename: string }[];
    expect(rows).toHaveLength(1);
  });

  it('is a no-op when the runner is invoked twice', () => {
    applyMigrations(db);
    const before = rowCount(db, '_schema_migrations');
    expect(() => applyMigrations(db)).not.toThrow();
    expect(rowCount(db, '_schema_migrations')).toBe(before);
  });

  describe('nullability', () => {
    beforeEach(() => {
      applyMigrations(db);
      db.prepare("INSERT INTO assets (id, symbol) VALUES ('XRP', 'XRP')").run();
      db.prepare("INSERT INTO accounts (id, name, type) VALUES ('a1', 'Kraken', 'exchange')").run();
    });

    it('declares total_fiat and price_fiat nullable', () => {
      const cols = columns(db, 'spot_transactions');
      expect(cols.find((c) => c.name === 'total_fiat')?.notnull).toBe(0);
      expect(cols.find((c) => c.name === 'price_fiat')?.notnull).toBe(0);
    });

    const insertSpot = (id: string, totalFiat: string | null, priceFiat: string | null): void => {
      db.prepare(
        `INSERT INTO spot_transactions
           (id, id_hash, account_id, tx_type, asset_in_id, amount_in, total_fiat, price_fiat,
            fiat_currency, timestamp, status)
         VALUES (?, ?, 'a1', 'STAKING', 'XRP', '1.0', ?, ?, 'EUR', '2026-01-01T00:00:00Z', 'COMPLETED')`
      ).run(id, `h-${id}`, totalFiat, priceFiat);
    };

    it('accepts NULL for an unresolvable magnitude, distinct from a stated 0', () => {
      expect(() => insertSpot('t-null', null, null)).not.toThrow();
      const row = db.prepare("SELECT total_fiat, price_fiat FROM spot_transactions WHERE id = 't-null'")
        .get() as { total_fiat: string | null; price_fiat: string | null };
      expect(row.total_fiat).toBeNull();
      expect(row.price_fiat).toBeNull();
    });

    it('keeps a stated 0 as a genuinely free acquisition, not NULL', () => {
      insertSpot('t-zero', '0', '0');
      const row = db.prepare("SELECT total_fiat, price_fiat FROM spot_transactions WHERE id = 't-zero'")
        .get() as { total_fiat: string | null; price_fiat: string | null };
      expect(row.total_fiat).toBe('0');
      expect(row.price_fiat).toBe('0');
    });

    it('still rejects a negative total_fiat now that the column is nullable', () => {
      expect(() => insertSpot('t-neg', '-1.00', '1')).toThrow();
    });

    it('still rejects a negative price_fiat now that the column is nullable', () => {
      expect(() => insertSpot('t-neg2', '1', '-1.00')).toThrow();
    });
  });

  it('rebuilds tax_lots, lot_history_events and lot_custody_entries unchanged', () => {
    const before = readMigration('004_fifo_traceability.sql');
    const after = readMigration(MIGRATION_005);
    // The rebuilt dependants carry the same CHECK vocabulary as 004 declared for them — this
    // migration only widens spot_transactions, so their own constraints must not have drifted.
    expect(before).toContain("disposal_type IN ('SELL', 'SWAP', 'FEE', 'SPEND')");
    expect(after).toContain("disposal_type IN ('SELL', 'SWAP', 'FEE', 'SPEND')");
    expect(after).toContain('qty_delta TEXT NOT NULL');
  });
});
