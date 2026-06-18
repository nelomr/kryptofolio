import { WebSocket } from 'ws';
import type { AssetPrice, MarketCategory } from '@kryptofolio/shared-types';
import type { IMarketDataProvider } from '../../domain/ports/IMarketDataProvider.js';

export class CoinbaseMarketDataAdapter implements IMarketDataProvider {
  readonly id = 'coinbase';
  readonly category: MarketCategory = 'crypto';

  private ws: WebSocket | null = null;
  private priceCallback: ((price: AssetPrice) => void) | null = null;
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
          this.ws!.send(
            JSON.stringify({
              type: 'subscribe',
              product_ids: this.productIds,
              channels: ['ticker'],
            })
          );
          resolve();
        });

        this.ws.on('message', (raw: Buffer) => {
          this.handleMessage(raw.toString());
        });

        this.ws.on('error', (err) => {
          if (!this.connected) reject(err);
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

  private handleMessage(raw: string): void {
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }

    if (parsed.type !== 'ticker') return;
    if (!parsed.product_id || !parsed.price) return;

    const [base, quote] = parsed.product_id.split('-');
    if (!base || !quote) return;

    const currentPrice = parseFloat(parsed.price);
    const openPrice = parseFloat(parsed.open_24h || parsed.price);
    let change24hPercent = 0;
    if (openPrice > 0) {
      change24hPercent = ((currentPrice - openPrice) / openPrice) * 100;
    }

    const price: AssetPrice = {
      symbol: base,
      currency: quote,
      price: currentPrice,
      change24hPercent,
      provider: this.id,
      timestamp: new Date().toISOString(),
    };

    this.priceCallback?.(price);
  }
}
