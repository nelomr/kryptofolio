import { WebSocket } from 'ws';
import type { AssetPrice, MarketCategory } from '@kryptofolio/shared-types';
import { KrakenWsTickerMessageSchema } from '@kryptofolio/shared-types';
import type { IMarketDataProvider } from '../../domain/ports/IMarketDataProvider.js';

/**
 * KrakenMarketDataAdapter — Infrastructure Adapter (WebSocket).
 *
 * Implements IMarketDataProvider by connecting to the Kraken public WS API
 * (wss://ws.kraken.com) and subscribing to the "ticker" channel.
 *
 * Kraken WS ticker message format (array envelope):
 *   [channelId, { a, b, c, o, ... }, "ticker", "XBT/USD"]
 *
 * Anti-Corruption: Raw WS payloads are validated through KrakenWsTickerMessageSchema
 * (from @kryptofolio/shared-types) before being transformed to AssetPrice.
 */
export class KrakenMarketDataAdapter implements IMarketDataProvider {
  readonly id = 'kraken';
  readonly category: MarketCategory = 'crypto';

  private ws: WebSocket | null = null;
  private priceCallback: ((price: AssetPrice) => void) | null = null;
  private connected = false;
  private readonly symbols: string[];
  private readonly wsUrl: string;

  constructor(
    symbols: string[] = [
      'XBT/USD',
      'XBT/EUR',
      'ETH/USD',
      'ETH/EUR',
      'SOL/USD',
      'SOL/EUR',
      'ADA/USD',
      'ADA/EUR',
    ],
    wsUrl = 'wss://ws.kraken.com',
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

  isConnected(): boolean {
    return this.connected;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.wsUrl);

        this.ws.on('open', () => {
          this.connected = true;
          // Subscribe to ticker channel for configured symbols
          this.ws!.send(
            JSON.stringify({
              event: 'subscribe',
              pair: this.symbols,
              subscription: { name: 'ticker' },
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
          }
          // After connection is established we swallow errors gracefully
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

    // Skip system messages (heartbeat, subscriptionStatus, etc.)
    if (!Array.isArray(parsed)) return;

    const result = KrakenWsTickerMessageSchema.safeParse(parsed);
    if (!result.success) return;

    const [, tickerData, , pair] = result.data;

    // Kraken uses "XBT" for Bitcoin — normalise to "BTC"
    const [rawSymbol, quoteCurrency] = pair.split('/');
    const symbol = rawSymbol === 'XBT' ? 'BTC' : rawSymbol ?? pair;
    const currency = quoteCurrency ?? 'USD';

    const currentPriceStr = tickerData.c[0];
    const openPriceStr = tickerData.o[0];

    const price: AssetPrice = {
      symbol,
      currency,
      price: currentPriceStr,
      change24hPercent: String(this.calc24hChange(
        parseFloat(currentPriceStr),
        parseFloat(openPriceStr)
      )),
      provider: this.id,
      timestamp: new Date().toISOString(),
    };

    this.priceCallback?.(price);

  }

  private calc24hChange(currentPrice: number, openPrice: number): number {
    if (openPrice === 0) return 0;
    return ((currentPrice - openPrice) / openPrice) * 100;
  }
}
