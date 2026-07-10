/**
 * IPriceIngestionPort — Domain Port for historical price ingestion.
 *
 * Lives in the DOMAIN layer. No adapter-specific imports allowed here.
 * Implementation: DuckDbParquetPriceAdapter (Infrastructure Layer).
 *
 * This port is responsible for:
 * 1. Querying the last persisted date for a given asset symbol.
 * 2. Writing a batch of OHLCV records to the Parquet storage layer.
 */

export interface OHLCVRecord {
  date: string;       // ISO-8601 date string (YYYY-MM-DD)
  assetId: string;    // Internal UUID from ledger.assets
  symbol: string;     // Ticker symbol, e.g. 'BTC', 'ETH'
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  currency: string;   // Native price currency, e.g. 'USD'
}

export interface IngestionResult {
  asset: string;
  datesFetched: number;
  errors: string[];
}

export interface IPriceIngestionPort {
  /**
   * Returns the most recent date for which a price exists for the given symbol.
   * Returns null if no data exists yet (first-time ingestion).
   */
  getLastIngestedDate(symbol: string): Promise<string | null>;

  /**
   * Persists a batch of OHLCV records to the Parquet storage layer.
   * Records are written into year-partitioned Hive files.
   *
   * @throws if writing fails (disk error, DuckDB lock conflict, etc.)
   */
  writePricesToParquet(records: OHLCVRecord[]): Promise<void>;
}
