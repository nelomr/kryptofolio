import type { IDatabasePort } from './IDatabasePort.js';

/**
 * IAnalyticalDatabasePort — Port for high-performance analytical database operations.
 *
 * Extends the basic IDatabasePort to add bulk data ingestion capabilities
 * (such as DuckDB's native Appender API) to prevent row-by-row INSERT performance degradation.
 */
export interface IAnalyticalDatabasePort extends IDatabasePort {
  /**
   * Performs bulk insertion of records into a table using the most efficient
   * database-specific ingestion mechanism (e.g., Appender API).
   *
   * @param table - The target table name.
   * @param data - Array of row objects to insert. Keys must match the table columns.
   */
  bulkInsert<T extends Record<string, unknown>>(table: string, data: T[]): Promise<void>;
}
