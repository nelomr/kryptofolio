import { resolveParquetPricesPath } from '@kryptofolio/database';
import type { IAnalyticalDatabasePort } from '@kryptofolio/database';
import type { IPriceIngestionPort, OHLCVRecord } from '../../domain/ports/IPriceIngestionPort.js';

/**
 * DuckDbParquetPriceAdapter — Infrastructure Adapter implementing IPriceIngestionPort.
 *
 * Responsibilities:
 * 1. Query the `historical_prices` view to determine the last ingested date per symbol.
 * 2. Persist new OHLCV records into year-partitioned Hive Parquet files via DuckDB COPY.
 *
 * Architecture rule: This adapter owns ALL Parquet I/O. The domain never touches the
 * filesystem or DuckDB directly.
 *
 * Concurrency note: DuckDB allows a single writer at a time. Since this adapter is the
 * sole writer to the Parquet layer and Node.js is single-threaded, concurrent write
 * collisions are not possible in the current architecture. If async parallelism is
 * introduced, a mutex must be added here.
 */
export class DuckDbParquetPriceAdapter implements IPriceIngestionPort {
  private readonly parquetBase: string;
  private duckDb: IAnalyticalDatabasePort;

  constructor(duckDb: IAnalyticalDatabasePort) {
    this.duckDb = duckDb;
    // The same resolver the reader uses. A writer and a reader that each resolve their own
    // cwd-relative path is how the price tree ends up written to one directory and queried from
    // another.
    this.parquetBase = resolveParquetPricesPath();
  }

  // ---------------------------------------------------------------------------
  // IPriceIngestionPort — getLastIngestedDate
  // ---------------------------------------------------------------------------

  /**
   * Returns the most recent date (YYYY-MM-DD) stored in the Parquet layer for
   * the given symbol, or null if no data exists yet.
   *
   * Uses the `historical_prices` view that is created during DuckDbAdapter.initialize().
   */
  async getLastIngestedDate(symbol: string): Promise<string | null> {
    // The historical_prices view is registered during DuckDbAdapter.initialize().
    // We query it directly — no join needed since the symbol is a column.
    const result = await this.duckDb.queryOne<{ max_date: string | null }>(
      `SELECT MAX(CAST(date AS VARCHAR)) AS max_date
       FROM historical_prices
       WHERE symbol = ?`,
      [symbol],
    );

    return result?.max_date ?? null;
  }

  // ---------------------------------------------------------------------------
  // IPriceIngestionPort — writePricesToParquet
  // ---------------------------------------------------------------------------

  /**
   * Persists a batch of OHLCV records to Hive-partitioned Parquet files.
   *
   * Strategy:
   * 1. Create an ephemeral DuckDB temp table with the canonical schema.
   * 2. Bulk-insert all records into the temp table via DuckDbAdapter.bulkInsert().
   * 3. Execute COPY (SELECT ... year(date) as year FROM staging) TO 'path' PARTITION_BY (year).
   * 4. Drop the temp table.
   */
  async writePricesToParquet(records: OHLCVRecord[]): Promise<void> {
    if (records.length === 0) return;

    const stagingTable = `_parquet_staging_${Date.now()}`;

    try {
      // Step 1: Create ephemeral staging table
      await this.duckDb.execute(`
        CREATE TEMP TABLE "${stagingTable}" (
          date       DATE NOT NULL,
          asset_id   VARCHAR NOT NULL,
          symbol     VARCHAR NOT NULL,
          open       DECIMAL(38,18),
          high       DECIMAL(38,18),
          low        DECIMAL(38,18),
          close      DECIMAL(38,18),
          volume     DECIMAL(38,18),
          currency   VARCHAR NOT NULL
        );
      `);

      // Step 2: Bulk insert via DuckDB Appender (fastest path — no row-by-row INSERTs)
      const rows = records.map((r) => ({
        date: r.date,       // DuckDB will cast VARCHAR to DATE
        asset_id: r.assetId,
        symbol: r.symbol,
        open: r.open,
        high: r.high,
        low: r.low,
        close: r.close,
        volume: r.volume,
        currency: r.currency,
      }));

      await this.duckDb.bulkInsert(stagingTable, rows);

      // Step 3: Merge with existing Parquet data for the affected years
      // Since COPY OVERWRITE_OR_IGNORE overwrites entire partitions, we must merge.
      await this.duckDb.execute(`
        CREATE TEMP TABLE "merged_${stagingTable}" AS
        SELECT CAST(date AS DATE) as date, asset_id, symbol, CAST(open AS DECIMAL(38,18)) as open, CAST(high AS DECIMAL(38,18)) as high, CAST(low AS DECIMAL(38,18)) as low, CAST(close AS DECIMAL(38,18)) as close, CAST(volume AS DECIMAL(38,18)) as volume, currency, CAST(year AS INTEGER) as year
        FROM historical_prices
        WHERE CAST(year AS INTEGER) IN (SELECT DISTINCT CAST(YEAR(CAST(date AS DATE)) AS INTEGER) FROM "${stagingTable}")
        UNION ALL
        SELECT
            CAST(date AS DATE)           AS date,
            asset_id,
            symbol,
            CAST(open  AS DECIMAL(38,18)) AS open,
            CAST(high  AS DECIMAL(38,18)) AS high,
            CAST(low   AS DECIMAL(38,18)) AS low,
            CAST(close AS DECIMAL(38,18)) AS close,
            CAST(volume AS DECIMAL(38,18)) AS volume,
            currency,
            CAST(YEAR(CAST(date AS DATE)) AS INTEGER) AS year
        FROM "${stagingTable}";
      `);

      // Step 4: Deduplicate and COPY to Parquet
      await this.duckDb.execute(`
        COPY (
          SELECT date, asset_id, symbol, open, high, low, close, volume, currency, year
          FROM "merged_${stagingTable}"
          QUALIFY ROW_NUMBER() OVER (PARTITION BY date, symbol ORDER BY close DESC) = 1
        ) TO '${this.parquetBase}' (FORMAT PARQUET, PARTITION_BY (year), OVERWRITE_OR_IGNORE true);
      `);
    } finally {
      // Step 5: Always clean up the staging tables
      await this.duckDb.execute(`DROP TABLE IF EXISTS "${stagingTable}";`).catch(() => {});
      await this.duckDb.execute(`DROP TABLE IF EXISTS "merged_${stagingTable}";`).catch(() => {});
    }
  }
}
