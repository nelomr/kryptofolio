import type { AssetPrice, MarketCategory } from '@kryptofolio/shared-types';

/**
 * IMarketDataProvider — Domain Port for a market data source.
 *
 * Lives in the DOMAIN layer. No adapter-specific imports allowed here.
 * Implementations: KrakenMarketDataAdapter, CoinGeckoMarketDataAdapter, …
 *
 * Lifecycle:
 *   connect()    → Establishes the connection (WS handshake or starts polling).
 *   disconnect() → MUST be called before connecting a new provider.
 *                  Prevents resource / WebSocket leaks.
 *   onPrice()    → Subscribes to incoming price events.
 */
export interface IMarketDataProvider {
  /** Unique identifier for this provider (e.g. "kraken", "coingecko") */
  readonly id: string;

  /** The market category this provider covers (enforces mutual exclusivity). */
  readonly category: MarketCategory;

  /** Establish connection and start emitting prices. */
  connect(): Promise<void>;

  /**
   * Cleanly close the connection / stop polling.
   * Must be idempotent — calling it on an already-stopped provider is safe.
   */
  disconnect(): Promise<void>;

  /**
   * Register a callback to receive price updates.
   * The callback is invoked every time a new price snapshot arrives.
   */
  onPrice(callback: (price: AssetPrice) => void): void;

  /**
   * Register a callback to receive errors from this provider.
   * Adapters MUST invoke this callback instead of failing silently when:
   *   - Zod schema validation fails on incoming payloads
   *   - HTTP errors occur (e.g. 429 Rate Limit)
   *   - WebSocket connection issues occur
   *
   * The MarketDataOrchestrator subscribes here to provide centralised
   * observability for ANY active provider — current or future.
   */
  onError(callback: (error: Error) => void): void;

  /** Returns true if the provider is currently active (connected / polling). */
  isConnected(): boolean;
}
