import type Decimal from 'decimal.js';

/**
 * Port for retrieving historical price data from external oracles/markets.
 */
export interface IPriceProviderPort {
  /**
   * Retrieves the historical price of an asset in a given fiat currency at a specific timestamp.
   * Should return a fallback (e.g. 0) or throw if the price cannot be resolved.
   * 
   * @param asset The asset symbol (e.g., 'BTC')
   * @param fiatCurrency The fiat currency symbol (e.g., 'EUR')
   * @param timestamp ISO 8601 timestamp string
   */
  getHistoricalPrice(asset: string, fiatCurrency: string, timestamp: string): Promise<Decimal>;
}
