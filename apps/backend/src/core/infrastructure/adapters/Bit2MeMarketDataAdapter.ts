import { WebSocket } from 'ws';
import type { AssetPrice, MarketCategory } from '@kryptofolio/shared-types';
import { Bit2MeTickerMessageSchema } from '@kryptofolio/shared-types';
import type { IMarketDataProvider } from '../../domain/ports/IMarketDataProvider.js';

/**
 * Bit2MeMarketDataAdapter — Infrastructure Adapter (WebSocket).
 *
 * Connects to the Bit2Me Trading WS API and subscribes to the "ticker" channel.
 *
 * Payload format:
 *   { "event": "ticker", "data": { "symbol": "BTC/EUR", "price": "65000.0", "change24h": "2.5" } }
 *
 * Anti-Corruption: Raw WS payloads are validated through Bit2MeTickerMessageSchema
 * (from @kryptofolio/shared-types) before being transformed to AssetPrice.
 *
 * Errors (Zod failures, WS errors) are propagated via the onError callback,
 * which the MarketDataOrchestrator subscribes to for centralised observability.
 */
export class Bit2MeMarketDataAdapter implements IMarketDataProvider {
  readonly id = 'bit2me';
  readonly category: MarketCategory = 'crypto';

  private ws: WebSocket | null = null;
  private priceCallback: ((price: AssetPrice) => void) | null = null;
  private errorCallback: ((error: Error) => void) | null = null;
  private connected = false;
  private readonly wsUrl: string;

  constructor(wsUrl = 'wss://ws.bit2me.com/v1/trading') {
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
              action: 'subscribe',
              channel: 'ticker',
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

    // Skip non-ticker events (e.g. "connected", "subscribed") without error
    if (typeof parsed !== 'object' || parsed === null) return;
    const msg = parsed as Record<string, unknown>;
    if (msg['event'] !== 'ticker') return;

    // Validate through Zod Anti-Corruption Layer
    const result = Bit2MeTickerMessageSchema.safeParse(parsed);
    if (!result.success) {
      // Propagate to orchestrator — no silent failures
      this.errorCallback?.(
        new Error(`[bit2me] Ticker schema validation failed: ${result.error.message}`)
      );
      return;
    }

    const { symbol, price, change24h } = result.data.data;
    const [base, quote] = symbol.split('/') as [string, string];

    const assetPrice: AssetPrice = {
      symbol: base,
      currency: quote,
      price,
      change24hPercent: change24h ?? '0',
      provider: this.id,
      timestamp: new Date().toISOString(),
    };

    this.priceCallback?.(assetPrice);
  }
}
