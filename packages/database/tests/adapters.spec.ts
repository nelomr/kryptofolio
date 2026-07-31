import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { NodeSqliteAdapter } from '../src/adapters/NodeSqliteAdapter.js';
import { DuckDbAdapter } from '../src/adapters/DuckDbAdapter.js';
import { applyMigrations } from './helpers/migrations.js';

describe('Database Adapters', () => {
  describe('NodeSqliteAdapter (Vault DB)', () => {
    let adapter: NodeSqliteAdapter;

    beforeEach(async () => {
      process.env.MOCK_MODE = 'false';
      process.env.VAULT_DB_PATH = ':memory:';
      adapter = new NodeSqliteAdapter();
      await adapter.initialize();
    });

    it('should initialize and create the vault tables', async () => {
      // Execute a basic insert to verify tables exist
      await adapter.execute(
        `INSERT INTO system_credentials (id, service_identifier, ciphertext, initialization_vector, authentication_tag) 
         VALUES (?, ?, ?, ?, ?)`,
        ['test-id', 'test-service', Buffer.from('cipher'), Buffer.from('iv'), Buffer.from('tag')]
      );

      const rows = await adapter.queryMany('SELECT * FROM system_credentials');
      expect(rows).toHaveLength(1);
      expect((rows[0] as any).id).toBe('test-id');
    });

    it('should support queryOne', async () => {
      await adapter.execute(
        `INSERT INTO user_settings (key, value) VALUES (?, ?)`,
        ['theme', 'dark']
      );

      const row = await adapter.queryOne<{ key: string; value: string }>('SELECT * FROM user_settings WHERE key = ?', ['theme']);
      expect(row).toBeDefined();
      expect(row?.value).toBe('dark');
    });
  });

  describe('DuckDbAdapter (Fiscal DB)', () => {
    let adapter: DuckDbAdapter;
    let sqliteDb: DatabaseSync;
    let sqliteDbPath: string;

    beforeEach(async () => {
      sqliteDbPath = path.join(os.tmpdir(), `test_ledger_${Date.now()}_${Math.random().toString(36).substring(7)}.db`);
      sqliteDb = new DatabaseSync(sqliteDbPath);
      sqliteDb.exec('PRAGMA foreign_keys = ON;');
      // The full migration set, not a hand-picked prefix: the FIFO views bind against the current
      // ledger schema, so a partially-migrated ledger is not a schema the adapter supports.
      applyMigrations(sqliteDb);

      process.env.MOCK_MODE = 'false';
      process.env.DUCKDB_PATH = ':memory:';
      adapter = new DuckDbAdapter();
      await adapter.initialize(sqliteDbPath);
    });

    afterEach(() => {
      sqliteDb.close();
      if (fs.existsSync(sqliteDbPath)) {
        fs.unlinkSync(sqliteDbPath);
      }
    });

    it('should initialize and allow table creation', async () => {
      await adapter.execute('CREATE TABLE test_olap (id INTEGER, value DOUBLE)');
      await adapter.execute('INSERT INTO test_olap VALUES (?, ?)', [1, 100.5]);
      await adapter.execute('INSERT INTO test_olap VALUES (?, ?)', [2, 200.75]);

      const rows = await adapter.queryMany('SELECT * FROM test_olap ORDER BY id');
      expect(rows).toHaveLength(2);
      expect((rows[0] as any).id).toBe(1);
      expect((rows[0] as any).value).toBe(100.5);
    });

    it('should attach SQLite ledger database and allow querying its tables', async () => {
      const rows = await adapter.queryMany("SELECT table_name AS name FROM information_schema.tables WHERE table_catalog = 'ledger'");
      expect(rows.length).toBeGreaterThan(0);
      const tableNames = rows.map((r: any) => r.name);
      expect(tableNames).toContain('spot_transactions');
      expect(tableNames).toContain('tax_lots');
    });

    it('should support queryOne', async () => {
      await adapter.execute('CREATE TABLE sum_test (amount DOUBLE)');
      await adapter.execute('INSERT INTO sum_test VALUES (?)', [50]);
      await adapter.execute('INSERT INTO sum_test VALUES (?)', [75]);

      const result = await adapter.queryOne<{ total: number }>('SELECT SUM(amount) AS total FROM sum_test');
      expect(result).toBeDefined();
      expect(result?.total).toBe(125);
    });

    it('should support bulkInsert using Appender API', async () => {
      await adapter.execute('CREATE TABLE bulk_test (id INTEGER, name VARCHAR)');
      const data = [
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
        { id: 3, name: 'Charlie' }
      ];
      await adapter.bulkInsert('bulk_test', data);

      const rows = await adapter.queryMany<{ id: number; name: string }>('SELECT * FROM bulk_test ORDER BY id');
      expect(rows).toHaveLength(3);
      expect(rows[0].name).toBe('Alice');
      expect(rows[1].name).toBe('Bob');
      expect(rows[2].name).toBe('Charlie');
    });
  });
});
