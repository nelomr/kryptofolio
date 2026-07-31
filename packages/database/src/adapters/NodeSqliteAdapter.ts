import { DatabaseSync } from 'node:sqlite';
import type { IDatabasePort } from '../ports/IDatabasePort.js';
import { toSqliteParams } from './sqlParams.js';

/**
 * NodeSqliteAdapter — Infrastructure adapter for the generic IDatabasePort
 * 
 * Uses the built-in Node.js sqlite module (node:sqlite) to provide database
 * connectivity. It manages the connection lifecycle and executes schema creation.
 */
export class NodeSqliteAdapter implements IDatabasePort {
  private db: DatabaseSync;

  constructor() {
    const isMockMode = process.env.MOCK_MODE === 'true' || process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
    let dbUrl = ':memory:';

    if (!isMockMode) {
      if (!process.env.VAULT_DB_PATH) {
        throw new Error(
          '[NodeSqliteAdapter] CRITICAL: VAULT_DB_PATH environment variable is not defined. Please set it in your .env file or environment.',
        );
      }
      dbUrl = process.env.VAULT_DB_PATH;
    } else if (process.env.VAULT_DB_PATH) {
      dbUrl = process.env.VAULT_DB_PATH;
    }

    this.db = new DatabaseSync(dbUrl);
  }

  public async initialize(): Promise<void> {
    try {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS system_credentials (
            id TEXT PRIMARY KEY,
            service_identifier TEXT UNIQUE NOT NULL,
            ciphertext BLOB NOT NULL,
            initialization_vector BLOB NOT NULL,
            authentication_tag BLOB NOT NULL,
            is_enabled INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS vault_metadata (
            key TEXT PRIMARY KEY,
            value BLOB NOT NULL
        );
        CREATE TABLE IF NOT EXISTS user_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        INSERT OR IGNORE INTO user_settings (key, value) VALUES ('active_market_provider', 'kraken');
      `);
    } catch (err) {
      throw new Error(`[Database] Critical failure initializing SQLite tables: ${err}`);
    }
  }

  public async execute(sql: string, params: unknown[] = []): Promise<void> {
    const stmt = this.db.prepare(sql);
    stmt.run(...toSqliteParams(params, 'NodeSqliteAdapter.execute'));
  }

  public async queryOne<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T | null> {
    const stmt = this.db.prepare(sql);
    const result = stmt.get(...toSqliteParams(params, 'NodeSqliteAdapter.queryOne')) as T | undefined;
    return result ?? null;
  }

  public async queryMany<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    const stmt = this.db.prepare(sql);
    return stmt.all(...toSqliteParams(params, 'NodeSqliteAdapter.queryMany')) as T[];
  }
}
