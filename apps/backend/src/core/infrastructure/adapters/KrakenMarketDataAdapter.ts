import { WebSocket } from 'ws';
import type { AssetPrice, MarketCategory } from '@kryptofolio/shared-types';
import { KrakenWsTickerMessageSchema } from '@kryptofolio/shared-types';
import type { IMarketDataProvider } from '../../domain/ports/IMarketDataProvider.js';

/**
 * KrakenMarketDataAdapter — Infrastructure Adapter (WebSocket v2).
 *
 * Implements IMarketDataProvider by connecting to the Kraken public WS v2 API
 * (wss://ws.kraken.com/v2) and subscribing to the "ticker" channel.
 *
 * Kraken WS v2 ticker message format (object envelope):
 *   { "channel": "ticker", "type": "update", "data": [{ "symbol": "BTC/USD", "last": 65000.0, ... }] }
 *
 * Anti-Corruption: Raw WS payloads are validated through KrakenWsTickerMessageSchema
 * (from @kryptofolio/shared-types) before being transformed to AssetPrice.
 *
 * Errors (Zod failures, WS errors) are propagated via the onError callback,
 * which the MarketDataOrchestrator subscribes to for centralised observability.
 */
export class KrakenMarketDataAdapter implements IMarketDataProvider {
  readonly id = 'kraken';
  readonly category: MarketCategory = 'crypto';

  private ws: WebSocket | null = null;
  private priceCallback: ((price: AssetPrice) => void) | null = null;
  private errorCallback: ((error: Error) => void) | null = null;
  private connected = false;
  private readonly symbols: string[];
  private readonly wsUrl: string;

  constructor(
    symbols: string[] = [
      'BTC/USD',
      'BTC/EUR',
      'ETH/USD',
      'ETH/EUR',
      'SOL/USD',
      'SOL/EUR',
      'ADA/USD',
      'ADA/EUR',
    ],
    wsUrl = 'wss://ws.kraken.com/v2',
  ) {
    this.symbols = symbols;
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
          // Subscribe to ticker channel using Kraken WS v2 format
          this.ws!.send(
            JSON.stringify({
              method: 'subscribe',
              params: {
                channel: 'ticker',
                symbol: this.symbols,
              },
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
            // After connection, signal error to orchestrator instead of swallowing
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
      return; // Ignore malformed frames
    }

    // Skip non-object messages (heartbeat channel messages are objects but not ticker)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return;

    // Skip non-ticker channel messages (e.g. "heartbeat", "status", "subscriptions")
    const msg = parsed as Record<string, unknown>;
    if (msg['channel'] !== 'ticker') return;

    const result = KrakenWsTickerMessageSchema.safeParse(parsed);
    if (!result.success) {
      // Signal to orchestrator via onError — no silent failures
      this.errorCallback?.(
        new Error(`[kraken] Ticker schema validation failed: ${result.error.message}`)
      );
      return;
    }

    const timestamp = new Date().toISOString();

    for (const item of result.data.data) {
      const [rawSymbol, quoteCurrency] = item.symbol.split('/');
      // Kraken v2 uses "BTC" already (no more XBT normalisation needed for v2),
      // but we keep the guard in case they ever emit XBT in a snapshot.
      const symbol = rawSymbol === 'XBT' ? 'BTC' : (rawSymbol ?? item.symbol);
      const currency = quoteCurrency ?? 'USD';

      const price: AssetPrice = {
        symbol,
        currency,
        price: String(item.last),
        change24hPercent: String(item.change_pct),
        provider: this.id,
        timestamp,
      };

      this.priceCallback?.(price);
    }
  }
}
