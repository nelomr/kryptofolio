/**
 * migration_004_fifo_traceability — Verifies the clean-slate schema migration.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { applyMigrations, readMigration, MIGRATIONS_DIR } from '../helpers/migrations.js';

const MIGRATION_004 = '004_fifo_traceability.sql';

interface ColumnInfo {
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
}

function columns(db: DatabaseSync, table: string): ColumnInfo[] {
  return db.prepare(`PRAGMA table_info(${table})`).all() as unknown as ColumnInfo[];
}

function columnNames(db: DatabaseSync, table: string): string[] {
  return columns(db, table).map((c) => c.name);
}

function tableExists(db: DatabaseSync, name: string): boolean {
  const rows = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .all(name) as { name: string }[];
  return rows.length > 0;
}

function objectExists(db: DatabaseSync, type: string, name: string): boolean {
  const rows = db
    .prepare('SELECT name FROM sqlite_master WHERE type = ? AND name = ?')
    .all(type, name) as { name: string }[];
  return rows.length > 0;
}

function rowCount(db: DatabaseSync, table: string): number {
  const row = db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number };
  return row.c;
}

/** Seeds the exact defects measured in baseline.md, so the purge has something real to remove. */
function seedBaselineDefects(db: DatabaseSync): void {
  db.prepare("INSERT INTO assets (id, symbol) VALUES ('XRP', 'XRP')").run();
  db.prepare("INSERT INTO assets (id, symbol) VALUES ('EUR', 'EUR')").run();
  db.prepare("INSERT INTO accounts (id, name, type) VALUES ('acc-1', 'Kraken', 'exchange')").run();
  db.prepare(
    `INSERT INTO spot_transactions
       (id, id_hash, account_id, tx_type, asset_in_id, amount_in, total_fiat, price_fiat,
        fiat_currency, timestamp, status)
     VALUES ('tx-1', 'h-1', 'acc-1', 'BUY', 'XRP', '179.11', '-300.00', '1.6724',
             'EUR', '2025-12-15T10:00:00Z', 'COMPLETED')`
  ).run();
  db.prepare(
    `INSERT INTO tax_lots
       (id, spot_transaction_id, asset_id, account_id, original_qty, remaining_qty,
        unit_cost_fiat, total_cost_fiat, fiat_currency, acquisition_timestamp,
        exchange_location, status)
     VALUES ('lot-1', 'tx-1', 'XRP', 'acc-1', '179.11', '179.11', '-1.6724', '-300.00',
             'EUR', '2025-12-15T10:00:00Z', 'Kraken', 'OPEN')`
  ).run();
  db.prepare("INSERT INTO user_settings (key, value) VALUES ('base_currency', 'EUR')").run();
}

