/**
 * IDatabasePort — Generic Port for all database operations in Kryptofolio.
 *
 * This interface lives in the DOMAIN layer and must remain completely free
 * of any database-engine-specific imports (no `better-sqlite3`, no `duckdb`, etc.).
 * Concrete adapters in the infrastructure layer implement this port.
 */
export interface IDatabasePort {
  /**
   * Initialize the database, creating tables/schema if they don't exist.
   * Must be called once at application startup before any other operation.
   */
  initialize(): Promise<void>;

  /**
   * Execute a SQL statement that does not return rows (INSERT, UPDATE, DELETE, CREATE).
   * @param sql    - The SQL statement with `?` placeholders.
   * @param params - Ordered list of parameter values.
   */
  execute(sql: string, params?: unknown[]): Promise<void>;

  /**
   * Query a single row. Returns `null` if no row matches.
   * @param sql    - The SQL query with `?` placeholders.
   * @param params - Ordered list of parameter values.
   */
  queryOne<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | null>;

  /**
   * Query multiple rows. Returns an empty array if no rows match.
   * @param sql    - The SQL query with `?` placeholders.
   * @param params - Ordered list of parameter values.
   */
  queryMany<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
}
