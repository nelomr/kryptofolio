/**
 * migration_006_fx_conversion_provenance — Verifies the two derived tables accept the widened flag
 * and provenance vocabularies and can record the rate a converted figure used.
 *
 * The `MARKET_CONVERTED` case is asserted against migration `005`'s definition as well as `006`'s,
 * because a CHECK that already accepted the value would make the widening untestable — the point of
 * a vocabulary constraint is that yesterday's schema refused what today's admits.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { applyMigrations, readMigration, MIGRATIONS_DIR } from '../helpers/migrations.js';

const MIGRATION_006 = '006_fx_conversion_provenance.sql';

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

function seedReferences(db: DatabaseSync): void {
  db.prepare("INSERT INTO assets (id, symbol) VALUES ('XRP', 'XRP')").run();
  db.prepare("INSERT INTO accounts (id, name, type) VALUES ('a1', 'Kraken', 'exchange')").run();
  db.prepare(
    `INSERT INTO spot_transactions
       (id, id_hash, account_id, tx_type, asset_in_id, amount_in, fiat_currency, timestamp, status)
     VALUES ('tx1', 'h-tx1', 'a1', 'STAKING', 'XRP', '1.0', 'EUR', '2026-01-01T00:00:00Z', 'COMPLETED')`
  ).run();
}

interface LotOverrides {
  readonly qualityFlag?: string | null;
  readonly provenance?: string;
  readonly fxRate?: string | null;
  readonly fxRateDate?: string | null;
}

function insertLot(db: DatabaseSync, id: string, o: LotOverrides = {}): void {
  db.prepare(
    `INSERT INTO tax_lots
       (id, spot_transaction_id, asset_id, account_id, original_qty, remaining_qty,
        unit_cost_fiat, total_cost_fiat, fiat_currency, acquisition_timestamp,
        exchange_location, status, quality_flag, value_provenance, fx_rate, fx_rate_date)
     VALUES (?, 'tx1', 'XRP', 'a1', '1.0', '1.0', '0.5', '0.5', 'EUR',
             '2026-01-01T00:00:00Z', 'Kraken', 'OPEN', ?, ?, ?, ?)`
  ).run(
    id,
    o.qualityFlag ?? null,
    o.provenance ?? 'MARKET',
    o.fxRate ?? null,
    o.fxRateDate ?? null
  );
}

function insertDisposal(db: DatabaseSync, id: string, o: LotOverrides = {}): void {
  db.prepare(
    `INSERT INTO lot_history_events
       (id, tax_lot_id, spot_transaction_id, account_id, amount_from_lot, sale_price_fiat,
        gain_loss_fiat, fiat_currency, is_taxable, disposal_type, quality_flag,
        value_provenance, fx_rate, fx_rate_date, disposal_date)
     VALUES (?, 'lot1', 'tx1', 'a1', '1.0', '1.0', '0.5', 'EUR', 1, 'SELL', ?, ?, ?, ?,
             '2026-02-01T00:00:00Z')`
  ).run(
    id,
    o.qualityFlag ?? null,
    o.provenance ?? 'MARKET',
    o.fxRate ?? null,
    o.fxRateDate ?? null
  );
}

describe('006_fx_conversion_provenance migration', () => {
  let dbPath: string;
  let db: DatabaseSync;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `test_mig006_${process.pid}_${Date.now()}_${Math.random()}.db`);
    db = new DatabaseSync(dbPath);
    db.exec('PRAGMA foreign_keys = ON;');
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  it('exists on disk and is discovered by the runner', () => {
    expect(fs.existsSync(path.join(MIGRATIONS_DIR, MIGRATION_006))).toBe(true);
  });

  it('records itself in _schema_migrations', () => {
    applyMigrations(db);
    const rows = db
      .prepare('SELECT filename FROM _schema_migrations WHERE filename = ?')
      .all(MIGRATION_006) as { filename: string }[];
    expect(rows).toHaveLength(1);
  });

  it('is a no-op when the runner is invoked twice', () => {
    applyMigrations(db);
    const before = rowCount(db, '_schema_migrations');
    expect(applyMigrations(db)).toEqual([]);
    expect(rowCount(db, '_schema_migrations')).toBe(before);
  });

  describe('widened vocabularies', () => {
    beforeEach(() => {
      applyMigrations(db);
      seedReferences(db);
    });

    it('accepts MISSING_FX_RATE on a lot', () => {
      expect(() => insertLot(db, 'lot1', { qualityFlag: 'MISSING_FX_RATE' })).not.toThrow();
    });

    it('accepts MISSING_FX_RATE on a disposal', () => {
      insertLot(db, 'lot1');
      expect(() => insertDisposal(db, 'e1', { qualityFlag: 'MISSING_FX_RATE' })).not.toThrow();
    });

    it('still rejects a flag outside the vocabulary', () => {
      expect(() => insertLot(db, 'lot1', { qualityFlag: 'MISSING_FX_RATES' })).toThrow();
    });

    it('accepts MARKET_CONVERTED provenance on both tables', () => {
      const converted = {
        provenance: 'MARKET_CONVERTED',
        fxRate: '0.918695',
        fxRateDate: '2024-11-01',
      } as const;
      expect(() => insertLot(db, 'lot1', converted)).not.toThrow();
      expect(() => insertDisposal(db, 'e1', converted)).not.toThrow();
    });

    it('still rejects a provenance outside the vocabulary', () => {
      expect(() => insertLot(db, 'lot1', { provenance: 'CONVERTED' })).toThrow();
    });
  });

  describe('rate columns', () => {
    beforeEach(() => {
      applyMigrations(db);
      seedReferences(db);
    });

    it('declares fx_rate and fx_rate_date nullable on both tables', () => {
      for (const table of ['tax_lots', 'lot_history_events']) {
        const cols = columns(db, table);
        expect(cols.find((c) => c.name === 'fx_rate')?.notnull, table).toBe(0);
        expect(cols.find((c) => c.name === 'fx_rate_date')?.notnull, table).toBe(0);
      }
    });

    it('records the rate and its date for a converted figure', () => {
      insertLot(db, 'lot1', {
        provenance: 'MARKET_CONVERTED',
        fxRate: '0.918695',
        fxRateDate: '2024-11-01',
      });
      const row = db.prepare("SELECT fx_rate, fx_rate_date FROM tax_lots WHERE id = 'lot1'").get() as {
        fx_rate: string | null;
        fx_rate_date: string | null;
      };
      expect(row.fx_rate).toBe('0.918695');
      expect(row.fx_rate_date).toBe('2024-11-01');
    });

    it('leaves both NULL for an unconverted figure', () => {
      insertLot(db, 'lot1');
      const row = db.prepare("SELECT fx_rate, fx_rate_date FROM tax_lots WHERE id = 'lot1'").get() as {
        fx_rate: string | null;
        fx_rate_date: string | null;
      };
      expect(row.fx_rate).toBeNull();
      expect(row.fx_rate_date).toBeNull();
    });

    it('rejects a non-numeric rate', () => {
      expect(() => insertLot(db, 'lot1', { fxRate: 'ECB' })).toThrow();
    });

    it('rejects a negative rate — a rate is a positive multiplier or it is absent', () => {
      expect(() => insertLot(db, 'lot1', { fxRate: '-0.9' })).toThrow();
    });

    it('rejects a zero rate, which would silently zero every converted figure', () => {
      expect(() => insertLot(db, 'lot1', { fxRate: '0' })).toThrow();
    });

    it('rejects a rate without its date, which could not be audited', () => {
      expect(() => insertLot(db, 'lot1', { fxRate: '0.918695' })).toThrow();
    });

    it('rejects a date without its rate, which states nothing', () => {
      expect(() => insertLot(db, 'lot1', { fxRateDate: '2024-11-01' })).toThrow();
    });

    it('rejects MARKET_CONVERTED with no rate to show for it', () => {
      expect(() => insertLot(db, 'lot1', { provenance: 'MARKET_CONVERTED' })).toThrow();
      expect(() =>
        insertLot(db, 'lot2', {
          provenance: 'MARKET_CONVERTED',
          fxRate: '0.918695',
          fxRateDate: '2024-11-01',
        })
      ).not.toThrow();
    });
  });

  describe('the previous schema refused what this one admits', () => {
    // Proves the CHECK is load-bearing rather than permissive: without this, every acceptance
    // assertion above would pass on the unmigrated schema too.
    it('rejects MARKET_CONVERTED and MISSING_FX_RATE at migration 005', () => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS _schema_migrations (
            filename TEXT PRIMARY KEY,
            applied_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
        );
      `);
      for (const file of ['001_vault_schema.sql', '002_ledger_schema.sql', '003_currency_schema.sql',
        '004_fifo_traceability.sql', '005_nullable_fiat_magnitudes.sql']) {
        db.exec(readMigration(file));
        db.prepare('INSERT INTO _schema_migrations (filename) VALUES (?)').run(file);
      }
      seedReferences(db);

      const insertAt005 = (provenance: string, flag: string | null): void => {
        db.prepare(
          `INSERT INTO tax_lots
             (id, spot_transaction_id, asset_id, account_id, original_qty, remaining_qty,
              unit_cost_fiat, total_cost_fiat, fiat_currency, acquisition_timestamp,
              exchange_location, status, quality_flag, value_provenance)
           VALUES ('lot-pre', 'tx1', 'XRP', 'a1', '1.0', '1.0', '0.5', '0.5', 'EUR',
                   '2026-01-01T00:00:00Z', 'Kraken', 'OPEN', ?, ?)`
        ).run(flag, provenance);
      };

      expect(() => insertAt005('MARKET_CONVERTED', null)).toThrow();
      expect(() => insertAt005('MARKET', 'MISSING_FX_RATE')).toThrow();

      // …and admits them once 006 has run against the same database.
      applyMigrations(db);
      expect(() => insertLot(db, 'lot1', {
        provenance: 'MARKET_CONVERTED',
        qualityFlag: 'MISSING_FX_RATE',
        fxRate: '0.918695',
        fxRateDate: '2024-11-01',
      })).not.toThrow();
    });
  });
});
