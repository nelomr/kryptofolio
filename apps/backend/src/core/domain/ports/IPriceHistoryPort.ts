import type { AssetPrice } from '@kryptofolio/shared-types';

/**
 * IPriceHistoryPort — Domain Port for storing and retrieving price history.
 *
 * Lives in the DOMAIN layer. No database-engine imports allowed here.
 *
 * Implementations:
 *  - InMemoryPriceHistoryAdapter  (development / runtime cache)
 *  - DuckDbPriceHistoryAdapter    (analytical storage, phase 1 skeleton)
 */
export interface IPriceHistoryPort {
  /**
   * Persist a price snapshot. Called every time a provider emits a price.
   * Implementations must be non-blocking (fire-and-forget or async).
   */
  save(price: AssetPrice): Promise<void>;

  /**
   * Retrieve the latest known price for a given symbol + currency pair.
   * Returns null if no price has been recorded yet.
   */
  getLatest(symbol: string, currency: string): Promise<AssetPrice | null>;

  /**
   * Retrieve all recorded prices for a symbol within a time range.
   * @param symbol   — Ticker symbol (e.g. "BTC")
   * @param currency — Quote currency (e.g. "USD")
   * @param from     — ISO-8601 start timestamp (inclusive)
   * @param to       — ISO-8601 end timestamp (inclusive), defaults to now
   */
  getHistory(
    symbol: string,
    currency: string,
    from: string,
    to?: string,
  ): Promise<AssetPrice[]>;

  /**
   * Return all symbols currently tracked in the history store.
   */
  getTrackedSymbols(): Promise<string[]>;
}
