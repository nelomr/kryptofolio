import { describe, it, expect, beforeEach } from 'vitest';
import { NodeSqliteAdapter } from '../src/adapters/NodeSqliteAdapter.js';
import { DuckDbAdapter } from '../src/adapters/DuckDbAdapter.js';

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

    beforeEach(async () => {
      process.env.MOCK_MODE = 'false';
      process.env.DUCKDB_PATH = ':memory:';
      adapter = new DuckDbAdapter();
      await adapter.initialize();
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

    it('should support queryOne', async () => {
      await adapter.execute('CREATE TABLE sum_test (amount DOUBLE)');
      await adapter.execute('INSERT INTO sum_test VALUES (?)', [50]);
      await adapter.execute('INSERT INTO sum_test VALUES (?)', [75]);

      const result = await adapter.queryOne<{ total: number }>('SELECT SUM(amount) AS total FROM sum_test');
      expect(result).toBeDefined();
      expect(result?.total).toBe(125);
    });
  });
});
