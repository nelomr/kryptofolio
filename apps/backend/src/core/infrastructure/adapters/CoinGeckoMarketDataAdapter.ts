import type { AssetPrice, GlobalMarketMetrics, MarketCategory } from '@kryptofolio/shared-types';
import {
  CoinGeckoMarketsResponseSchema,
  CoinGeckoGlobalDataSchema,
} from '@kryptofolio/shared-types';
import type { IMarketDataProvider } from '../../domain/ports/IMarketDataProvider.js';

/**
 * CoinGeckoMarketDataAdapter — Infrastructure Adapter (REST polling).
 *
 * Implements IMarketDataProvider by polling the CoinGecko public API
 * at a configurable interval (default: 60 s) to respect rate limits.
 *
 * Because all fetching is centralised in the backend singleton, a single
 * 60-second poll serves all connected frontend clients simultaneously.
 *
 * Anti-Corruption: Raw REST responses are validated through the Zod schemas
 * imported from @kryptofolio/shared-types before mapping to AssetPrice.
 *
 * Errors (HTTP 429, Zod failures) are propagated via the onError callback,
 * which the MarketDataOrchestrator subscribes to for centralised observability.
 */
export class CoinGeckoMarketDataAdapter implements IMarketDataProvider {
  readonly id = 'coingecko';
  readonly category: MarketCategory = 'crypto';

  private priceCallback: ((price: AssetPrice) => void) | null = null;
  private globalCallback: ((metrics: GlobalMarketMetrics) => void) | null = null;
  private errorCallback: ((error: Error) => void) | null = null;
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private connected = false;

  private readonly coinIds: string[];
  private readonly vsCurrency: string;
  private readonly pollIntervalMs: number;
  private readonly baseUrl: string;

  constructor(
    coinIds: string[] = ['bitcoin', 'ethereum', 'solana', 'cardano'],
    vsCurrency = 'usd',
    pollIntervalMs = 60_000,
    baseUrl = 'https://api.coingecko.com/api/v3',
  ) {
    this.coinIds = coinIds;
    this.vsCurrency = vsCurrency;
    this.pollIntervalMs = pollIntervalMs;
    this.baseUrl = baseUrl;
  }

  // ---------------------------------------------------------------------------
  // IMarketDataProvider
  // ---------------------------------------------------------------------------

  onPrice(callback: (price: AssetPrice) => void): void {
    this.priceCallback = callback;
  }

  /** Optional secondary callback for global market metrics. */
  onGlobalMetrics(callback: (metrics: GlobalMarketMetrics) => void): void {
    this.globalCallback = callback;
  }

  /**
   * Register an error callback. The orchestrator subscribes here to get
   * centralised, provider-agnostic observability for this adapter.
   */
  onError(callback: (error: Error) => void): void {
    this.errorCallback = callback;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async connect(): Promise<void> {
    if (this.connected) return;

    this.connected = true;

    // Fire immediately on first connect, then poll on interval
    await this.poll();
    this.intervalHandle = setInterval(() => {
      void this.poll();
    }, this.pollIntervalMs);
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    if (this.intervalHandle !== null) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async poll(): Promise<void> {
    await Promise.allSettled([
      this.fetchPrices('usd'),
      this.fetchPrices('eur'),
      this.fetchGlobalMetrics(),
    ]);
  }

  private async fetchPrices(vsCurrency: string): Promise<void> {
    if (!this.priceCallback) return;

    const url = `${this.baseUrl}/coins/markets?vs_currency=${vsCurrency}&ids=${this.coinIds.join(',')}&order=market_cap_desc&price_change_percentage=24h`;

    let response: Response;
    try {
      response = await fetch(url);
    } catch (err) {
      // Network-level error (DNS failure, timeout, etc.)
      this.errorCallback?.(
        new Error(`[coingecko] Network error on fetchPrices: ${String(err)}`)
      );
      return;
    }

    // Explicit HTTP status check — CoinGecko returns 429 when rate-limited.
    // Without this, the error body passes to Zod and fails silently.
    if (!response.ok) {
      const errorMsg = `[coingecko] HTTP ${response.status} on /coins/markets (${vsCurrency})`;
      this.errorCallback?.(new Error(errorMsg));
      return;
    }

    const raw = await response.json() as unknown;
    const result = CoinGeckoMarketsResponseSchema.safeParse(raw);
    if (!result.success) {
      // Signal schema validation failure via onError — no silent failures
      this.errorCallback?.(
        new Error(`[coingecko] Schema validation failed on /coins/markets: ${result.error.message}`)
      );
      return;
    }

    const timestamp = new Date().toISOString();
    for (const item of result.data) {
      if (item.current_price === null) continue;

      const price: AssetPrice = {
        symbol: item.symbol.toUpperCase(),
        currency: vsCurrency.toUpperCase(),
        price: String(item.current_price),
        change24hPercent: String(item.price_change_percentage_24h ?? 0),
        provider: this.id,
        timestamp,
      };

      this.priceCallback(price);
    }
  }

  private async fetchGlobalMetrics(): Promise<void> {
    if (!this.globalCallback) return;

    const url = `${this.baseUrl}/global`;

    let response: Response;
    try {
      response = await fetch(url);
    } catch (err) {
      this.errorCallback?.(
        new Error(`[coingecko] Network error on fetchGlobalMetrics: ${String(err)}`)
      );
      return;
    }

    if (!response.ok) {
      const errorMsg = `[coingecko] HTTP ${response.status} on /global`;
      this.errorCallback?.(new Error(errorMsg));
      return;
    }

    const raw = await response.json() as unknown;
    const result = CoinGeckoGlobalDataSchema.safeParse(raw);
    if (!result.success) {
      this.errorCallback?.(
        new Error(`[coingecko] Schema validation failed on /global: ${result.error.message}`)
      );
      return;
    }

    const { data } = result.data;
    const totalMarketCapUsd = data.total_market_cap['usd'] ?? 0;

    // Re-use last fetched prices for topAssets — omit here to keep concerns separated
    const metrics: GlobalMarketMetrics = {
      totalMarketCapUsd,
      marketCapChange24hPercent: data.market_cap_change_percentage_24h_usd,
      fearGreedIndex: null,
      fearGreedLabel: null,
      topAssets: [],
      timestamp: new Date().toISOString(),
    };

    this.globalCallback(metrics);
  }
}
