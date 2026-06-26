import { WebSocket } from 'ws';
import type { AssetPrice, MarketCategory } from '@kryptofolio/shared-types';
import { CoinbaseTickerMessageSchema } from '@kryptofolio/shared-types';
import type { IMarketDataProvider } from '../../domain/ports/IMarketDataProvider.js';

/**
 * CoinbaseMarketDataAdapter — Infrastructure Adapter (WebSocket).
 *
 * Connects to the Coinbase Advanced Trade WS feed and subscribes to the
 * "ticker" channel for the configured product IDs.
 *
 * Payload format:
 *   { "type": "ticker", "product_id": "BTC-USD", "price": "65000.00", "open_24h": "63000.00" }
 *
 * Anti-Corruption: Raw WS payloads are validated through CoinbaseTickerMessageSchema
 * (from @kryptofolio/shared-types) before being transformed to AssetPrice.
 *
 * Errors (Zod failures, WS errors) are propagated via the onError callback,
 * which the MarketDataOrchestrator subscribes to for centralised observability.
 */
export class CoinbaseMarketDataAdapter implements IMarketDataProvider {
  readonly id = 'coinbase';
  readonly category: MarketCategory = 'crypto';

  private ws: WebSocket | null = null;
  private priceCallback: ((price: AssetPrice) => void) | null = null;
  private errorCallback: ((error: Error) => void) | null = null;
  private connected = false;
  private readonly productIds: string[];
  private readonly wsUrl: string;

  constructor(
    productIds: string[] = [
      'BTC-USD',
      'BTC-EUR',
      'ETH-USD',
      'ETH-EUR',
      'SOL-USD',
      'SOL-EUR',
      'ADA-USD',
      'ADA-EUR',
    ],
    wsUrl = 'wss://ws-feed.exchange.coinbase.com',
  ) {
    this.productIds = productIds;
    this.wsUrl = wsUrl;
  }

  // ---------------------------------------------------------------------------
  // IMarketDataProvider
  // ---------------------------------------------------------------------------

  onPrice(callback: (price: AssetPrice) => void): void {
    this.priceCallback = callback;
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
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.wsUrl);

        this.ws.on('open', () => {
          this.connected = true;
          this.ws!.send(
            JSON.stringify({
              type: 'subscribe',
              product_ids: this.productIds,
              channels: ['ticker'],
            }),
          );
          resolve();
        });

        this.ws.on('message', (raw: Buffer) => {
          this.handleMessage(raw.toString());
        });

        this.ws.on('error', (err) => {
          if (!this.connected) {
            reject(err);
          } else {
            this.errorCallback?.(err instanceof Error ? err : new Error(String(err)));
          }
        });

        this.ws.on('close', () => {
          this.connected = false;
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private handleMessage(raw: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return; // Ignore malformed JSON frames
    }

    // Skip non-ticker messages (subscriptions, heartbeats, etc.) without error
    if (typeof parsed !== 'object' || parsed === null) return;
    const msg = parsed as Record<string, unknown>;
    if (msg['type'] !== 'ticker') return;

    // Validate through Zod Anti-Corruption Layer
    const result = CoinbaseTickerMessageSchema.safeParse(parsed);
    if (!result.success) {
      // Propagate to orchestrator — no silent failures
      this.errorCallback?.(
        new Error(`[coinbase] Ticker schema validation failed: ${result.error.message}`)
      );
      return;
    }

    const { product_id, price, open_24h } = result.data;
    const [base, quote] = product_id.split('-') as [string, string];

    const currentPrice = parseFloat(price);
    const openPrice = parseFloat(open_24h ?? price);
    const change24hPercent =
      openPrice > 0 ? String(((currentPrice - openPrice) / openPrice) * 100) : '0';

    const assetPrice: AssetPrice = {
      symbol: base,
      currency: quote,
      price,
      change24hPercent,
      provider: this.id,
      timestamp: new Date().toISOString(),
    };

    this.priceCallback?.(assetPrice);
  }
}
