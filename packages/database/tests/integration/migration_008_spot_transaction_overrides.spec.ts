/**
 * migration_008_spot_transaction_overrides — creates `spot_transaction_overrides`, adds the
 * missing `AFTER INSERT` audit trigger to it and to `transfer_destination_overrides`, and folds
 * `manual_price_overrides` into the new table (design.md D2/D3).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { applyMigrations, MIGRATIONS_DIR } from '../helpers/migrations.js';

const MIGRATION_008 = '008_spot_transaction_overrides.sql';

interface CheckRow {
  sql: string;
}

function tableSql(db: DatabaseSync, table: string): string {
  const row = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(table) as CheckRow | undefined;
  return row?.sql ?? '';
}

function seedAccount(db: DatabaseSync, id = 'a1'): void {
  db.prepare(`INSERT INTO accounts (id, name, type) VALUES ('${id}', 'Kraken', 'exchange')`).run();
}

function seedAsset(db: DatabaseSync, id = 'BTC'): void {
  db.prepare(
    `INSERT OR IGNORE INTO assets (id, symbol, name) VALUES (?, ?, ?)`
  ).run(id, id, id);
}

function seedSpotTransaction(db: DatabaseSync, idHash: string, accountId = 'a1'): void {
  db.prepare(
    `INSERT INTO spot_transactions
       (id, id_hash, account_id, tx_type, asset_in_id, amount_in, total_fiat, price_fiat, fiat_currency, timestamp, status)
     VALUES (?, ?, ?, 'BUY', 'BTC', '1.0', '100.0', '100.0', 'USD', '2024-01-01T00:00:00Z', 'COMPLETED')`
  ).run(`st-${idHash}`, idHash, accountId);
}

interface OverrideRow {
  id_hash: string;
  amount_in_edited?: number;
  amount_in?: string | null;
  amount_out_edited?: number;
  amount_out?: string | null;
  price_edited?: number;
  price_fiat?: string | null;
  total_fiat_edited?: number;
  total_fiat?: string | null;
  fiat_currency?: string | null;
  fee_kind?: string;
  fee_amount?: string | null;
  fee_asset_id?: string | null;
  timestamp_edited?: number;
  timestamp?: string | null;
  tx_type_edited?: number;
  tx_type?: string | null;
}

function insertOverride(db: DatabaseSync, overrides: OverrideRow): void {
  const row: Required<OverrideRow> = {
    amount_in_edited: 0,
    amount_in: null,
    amount_out_edited: 0,
    amount_out: null,
    price_edited: 0,
    price_fiat: null,
    total_fiat_edited: 0,
    total_fiat: null,
    fiat_currency: null,
    fee_kind: 'UNCHANGED',
    fee_amount: null,
    fee_asset_id: null,
    timestamp_edited: 0,
    timestamp: null,
    tx_type_edited: 0,
    tx_type: null,
    ...overrides,
  };
  db.prepare(
    `INSERT INTO spot_transaction_overrides
      (id_hash, amount_in_edited, amount_in, amount_out_edited, amount_out,
       price_edited, price_fiat, total_fiat_edited, total_fiat, fiat_currency,
       fee_kind, fee_amount, fee_asset_id, timestamp_edited, timestamp, tx_type_edited, tx_type)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    row.id_hash, row.amount_in_edited, row.amount_in, row.amount_out_edited, row.amount_out,
    row.price_edited, row.price_fiat, row.total_fiat_edited, row.total_fiat, row.fiat_currency,
    row.fee_kind, row.fee_amount, row.fee_asset_id, row.timestamp_edited, row.timestamp,
    row.tx_type_edited, row.tx_type,
  );
}

describe('008_spot_transaction_overrides migration', () => {
  let dbPath: string;
  let db: DatabaseSync;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `test_mig008_${process.pid}_${Date.now()}_${Math.random()}.db`);
    db = new DatabaseSync(dbPath);
    db.exec('PRAGMA foreign_keys = ON;');
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  it('exists on disk and is discovered by the runner', () => {
    expect(fs.existsSync(path.join(MIGRATIONS_DIR, MIGRATION_008))).toBe(true);
  });

  it('records itself in _schema_migrations and is a no-op on re-run', () => {
    applyMigrations(db);
    const rows = db
      .prepare('SELECT filename FROM _schema_migrations WHERE filename = ?')
      .all(MIGRATION_008) as { filename: string }[];
    expect(rows).toHaveLength(1);
    expect(applyMigrations(db)).toEqual([]);
  });

  describe('spot_transaction_overrides table', () => {
    beforeEach(() => {
      applyMigrations(db);
      seedAccount(db);
      seedAsset(db, 'BTC');
      seedSpotTransaction(db, 'hash-1');
    });

    it('is a STRICT table', () => {
      const sql = tableSql(db, 'spot_transaction_overrides');
      expect(sql).toMatch(/\)\s*STRICT/i);
    });

    it('rejects a row where nothing is edited', () => {
      expect(() => insertOverride(db, { id_hash: 'hash-1' })).toThrow();
    });

    it('accepts a row with one edited field', () => {
      expect(() =>
        insertOverride(db, {
          id_hash: 'hash-1', amount_in_edited: 1, amount_in: '2.0',
        })
      ).not.toThrow();
    });

    it('rejects CHARGED with a NULL fee_amount', () => {
      expect(() =>
        insertOverride(db, {
          id_hash: 'hash-1', fee_kind: 'CHARGED', fee_amount: null, fee_asset_id: 'BTC',
        })
      ).toThrow();
    });

    it('rejects CHARGED with a NULL fee_asset_id', () => {
      expect(() =>
        insertOverride(db, {
          id_hash: 'hash-1', fee_kind: 'CHARGED', fee_amount: '0.01', fee_asset_id: null,
        })
      ).toThrow();
    });

    it('accepts CHARGED with a stated zero fee, distinct from NONE', () => {
      expect(() =>
        insertOverride(db, {
          id_hash: 'hash-1', fee_kind: 'CHARGED', fee_amount: '0', fee_asset_id: 'BTC',
        })
      ).not.toThrow();
    });

    it('rejects NONE with a non-NULL fee_amount', () => {
      expect(() =>
        insertOverride(db, {
          id_hash: 'hash-1', fee_kind: 'NONE', fee_amount: '0.01', fee_asset_id: 'BTC',
        })
      ).toThrow();
    });

    it('rejects UNCHANGED with a non-NULL fee_asset_id', () => {
      expect(() =>
        insertOverride(db, {
          id_hash: 'hash-1', amount_in_edited: 1, amount_in: '1.0',
          fee_kind: 'UNCHANGED', fee_amount: null, fee_asset_id: 'BTC',
        })
      ).toThrow();
    });

    it('accepts total_fiat_edited = 1 with total_fiat NULL, distinguishable from unedited', () => {
      insertOverride(db, { id_hash: 'hash-1', total_fiat_edited: 1, total_fiat: null });
      const row = db
        .prepare('SELECT total_fiat_edited, total_fiat FROM spot_transaction_overrides WHERE id_hash = ?')
        .get('hash-1') as { total_fiat_edited: number; total_fiat: string | null };
      expect(row.total_fiat_edited).toBe(1);
      expect(row.total_fiat).toBeNull();
    });

    it('rejects a negative price_fiat', () => {
      expect(() =>
        insertOverride(db, { id_hash: 'hash-1', price_edited: 1, price_fiat: '-1.0', fiat_currency: 'USD' })
      ).toThrow();
    });

    it('has no FOREIGN KEY to spot_transactions and is keyed on id_hash', () => {
      const sql = tableSql(db, 'spot_transaction_overrides');
      expect(sql).not.toMatch(/REFERENCES\s+spot_transactions/i);
      // Survives even when the source row is gone.
      insertOverride(db, { id_hash: 'no-such-hash', amount_in_edited: 1, amount_in: '1.0' });
      const row = db
        .prepare('SELECT id_hash FROM spot_transaction_overrides WHERE id_hash = ?')
        .get('no-such-hash') as { id_hash: string };
      expect(row.id_hash).toBe('no-such-hash');
    });

    it('the tx_type CHECK list matches spot_transactions exactly', () => {
      const overridesSql = tableSql(db, 'spot_transaction_overrides');
      const ledgerSql = tableSql(db, 'spot_transactions');
      const extractList = (sql: string): string[] => {
        const match = sql.match(/(?<!_edited )\btx_type\b(?:\s+TEXT)?[^(]*?IN\s*\(([^)]*)\)/i);
        if (!match) throw new Error('tx_type CHECK not found');
        return match[1]
          .split(',')
          .map((s) => s.trim().replace(/'/g, ''))
          .sort();
      };
      expect(extractList(overridesSql)).toEqual(extractList(ledgerSql));
    });

    it('writes an AFTER INSERT audit_log row on first declaration', () => {
      insertOverride(db, { id_hash: 'hash-1', amount_in_edited: 1, amount_in: '1.0' });
      const rows = db
        .prepare("SELECT action FROM audit_log WHERE table_name = 'spot_transaction_overrides' AND record_id = 'hash-1'")
        .all() as { action: string }[];
      expect(rows.map((r) => r.action)).toContain('INSERT');
    });

    it('writes an AFTER UPDATE audit_log row on a subsequent change', () => {
      insertOverride(db, { id_hash: 'hash-1', amount_in_edited: 1, amount_in: '1.0' });
      db.prepare("UPDATE spot_transaction_overrides SET amount_in = '2.0' WHERE id_hash = 'hash-1'").run();
      const rows = db
        .prepare("SELECT action FROM audit_log WHERE table_name = 'spot_transaction_overrides' AND record_id = 'hash-1'")
        .all() as { action: string }[];
      expect(rows.map((r) => r.action)).toContain('UPDATE');
    });

    it('v_active_spot_transaction_overrides excludes soft-deleted rows', () => {
      insertOverride(db, { id_hash: 'hash-1', amount_in_edited: 1, amount_in: '1.0' });
      db.prepare("UPDATE spot_transaction_overrides SET deleted_at = '2024-06-01T00:00:00Z' WHERE id_hash = 'hash-1'").run();
      const active = db
        .prepare('SELECT * FROM v_active_spot_transaction_overrides WHERE id_hash = ?')
        .all('hash-1');
      expect(active).toHaveLength(0);
    });
  });

  describe('transfer_destination_overrides gains an AFTER INSERT audit trigger', () => {
    beforeEach(() => {
      applyMigrations(db);
      seedAccount(db, 'a1');
      seedAccount(db, 'a2');
      seedAsset(db, 'BTC');
      seedSpotTransaction(db, 'hash-td', 'a1');
    });

    it('audits the first declaration as action=INSERT', () => {
      db.prepare(
        "INSERT INTO transfer_destination_overrides (id_hash, counterparty_account_id) VALUES ('hash-td', 'a2')"
      ).run();
      const rows = db
        .prepare("SELECT action FROM audit_log WHERE table_name = 'transfer_destination_overrides' AND record_id = 'hash-td'")
        .all() as { action: string }[];
      expect(rows.map((r) => r.action)).toContain('INSERT');
    });

    it('still audits an UPDATE as before', () => {
      db.prepare(
        "INSERT INTO transfer_destination_overrides (id_hash, counterparty_account_id) VALUES ('hash-td', 'a2')"
      ).run();
      db.prepare("UPDATE transfer_destination_overrides SET note = 'x' WHERE id_hash = 'hash-td'").run();
      const rows = db
        .prepare("SELECT action FROM audit_log WHERE table_name = 'transfer_destination_overrides' AND record_id = 'hash-td'")
        .all() as { action: string }[];
      expect(rows.map((r) => r.action)).toContain('UPDATE');
    });

    it('still rejects a self-referential counterparty', () => {
      expect(() =>
        db.prepare(
          "INSERT INTO transfer_destination_overrides (id_hash, counterparty_account_id) VALUES ('hash-td', 'a1')"
        ).run()
      ).toThrow();
    });
  });

  describe('manual_price_overrides unification', () => {
    it('copies every row, including soft-deleted ones, preserving timestamps, then drops the old table', () => {
      // Apply only up to 007 to seed manual_price_overrides in the pre-migration shape.
      const filesBefore = fs
        .readdirSync(MIGRATIONS_DIR)
        .filter((f) => f.endsWith('.sql') && f <= '007_futures_collateral_movements.sql')
        .sort();
      for (const f of filesBefore) {
        db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf-8'));
      }
      seedAccount(db);
      seedAsset(db, 'BTC');
      seedSpotTransaction(db, 'hash-active');
      seedSpotTransaction(db, 'hash-deleted');

      db.prepare(
        `INSERT INTO manual_price_overrides (id_hash, price_fiat, fiat_currency, note, created_at, updated_at, deleted_at)
         VALUES ('hash-active', '42.5', 'EUR', 'active note', '2024-01-01T00:00:00.000Z', '2024-01-02T00:00:00.000Z', NULL)`
      ).run();
      db.prepare(
        `INSERT INTO manual_price_overrides (id_hash, price_fiat, fiat_currency, note, created_at, updated_at, deleted_at)
         VALUES ('hash-deleted', '10.0', 'USD', 'removed', '2024-02-01T00:00:00.000Z', '2024-02-02T00:00:00.000Z', '2024-02-03T00:00:00.000Z')`
      ).run();

      // Now apply the rest, including 008.
      const filesAfter = fs
        .readdirSync(MIGRATIONS_DIR)
        .filter((f) => f.endsWith('.sql') && f > '007_futures_collateral_movements.sql')
        .sort();
      for (const f of filesAfter) {
        db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf-8'));
      }

      const active = db
        .prepare('SELECT price_edited, price_fiat, fiat_currency, note, created_at, updated_at, deleted_at FROM spot_transaction_overrides WHERE id_hash = ?')
        .get('hash-active') as {
        price_edited: number; price_fiat: string; fiat_currency: string; note: string;
        created_at: string; updated_at: string; deleted_at: string | null;
      };
      expect(active.price_edited).toBe(1);
      expect(active.price_fiat).toBe('42.5');
      expect(active.fiat_currency).toBe('EUR');
      expect(active.created_at).toBe('2024-01-01T00:00:00.000Z');
      expect(active.deleted_at).toBeNull();

      const deleted = db
        .prepare('SELECT price_edited, deleted_at FROM spot_transaction_overrides WHERE id_hash = ?')
        .get('hash-deleted') as { price_edited: number; deleted_at: string | null };
      expect(deleted.price_edited).toBe(1);
      expect(deleted.deleted_at).toBe('2024-02-03T00:00:00.000Z');

      // manual_price_overrides is gone, along with its trigger and view.
      const table = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'manual_price_overrides'")
        .get();
      expect(table).toBeUndefined();
      const view = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'view' AND name = 'v_active_manual_price_overrides'")
        .get();
      expect(view).toBeUndefined();

      // The migration itself is audited as an INSERT.
      const migrationAudit = db
        .prepare("SELECT action FROM audit_log WHERE table_name = 'spot_transaction_overrides' AND record_id = 'hash-active'")
        .all() as { action: string }[];
      expect(migrationAudit.map((r) => r.action)).toContain('INSERT');
    });
  });
});
