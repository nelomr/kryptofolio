/**
 * migration_007_futures_collateral_movements — Verifies the new `collateral_movements` table exists
 * alongside, and does not disturb, `futures_transactions`.
 *
 * `futures_transactions` models position events (`tx_type` admits only `TRADE`, `FUNDING_FEE`,
 * `SETTLEMENT`, `LIQUIDATION`); a currency movement that funds or converts collateral is not a
 * position, so it gets a table of its own.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { applyMigrations, readMigration, MIGRATIONS_DIR } from '../helpers/migrations.js';

const MIGRATION_007 = '007_futures_collateral_movements.sql';

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

function seedAccount(db: DatabaseSync): void {
  db.prepare("INSERT INTO accounts (id, name, type) VALUES ('a1', 'Kraken Futures', 'exchange')").run();
}

interface MovementOverrides {
  readonly id?: string;
  readonly idHash?: string;
  readonly movementType?: string;
  readonly currency?: string;
  readonly amount?: string | null;
  readonly spreadPct?: string | null;
  readonly occurredAt?: string;
}

function insertMovement(db: DatabaseSync, o: MovementOverrides = {}): void {
  db.prepare(
    `INSERT INTO collateral_movements
       (id, id_hash, account_id, movement_type, currency, amount, spread_pct, occurred_at)
     VALUES (?, ?, 'a1', ?, ?, ?, ?, ?)`
  ).run(
    o.id ?? 'cm1',
    o.idHash ?? 'hash-cm1',
    o.movementType ?? 'CONVERSION',
    o.currency ?? 'eur',
    o.amount === undefined ? '-1.23100000000' : o.amount,
    o.spreadPct === undefined ? null : o.spreadPct,
    o.occurredAt ?? '2026-02-08T16:42:52.000Z',
  );
}

describe('007_futures_collateral_movements migration', () => {
  let dbPath: string;
  let db: DatabaseSync;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `test_mig007_${process.pid}_${Date.now()}_${Math.random()}.db`);
    db = new DatabaseSync(dbPath);
    db.exec('PRAGMA foreign_keys = ON;');
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  it('exists on disk and is discovered by the runner', () => {
    expect(fs.existsSync(path.join(MIGRATIONS_DIR, MIGRATION_007))).toBe(true);
  });

  it('records itself in _schema_migrations', () => {
    applyMigrations(db);
    const rows = db
      .prepare('SELECT filename FROM _schema_migrations WHERE filename = ?')
      .all(MIGRATION_007) as { filename: string }[];
    expect(rows).toHaveLength(1);
  });

  it('is a no-op when the runner is invoked twice', () => {
    applyMigrations(db);
    const before = rowCount(db, '_schema_migrations');
    expect(applyMigrations(db)).toEqual([]);
    expect(rowCount(db, '_schema_migrations')).toBe(before);
  });

  it('does not alter futures_transactions', () => {
    applyMigrations(db);
    const beforeCols = columns(db, 'futures_transactions').map((c) => c.name).sort();
    expect(beforeCols).toEqual(
      [
        'id', 'id_hash', 'account_id', 'tx_type', 'symbol', 'amount', 'trade_price', 'realized_pnl',
        'settlement_asset_id', 'funding_amount', 'fee_asset_id', 'fee_amount', 'fiat_currency',
        'timestamp', 'status', 'created_at', 'updated_at', 'deleted_at',
      ].sort()
    );
  });

  describe('collateral_movements table', () => {
    beforeEach(() => {
      applyMigrations(db);
      seedAccount(db);
    });

    it('has the columns the account, type, currency, amount, spread and instant require', () => {
      const cols = columns(db, 'collateral_movements').map((c) => c.name);
      for (const expected of [
        'account_id', 'movement_type', 'currency', 'amount', 'spread_pct', 'occurred_at', 'id_hash',
      ]) {
        expect(cols, `missing column ${expected}`).toContain(expected);
      }
    });

    it('accepts a EUR leg of a conversion pair', () => {
      expect(() => insertMovement(db, { currency: 'eur', amount: '-1.23100000000' })).not.toThrow();
    });

    it('accepts a USD leg of a conversion pair', () => {
      expect(() =>
        insertMovement(db, { id: 'cm2', idHash: 'hash-cm2', currency: 'usd', amount: '1.45480000000' })
      ).not.toThrow();
    });

    it('accepts a cross-exchange transfer movement type', () => {
      expect(() =>
        insertMovement(db, { movementType: 'CROSS_EXCHANGE_TRANSFER', currency: 'eur', amount: '200.00000000000' })
      ).not.toThrow();
    });

    it('rejects a movement type outside the vocabulary', () => {
      expect(() => insertMovement(db, { movementType: 'BOGUS' })).toThrow();
    });

    it('requires account_id to reference a real account', () => {
      expect(() =>
        db.prepare(
          `INSERT INTO collateral_movements
             (id, id_hash, account_id, movement_type, currency, amount, occurred_at)
           VALUES ('cm-orphan', 'hash-orphan', 'no-such-account', 'CONVERSION', 'eur', '1.0', '2026-01-01T00:00:00Z')`
        ).run()
      ).toThrow();
    });

    it('enforces id_hash uniqueness for idempotent re-ingestion', () => {
      insertMovement(db, { id: 'cm1', idHash: 'dup' });
      expect(() => insertMovement(db, { id: 'cm2', idHash: 'dup' })).toThrow();
    });

    describe('the signed amount (zero is a stated fact, absence is a different state)', () => {
      it('stores a literal negative amount without reformatting it', () => {
        insertMovement(db, { amount: '-1.23100000000' });
        const row = db.prepare("SELECT amount FROM collateral_movements WHERE id = 'cm1'").get() as {
          amount: string;
        };
        expect(row.amount).toBe('-1.23100000000');
      });

      it('accepts a stated zero amount, distinct from no row at all', () => {
        expect(() => insertMovement(db, { amount: '0' })).not.toThrow();
        const row = db.prepare("SELECT amount FROM collateral_movements WHERE id = 'cm1'").get() as {
          amount: string;
        };
        expect(row.amount).toBe('0');
      });

      it('refuses a missing amount — a movement with no magnitude states nothing', () => {
        expect(() =>
          db.prepare(
            `INSERT INTO collateral_movements
               (id, id_hash, account_id, movement_type, currency, amount, occurred_at)
             VALUES ('cm-null', 'hash-null', 'a1', 'CONVERSION', 'eur', NULL, '2026-01-01T00:00:00Z')`
          ).run()
        ).toThrow();
      });

      it('rejects a non-numeric amount', () => {
        expect(() => insertMovement(db, { amount: 'NaN' })).toThrow();
      });
    });

    describe('spread_pct (nullable, independent of amount)', () => {
      it('leaves spread_pct NULL when the source column is blank — genuinely absent', () => {
        insertMovement(db, { spreadPct: null });
        const row = db.prepare("SELECT spread_pct FROM collateral_movements WHERE id = 'cm1'").get() as {
          spread_pct: string | null;
        };
        expect(row.spread_pct).toBeNull();
      });

      it('records a stated zero spread as \'0\', not NULL', () => {
        insertMovement(db, { spreadPct: '0.00000000000' });
        const row = db.prepare("SELECT spread_pct FROM collateral_movements WHERE id = 'cm1'").get() as {
          spread_pct: string | null;
        };
        expect(row.spread_pct).toBe('0.00000000000');
      });

      it('rejects a non-numeric spread', () => {
        expect(() => insertMovement(db, { spreadPct: 'ECB' })).toThrow();
      });
    });
  });
});
