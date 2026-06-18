import { DuckDBInstance, DuckDBConnection } from '@duckdb/node-api';
import type { IDatabasePort } from '../ports/IDatabasePort.js';

/**
 * DuckDbAdapter — Infrastructure adapter for the generic IDatabasePort
 * 
 * Uses the new Neo API (@duckdb/node-api) for high-performance columnar OLAP queries.
 * Manages the connection lifecycle and executes schema creation.
 */
export class DuckDbAdapter implements IDatabasePort {
  private instance: DuckDBInstance | null = null;
  private connection: DuckDBConnection | null = null;
  private dbPath: string;

  constructor() {
    const isMockMode = process.env.MOCK_MODE === 'true';
    this.dbPath = ':memory:';

    if (!isMockMode) {
      if (!process.env.DUCKDB_PATH) {
        throw new Error(
          '[DuckDbAdapter] CRITICAL: DUCKDB_PATH environment variable is not defined. Please set it in your .env file or environment.',
        );
      }
      this.dbPath = process.env.DUCKDB_PATH;
    }
  }

  public async initialize(): Promise<void> {
    try {
      this.instance = await DuckDBInstance.create(this.dbPath);
      this.connection = await this.instance.connect();

      // Ensure some initial setup if required (e.g., loading extensions like JSON or Parquet)
      // For now, no explicit table creation is defined here since DuckDB handles analytical workloads
      // that might be created ad-hoc via file ingestion or specific migrations.
    } catch (err) {
      throw new Error(`[Database] Critical failure initializing DuckDB: ${err}`);
    }
  }

  public async execute(sql: string, params: unknown[] = []): Promise<void> {
    this.ensureConnection();
    const stmt = await this.connection!.prepare(sql);
    if (params.length > 0) {
      stmt.bind(params as any[]);
    }
    await stmt.run();
  }

  public async queryOne<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T | null> {
    const results = await this.queryMany<T>(sql, params);
    return results.length > 0 ? results[0] : null;
  }

  public async queryMany<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    this.ensureConnection();
    const stmt = await this.connection!.prepare(sql);
    if (params.length > 0) {
      stmt.bind(params as any[]);
    }
    const reader = await stmt.runAndReadAll();
    return reader.getRowObjects() as unknown as T[];
  }

  private ensureConnection(): void {
    if (!this.connection) {
      throw new Error('[DuckDbAdapter] Connection not initialized. Did you call initialize()?');
    }
  }
}
