import type { AssetPrice, GlobalMarketMetrics } from '@kryptofolio/shared-types';

/**
 * IMarketDataPort — Frontend Domain Port for market data consumption.
 *
 * Lives in the DOMAIN layer of apps/frontend. No Vue, Axios, or adapter imports.
 * The UI layer accesses market data exclusively through this port.
 *
 * Implemented by: BffMarketDataAdapter (connects to the backend SSE & REST APIs).
 *
 * Design note: The frontend is a pure CONSUMER of market data.
 * The backend handles all external provider connections (Kraken WS, CoinGecko REST).
 */
export interface IMarketDataPort {
  /**
   * Subscribe to the backend SSE stream for real-time price updates.
   * @param onPrice   — Called whenever a new AssetPrice event arrives.
   * @param onError   — Called on connection errors.
   * @returns A cleanup function that closes the SSE connection.
   */
  subscribeToStream(
    onPrice: (price: AssetPrice) => void,
    onError?: (error: Event) => void,
  ): () => void;

  /**
   * Fetch the latest global market metrics (one-shot REST call).
   * Used by summary widgets that don't need real-time updates.
   */
  getGlobalMetrics(): Promise<GlobalMarketMetrics>;
}