describe('004_fifo_traceability migration', () => {
  let dbPath: string;
  let db: DatabaseSync;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `test_mig004_${process.pid}_${Date.now()}_${Math.random()}.db`);
    db = new DatabaseSync(dbPath);
    db.exec('PRAGMA foreign_keys = ON;');
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  it('exists on disk and is discovered by the runner', () => {
    expect(fs.existsSync(path.join(MIGRATIONS_DIR, MIGRATION_004))).toBe(true);
  });

  it('records itself in _schema_migrations', () => {
    applyMigrations(db);
    const rows = db
      .prepare('SELECT filename FROM _schema_migrations WHERE filename = ?')
      .all(MIGRATION_004) as { filename: string }[];
    expect(rows).toHaveLength(1);
  });

  it('is a no-op when the runner is invoked twice', () => {
    applyMigrations(db);
    const before = rowCount(db, '_schema_migrations');
    expect(() => applyMigrations(db)).not.toThrow();
    expect(rowCount(db, '_schema_migrations')).toBe(before);
  });

  describe('additive columns', () => {
    beforeEach(() => applyMigrations(db));

    it('adds assets.is_fiat defaulting to non-fiat', () => {
      expect(columnNames(db, 'assets')).toContain('is_fiat');
      db.prepare("INSERT INTO assets (id, symbol) VALUES ('SOL', 'SOL')").run();
      const row = db.prepare("SELECT is_fiat FROM assets WHERE id = 'SOL'").get() as {
        is_fiat: number;
      };
      expect(row.is_fiat).toBe(0);
    });

    it('adds the account hierarchy and synthetic marker columns', () => {
      const cols = columnNames(db, 'accounts');
      expect(cols).toContain('parent_account_id');
      expect(cols).toContain('is_synthetic');
    });

    it('indexes parent_account_id', () => {
      expect(objectExists(db, 'index', 'idx_accounts_parent')).toBe(true);
    });

    it('adds disposal_type and a SEPARATE quality_flag to lot_history_events', () => {
      const cols = columnNames(db, 'lot_history_events');
      expect(cols).toContain('disposal_type');
      expect(cols).toContain('quality_flag');
      // The pre-existing fiscal-classification column must survive untouched: WALLET_ACTIVATION
      // drives the AEAT audit trail.
      expect(cols).toContain('flag');
    });

    it('allows an unknown sale price to be stored as NULL', () => {
      // Non-nullable proceeds are why COALESCE(price, 1.0) existed in the SQL.
      const saleCol = columns(db, 'lot_history_events').find((c) => c.name === 'sale_price_fiat');
      expect(saleCol?.notnull).toBe(0);
      const gainCol = columns(db, 'lot_history_events').find((c) => c.name === 'gain_loss_fiat');
      expect(gainCol?.notnull).toBe(0);
    });
  });

  describe('new tables', () => {
    beforeEach(() => applyMigrations(db));

    it('creates lot_custody_entries, manual_price_overrides and transfer_destination_overrides', () => {
      expect(tableExists(db, 'lot_custody_entries')).toBe(true);
      expect(tableExists(db, 'manual_price_overrides')).toBe(true);
      expect(tableExists(db, 'transfer_destination_overrides')).toBe(true);
    });

    it('declares every new table STRICT', () => {
      const rows = db
        .prepare(
          `SELECT name, sql FROM sqlite_master WHERE type = 'table'
             AND name IN ('lot_custody_entries','manual_price_overrides','transfer_destination_overrides')`
        )
        .all() as { name: string; sql: string }[];
      expect(rows).toHaveLength(3);
      for (const row of rows) {
        expect(row.sql.toUpperCase(), `${row.name} must be STRICT`).toContain('STRICT');
      }
    });

    it('keys both override tables on the deterministic transaction identity', () => {
      expect(columnNames(db, 'manual_price_overrides')).toContain('id_hash');
      expect(columnNames(db, 'transfer_destination_overrides')).toContain('id_hash');
    });

    it('requires a currency on a manual price override', () => {
      const col = columns(db, 'manual_price_overrides').find((c) => c.name === 'fiat_currency');
      expect(col?.notnull).toBe(1);
    });
  });

  describe('constraints', () => {
    beforeEach(() => {
      applyMigrations(db);
      db.prepare("INSERT INTO assets (id, symbol) VALUES ('XRP', 'XRP')").run();
      db.prepare("INSERT INTO accounts (id, name, type) VALUES ('a1', 'Kraken', 'exchange')").run();
      db.prepare("INSERT INTO accounts (id, name, type) VALUES ('a2', 'Ledger', 'wallet')").run();
    });

    const insertSpot = (totalFiat: string, priceFiat = '1.00'): void => {
      db.prepare(
        `INSERT INTO spot_transactions
           (id, id_hash, account_id, tx_type, asset_in_id, amount_in, total_fiat, price_fiat,
            fiat_currency, timestamp, status)
         VALUES ('t-${totalFiat}', 'h-${totalFiat}', 'a1', 'BUY', 'XRP', '1.0', ?, ?, 'EUR',
                 '2026-01-01T00:00:00Z', 'COMPLETED')`
      ).run(totalFiat, priceFiat);
    };

    it('rejects the negative total_fiat the Kraken path used to persist', () => {
      expect(() => insertSpot('-299.70')).toThrow();
    });

    it('accepts the same value as a magnitude', () => {
      expect(() => insertSpot('299.70')).not.toThrow();
    });

    it('rejects a negative unit cost basis on a tax lot', () => {
      insertSpot('300.00');
      expect(() =>
        db
          .prepare(
            `INSERT INTO tax_lots
               (id, spot_transaction_id, asset_id, account_id, original_qty, remaining_qty,
                unit_cost_fiat, total_cost_fiat, fiat_currency, acquisition_timestamp,
                exchange_location, status)
             VALUES ('l1', 't-300.00', 'XRP', 'a1', '179.11', '179.11', '-1.6724', '300.00',
                     'EUR', '2026-01-01T00:00:00Z', 'Kraken', 'OPEN')`
          )
          .run()
      ).toThrow();
    });

    it('permits a negative qty_delta, which is a genuine direction', () => {
      insertSpot('300.00');
      db.prepare(
        `INSERT INTO tax_lots
           (id, spot_transaction_id, asset_id, account_id, original_qty, remaining_qty,
            unit_cost_fiat, total_cost_fiat, fiat_currency, acquisition_timestamp,
            exchange_location, status)
         VALUES ('l1', 't-300.00', 'XRP', 'a1', '179.11', '179.11', '1.6724', '300.00',
                 'EUR', '2026-01-01T00:00:00Z', 'Kraken', 'OPEN')`
      ).run();
      expect(() =>
        db
          .prepare(
            `INSERT INTO lot_custody_entries
               (id, tax_lot_id, asset_id, account_id, qty_delta, occurred_at, spot_transaction_id)
             VALUES ('ce1', 'l1', 'XRP', 'a1', '-179.11', '2026-01-02T00:00:00Z', 't-300.00')`
          )
          .run()
      ).not.toThrow();
    });

    it('rejects a self-parenting account', () => {
      expect(() =>
        db
          .prepare("UPDATE accounts SET parent_account_id = 'a1' WHERE id = 'a1'")
          .run()
      ).toThrow();
    });

    it('rejects a self-referential destination override', () => {
      insertSpot('300.00');
      expect(() =>
        db
          .prepare(
            `INSERT INTO transfer_destination_overrides (id_hash, counterparty_account_id)
             VALUES ('h-300.00', 'a1')`
          )
          .run()
      ).toThrow();
    });

    it('rejects an invalid disposal_type', () => {
      insertSpot('300.00');
      db.prepare(
        `INSERT INTO tax_lots
           (id, spot_transaction_id, asset_id, account_id, original_qty, remaining_qty,
            unit_cost_fiat, total_cost_fiat, fiat_currency, acquisition_timestamp,
            exchange_location, status)
         VALUES ('l1', 't-300.00', 'XRP', 'a1', '1', '1', '1', '1', 'EUR',
                 '2026-01-01T00:00:00Z', 'Kraken', 'OPEN')`
      ).run();
      expect(() =>
        db
          .prepare(
            `INSERT INTO lot_history_events
               (id, tax_lot_id, spot_transaction_id, account_id, amount_from_lot,
                sale_price_fiat, gain_loss_fiat, fiat_currency, is_taxable, disposal_type,
                disposal_date)
             VALUES ('e1', 'l1', 't-300.00', 'a1', '1', '1', '0', 'EUR', 1, 'TRANSFER',
                     '2026-01-02T00:00:00Z')`
          )
          .run()
      ).toThrow();
    });

    it('rejects a quality_flag outside the canonical vocabulary', () => {
      insertSpot('300.00');
      db.prepare(
        `INSERT INTO tax_lots
           (id, spot_transaction_id, asset_id, account_id, original_qty, remaining_qty,
            unit_cost_fiat, total_cost_fiat, fiat_currency, acquisition_timestamp,
            exchange_location, status)
         VALUES ('l1', 't-300.00', 'XRP', 'a1', '1', '1', '1', '1', 'EUR',
                 '2026-01-01T00:00:00Z', 'Kraken', 'OPEN')`
      ).run();
      expect(() =>
        db
          .prepare(
            `INSERT INTO lot_history_events
               (id, tax_lot_id, spot_transaction_id, account_id, amount_from_lot,
                sale_price_fiat, gain_loss_fiat, fiat_currency, is_taxable, disposal_type,
                quality_flag, disposal_date)
             VALUES ('e1', 'l1', 't-300.00', 'a1', '1', '1', '0', 'EUR', 1, 'SELL',
                     'SOMETHING_ELSE', '2026-01-02T00:00:00Z')`
          )
          .run()
      ).toThrow();
    });

    it('accepts a fiscal classification and a data-quality defect on the same event', () => {
      insertSpot('300.00');
      db.prepare(
        `INSERT INTO tax_lots
           (id, spot_transaction_id, asset_id, account_id, original_qty, remaining_qty,
            unit_cost_fiat, total_cost_fiat, fiat_currency, acquisition_timestamp,
            exchange_location, status)
         VALUES ('l1', 't-300.00', 'XRP', 'a1', '1', '1', '1', '1', 'EUR',
                 '2026-01-01T00:00:00Z', 'Kraken', 'OPEN')`
      ).run();
      expect(() =>
        db
          .prepare(
            `INSERT INTO lot_history_events
               (id, tax_lot_id, spot_transaction_id, account_id, amount_from_lot,
                sale_price_fiat, gain_loss_fiat, fiat_currency, is_taxable, disposal_type,
                flag, quality_flag, disposal_date)
             VALUES ('e1', 'l1', 't-300.00', 'a1', '1', NULL, NULL, 'EUR', 0, 'FEE',
                     'WALLET_ACTIVATION', 'MISSING_PRICE', '2026-01-02T00:00:00Z')`
          )
          .run()
      ).not.toThrow();
    });
  });

  describe('clean-slate purge', () => {
    it('empties transactional and derived tables while preserving settings', () => {
      // Apply 001-003 only, seed the real defects, then let 004 purge them.
      db.exec(`
        CREATE TABLE IF NOT EXISTS _schema_migrations (
            filename TEXT PRIMARY KEY,
            applied_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
        );
      `);
      for (const f of ['001_vault_schema.sql', '002_ledger_schema.sql', '003_currency_schema.sql']) {
        db.exec(readMigration(f));
        db.prepare('INSERT INTO _schema_migrations (filename) VALUES (?)').run(f);
      }
      seedBaselineDefects(db);
      expect(rowCount(db, 'spot_transactions')).toBe(1);
      expect(rowCount(db, 'tax_lots')).toBe(1);

      applyMigrations(db);

      expect(rowCount(db, 'spot_transactions')).toBe(0);
      expect(rowCount(db, 'futures_transactions')).toBe(0);
      expect(rowCount(db, 'tax_lots')).toBe(0);
      expect(rowCount(db, 'lot_history_events')).toBe(0);
      expect(rowCount(db, 'lot_custody_entries')).toBe(0);

      // Settings and migration history survive.
      const setting = db
        .prepare("SELECT value FROM user_settings WHERE key = 'base_currency'")
        .get() as { value: string } | undefined;
      expect(setting?.value).toBe('EUR');
      expect(rowCount(db, '_schema_migrations')).toBeGreaterThanOrEqual(4);
    });

    it('does not write the pending-recalculation flag into the ledger', () => {
      // The flag belongs to the settings database. A copy here is unreachable by the code that
      // reads it, so the application would boot believing its derived tables were current.
      applyMigrations(db);
      const row = db
        .prepare("SELECT value FROM user_settings WHERE key = 'needs_recalculation'")
        .get() as { value: string } | undefined;
      expect(row).toBeUndefined();
    });

    it('declares no user_settings table of its own', () => {
      expect(readMigration('004_fifo_traceability.sql')).not.toMatch(
        /CREATE\s+TABLE[^;]*\buser_settings\b/i
      );
    });

    it('seeds is_fiat for recognised ISO-4217 symbols and leaves crypto alone', () => {
      // Assets must pre-exist for the migration's own UPDATE to classify them, so 001-003 are
      // applied first and the assets seeded before 004 runs. Extracting the seed statement out of
      // the file and re-executing it would test a string-split, not the migration.
      db.exec(`
        CREATE TABLE IF NOT EXISTS _schema_migrations (
            filename TEXT PRIMARY KEY,
            applied_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
        );
      `);
      for (const f of ['001_vault_schema.sql', '002_ledger_schema.sql', '003_currency_schema.sql']) {
        db.exec(readMigration(f));
        db.prepare('INSERT INTO _schema_migrations (filename) VALUES (?)').run(f);
      }
      db.prepare("INSERT INTO assets (id, symbol) VALUES ('EUR', 'EUR')").run();
      db.prepare("INSERT INTO assets (id, symbol) VALUES ('USDT', 'USDT')").run();
      db.prepare("INSERT INTO assets (id, symbol) VALUES ('XRP', 'XRP')").run();

      applyMigrations(db);

      const isFiat = (id: string): number =>
        (db.prepare('SELECT is_fiat FROM assets WHERE id = ?').get(id) as { is_fiat: number })
          .is_fiat;

      expect(isFiat('EUR')).toBe(1);
      // A stablecoin is NOT fiat: its disposals are taxable and it must stay inside FIFO.
      expect(isFiat('USDT')).toBe(0);
      expect(isFiat('XRP')).toBe(0);
    });

    it('does not pre-seed any synthetic account', () => {
      applyMigrations(db);
      const rows = db
        .prepare("SELECT id FROM accounts WHERE is_synthetic = 1")
        .all() as { id: string }[];
      expect(rows).toEqual([]);
    });
  });

  describe('active views and audit triggers cover every new table', () => {
    beforeEach(() => applyMigrations(db));

    const NEW_TABLES = [
      'lot_custody_entries',
      'manual_price_overrides',
      'transfer_destination_overrides',
    ];

    it('exposes a v_active_* view per new table', () => {
      for (const table of NEW_TABLES) {
        expect(objectExists(db, 'view', `v_active_${table}`), `v_active_${table}`).toBe(true);
      }
    });

    it('attaches an AFTER UPDATE audit trigger per new table', () => {
      const triggers = (
        db.prepare("SELECT name, tbl_name FROM sqlite_master WHERE type = 'trigger'").all() as {
          name: string;
          tbl_name: string;
        }[]
      ).map((t) => t.tbl_name);
      for (const table of NEW_TABLES) {
        expect(triggers, `audit trigger for ${table}`).toContain(table);
      }
    });
  });

  /**
   * Regression tests for a PRE-EXISTING defect in 002, discovered while seeding `is_fiat`.
   *
   * `trg_assets_updated_at` and `trg_accounts_updated_at` were
   *     BEFORE UPDATE ... SELECT RAISE(IGNORE) WHERE NEW.updated_at = OLD.updated_at
   * whose documented intent was "BEFORE UPDATE sets updated_at on NEW". A BEFORE trigger cannot
   * assign to NEW in SQLite, so instead of maintaining the column it ABORTED the row update.
   * Because `datetime('now','utc')` has one-second resolution, that included any update made in the
   * same second as the previous one — and any update that simply did not mention `updated_at`.
   *
   * Consequence: `UPDATE accounts SET deleted_at = ...` reported success and changed nothing,
   * silently breaking the project's non-destructive deletion policy for these two tables.
   */
  describe('regression: updates on assets and accounts are no longer silently discarded', () => {
    beforeEach(() => {
      applyMigrations(db);
      db.prepare("INSERT INTO assets (id, symbol) VALUES ('XRP', 'XRP')").run();
      db.prepare("INSERT INTO accounts (id, name, type) VALUES ('a1', 'Kraken', 'exchange')").run();
    });

    it('applies a soft delete on an account', () => {
      const res = db
        .prepare("UPDATE accounts SET deleted_at = datetime('now', 'utc') WHERE id = 'a1'")
        .run();
      expect(Number(res.changes)).toBe(1);
      const row = db.prepare("SELECT deleted_at FROM accounts WHERE id = 'a1'").get() as {
        deleted_at: string | null;
      };
      expect(row.deleted_at).not.toBeNull();
    });

    it('applies a soft delete on an asset', () => {
      const res = db
        .prepare("UPDATE assets SET deleted_at = datetime('now', 'utc') WHERE id = 'XRP'")
        .run();
      expect(Number(res.changes)).toBe(1);
    });

    it('applies a field update that does not mention updated_at', () => {
      const res = db.prepare("UPDATE assets SET name = 'Ripple' WHERE id = 'XRP'").run();
      expect(Number(res.changes)).toBe(1);
      const row = db.prepare("SELECT name FROM assets WHERE id = 'XRP'").get() as {
        name: string | null;
      };
      expect(row.name).toBe('Ripple');
    });

    it('still maintains updated_at automatically', () => {
      const before = (
        db.prepare("SELECT updated_at FROM assets WHERE id = 'XRP'").get() as {
          updated_at: string;
        }
      ).updated_at;
      db.prepare("UPDATE assets SET name = 'Ripple' WHERE id = 'XRP'").run();
      const after = (
        db.prepare("SELECT updated_at FROM assets WHERE id = 'XRP'").get() as {
          updated_at: string;
        }
      ).updated_at;
      expect(after).not.toBe(before);
    });

    it('records the update in the audit log', () => {
      db.prepare("UPDATE assets SET name = 'Ripple' WHERE id = 'XRP'").run();
      const rows = db
        .prepare("SELECT record_id FROM audit_log WHERE table_name = 'assets'")
        .all() as { record_id: string }[];
      expect(rows.length).toBeGreaterThan(0);
    });
  });

  describe('what the migration deliberately does NOT contain', () => {
    /**
     * Comments must be stripped before asserting on content. The migration's own header *explains*
     * that it carries no `ABS()` repair, so a naive substring check matches the documentation and
     * fails — a false positive that would have forced the explanation to be deleted rather than the
     * code to be correct.
     */
    const executableSql = readMigration(MIGRATION_004)
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n');

    it('carries no ABS() repair of existing fiat values', () => {
      // Repair would be complexity in service of data that is purged and re-ingested anyway.
      expect(executableSql.toUpperCase()).not.toContain('ABS(');
    });

    it('carries no heuristic disposal_type backfill', () => {
      // Backfilling a WITHDRAWAL-derived event as 'SELL' would invent provenance.
      expect(executableSql).not.toMatch(/UPDATE\s+lot_history_events\s+SET\s+disposal_type/i);
    });
  });
});
