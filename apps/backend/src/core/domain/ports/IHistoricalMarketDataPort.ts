import type { OHLCVRecord } from './IPriceIngestionPort.js';

/**
 * IHistoricalMarketDataPort — Domain Port for fetching historical OHLCV data.
 *
 * Lives in the DOMAIN layer. No adapter-specific imports allowed here.
 * Implementation: KrakenMarketDataAdapter (extended) in the Infrastructure Layer.
 *
 * This port is intentionally separate from IMarketDataProvider (real-time WebSocket)
 * to preserve the Single Responsibility Principle. Historical data fetching is a
 * distinct concern from live price streaming.
 */
export interface IHistoricalMarketDataPort {
  /**
   * Fetch historical daily OHLCV candles for the given symbol.
   *
   * @param symbol - Ticker symbol as expected by the provider (e.g. 'BTC', 'ETH')
   * @param since  - Optional ISO-8601 date string (YYYY-MM-DD). When provided, only
   *                 returns candles on or after this date.
   * @returns Ordered array of OHLCV records (oldest first).
   */
  getHistoricalOHLCV(symbol: string, since?: string): Promise<OHLCVRecord[]>;
}
