import { WebSocket } from 'ws';
import type { AssetPrice, MarketCategory } from '@kryptofolio/shared-types';
import { BinanceCombinedStreamMessageSchema } from '@kryptofolio/shared-types';
import type { IMarketDataProvider } from '../../domain/ports/IMarketDataProvider.js';

/**
 * BinanceMarketDataAdapter — Infrastructure Adapter (WebSocket).
 *
 * Connects to the Binance combined stream endpoint and subscribes to
 * individual symbol 24hrTicker streams.
 *
 * Payload format (combined stream):
 *   { "stream": "btcusdt@ticker", "data": { "e": "24hrTicker", "s": "BTCUSDT", "c": "65000.0", "P": "2.5" } }
 *
 * Anti-Corruption: Raw WS payloads are validated through BinanceCombinedStreamMessageSchema
 * (from @kryptofolio/shared-types) before being transformed to AssetPrice.
 *
 * Errors (Zod failures, WS errors) are propagated via the onError callback,
 * which the MarketDataOrchestrator subscribes to for centralised observability.
 */
export class BinanceMarketDataAdapter implements IMarketDataProvider {
  readonly id = 'binance';
  readonly category: MarketCategory = 'crypto';

  private ws: WebSocket | null = null;
  private priceCallback: ((price: AssetPrice) => void) | null = null;
  private errorCallback: ((error: Error) => void) | null = null;
  private connected = false;
  private readonly streams: string[];
  private readonly wsUrl: string;

  constructor(
    symbols: string[] = [
      'btcusdt',
      'btceur',
      'ethusdt',
      'etheur',
      'solusdt',
      'soleur',
      'adausdt',
      'adaeur',
    ],
    wsUrl = 'wss://stream.binance.com:9443/stream',
  ) {
    this.streams = symbols.map((s) => `${s.toLowerCase()}@ticker`);
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
        const url = `${this.wsUrl}?streams=${this.streams.join('/')}`;
        this.ws = new WebSocket(url);

        this.ws.on('open', () => {
          this.connected = true;
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

    // Validate through Zod Anti-Corruption Layer
    const result = BinanceCombinedStreamMessageSchema.safeParse(parsed);
    if (!result.success) {
      // Propagate to orchestrator — no silent failures
      this.errorCallback?.(
        new Error(`[binance] Ticker schema validation failed: ${result.error.message}`)
      );
      return;
    }

    const { s: symbol, c: lastPrice, P: changePct } = result.data.data;

    // Normalise symbol: BTCUSDT → base=BTC, quote=USD
    let base = symbol;
    let quote = 'USD';
    if (base.endsWith('USDT')) {
      base = base.slice(0, -4);
      quote = 'USD';
    } else if (base.endsWith('EUR')) {
      base = base.slice(0, -3);
      quote = 'EUR';
    } else if (base.endsWith('BUSD')) {
      base = base.slice(0, -4);
      quote = 'USD';
    }

    const price: AssetPrice = {
      symbol: base,
      currency: quote,
      price: lastPrice,
      change24hPercent: changePct,
      provider: this.id,
      timestamp: new Date().toISOString(),
    };

    this.priceCallback?.(price);
  }
}
