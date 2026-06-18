import { WebSocket } from 'ws';
import type { AssetPrice, MarketCategory } from '@kryptofolio/shared-types';
import type { IMarketDataProvider } from '../../domain/ports/IMarketDataProvider.js';

export class BinanceMarketDataAdapter implements IMarketDataProvider {
  readonly id = 'binance';
  readonly category: MarketCategory = 'crypto';

  private ws: WebSocket | null = null;
  private priceCallback: ((price: AssetPrice) => void) | null = null;
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

  onPrice(callback: (price: AssetPrice) => void): void {
    this.priceCallback = callback;
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

    if (!parsed.data || typeof parsed.data !== 'object') return;
    const ticker = parsed.data;
    if (!ticker.s || !ticker.c || !ticker.P) return;

    let base = ticker.s;
    let quote = 'USD'; // Binance uses USDT mostly, map to USD for generic compatibility
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
      price: parseFloat(ticker.c),
      change24hPercent: parseFloat(ticker.P),
      provider: this.id,
      timestamp: new Date().toISOString(),
    };

    this.priceCallback?.(price);
  }
}
