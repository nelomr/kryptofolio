import { WebSocket } from 'ws';
import type { AssetPrice, MarketCategory } from '@kryptofolio/shared-types';
import type { IMarketDataProvider } from '../../domain/ports/IMarketDataProvider.js';

export class Bit2MeMarketDataAdapter implements IMarketDataProvider {
  readonly id = 'bit2me';
  readonly category: MarketCategory = 'crypto';

  private ws: WebSocket | null = null;
  private priceCallback: ((price: AssetPrice) => void) | null = null;
  private connected = false;
  private readonly wsUrl: string;

  constructor(wsUrl = 'wss://ws.bit2me.com/v1/trading') {
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
          // Subscribing to public ticker channel (Bit2Me Trading Spot WS API)
          this.ws!.send(
            JSON.stringify({
              action: 'subscribe',
              channel: 'ticker',
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

    if (!parsed || parsed.event !== 'ticker' || !parsed.data) return;

    const data = parsed.data;
    if (!data.symbol || !data.price) return;

    const [base, quote] = data.symbol.split('/');
    if (!base || !quote) return;

    const price: AssetPrice = {
      symbol: base,
      currency: quote,
      price: parseFloat(data.price),
      change24hPercent: parseFloat(data.change24h || 0),
      provider: this.id,
      timestamp: new Date().toISOString(),
    };

    this.priceCallback?.(price);
  }
}
