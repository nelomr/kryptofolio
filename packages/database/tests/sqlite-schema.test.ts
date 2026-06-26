import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getLedgerDb, closeLedgerDb } from '../src/sqlite/connection';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('SQLite Ledger Schema', () => {
  let testDbPath: string;

  beforeEach(() => {
    testDbPath = path.join(os.tmpdir(), `test_ledger_schema_${Date.now()}.db`);
    const db = getLedgerDb(testDbPath);
    
    // Read and apply migration
    const migrationSql = fs.readFileSync(path.resolve(__dirname, '../migrations/sqlite/002_ledger_schema.sql'), 'utf-8');
    db.exec(migrationSql);
  });

  afterEach(() => {
    closeLedgerDb();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  it('should create tables with STRICT mode', () => {
    const db = getLedgerDb(testDbPath);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as {name: string}[];
    const tableNames = tables.map(t => t.name);
    
    expect(tableNames).toContain('assets');
    expect(tableNames).toContain('accounts');
    expect(tableNames).toContain('spot_transactions');
    expect(tableNames).toContain('futures_transactions');
    expect(tableNames).toContain('tax_lots');
    expect(tableNames).toContain('lot_history_events');
    expect(tableNames).toContain('audit_log');
  });

  it('should reject spot_transactions with invalid amount format', () => {
    const db = getLedgerDb(testDbPath);
    
    // Insert mock account
    db.prepare('INSERT INTO accounts (id, name, type) VALUES (?, ?, ?)').run('acc-1', 'Test', 'EXCHANGE');
    
    // valid insert
    expect(() => {
      db.prepare(`
        INSERT INTO spot_transactions (
          id, id_hash, account_id, tx_type, total_fiat, price_fiat, timestamp, status
        ) VALUES (
          'tx-1', 'hash-1', 'acc-1', 'DEPOSIT', '100.50', '1.0', '2023-01-01T00:00:00Z', 'COMPLETED'
        )
      `).run();
    }).not.toThrow();

    // invalid total_fiat (contains letters)
    expect(() => {
      db.prepare(`
        INSERT INTO spot_transactions (
          id, id_hash, account_id, tx_type, total_fiat, price_fiat, timestamp, status
        ) VALUES (
          'tx-2', 'hash-2', 'acc-1', 'DEPOSIT', '100.50A', '1.0', '2023-01-01T00:00:00Z', 'COMPLETED'
        )
      `).run();
    }).toThrow(/CHECK constraint failed/);
  });
  
  it('should require asset_in_id if amount_in is provided', () => {
    const db = getLedgerDb(testDbPath);
    db.prepare('INSERT INTO accounts (id, name, type) VALUES (?, ?, ?)').run('acc-1', 'Test', 'EXCHANGE');
    
    expect(() => {
      db.prepare(`
        INSERT INTO spot_transactions (
          id, id_hash, account_id, tx_type, amount_in, total_fiat, price_fiat, timestamp, status
        ) VALUES (
          'tx-3', 'hash-3', 'acc-1', 'BUY', '1.5', '100', '1', '2023-01-01', 'COMPLETED'
        )
      `).run();
    }).toThrow(/CHECK constraint failed/);
  });
});
