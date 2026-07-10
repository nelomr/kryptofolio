import { WebSocket } from 'ws';
import type { AssetPrice, MarketCategory } from '@kryptofolio/shared-types';
import { KrakenWsTickerMessageSchema } from '@kryptofolio/shared-types';
import type { IMarketDataProvider } from '../../domain/ports/IMarketDataProvider.js';
import type { IHistoricalMarketDataPort } from '../../domain/ports/IHistoricalMarketDataPort.js';
import type { OHLCVRecord } from '../../domain/ports/IPriceIngestionPort.js';

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
export class KrakenMarketDataAdapter implements IMarketDataProvider, IHistoricalMarketDataPort {
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

  // ---------------------------------------------------------------------------
  // IHistoricalMarketDataPort — REST OHLC endpoint
  // ---------------------------------------------------------------------------

  /**
   * Fetches historical daily OHLCV candles from Kraken's public REST API.
   *
   * Endpoint: GET https://api.kraken.com/0/public/OHLC?pair={symbol}USD&interval=1440
   * interval=1440 = 1 day in minutes.
   *
   * Rate limiting: Kraken public endpoints are highly permissive (~15 req/s),
   * but we implement exponential backoff on HTTP 429 as a safety net.
   *
   * @param symbol - Ticker symbol (e.g. 'BTC', 'ETH'). Will be uppercased.
   * @param since  - Optional ISO-8601 date (YYYY-MM-DD). Only candles >= this date are returned.
   */
  async getHistoricalOHLCV(symbol: string, since?: string): Promise<OHLCVRecord[]> {
    const normalizedSymbol = symbol.toUpperCase() === 'BTC' ? 'XBT' : symbol.toUpperCase();
    const pair = `${normalizedSymbol}USD`;

    // Convert since date to Unix timestamp if provided
    const sinceTs = since ? Math.floor(new Date(since).getTime() / 1000) : undefined;

    const url = new URL('https://api.kraken.com/0/public/OHLC');
    url.searchParams.set('pair', pair);
    url.searchParams.set('interval', '1440'); // Daily candles

    if (sinceTs !== undefined) {
      url.searchParams.set('since', String(sinceTs));
    }

    const MAX_ATTEMPTS = 5;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      if (attempt > 0) {
        // Exponential backoff: 2^attempt * 1000ms
        const waitMs = Math.pow(2, attempt) * 1000;
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }

      const response = await fetch(url.toString());

      if (response.status === 429) {
        lastError = new Error(`[KrakenAdapter] Rate limited (429) on attempt ${attempt + 1}`);
        continue; // Retry with exponential backoff
      }

      if (!response.ok) {
        throw new Error(
          `[KrakenAdapter] HTTP ${response.status} fetching OHLC for ${pair}: ${response.statusText}`,
        );
      }

      const json = (await response.json()) as {
        error: string[];
        result: Record<string, [number, string, string, string, string, string, string, number][]>;
      };

      if (json.error && json.error.length > 0) {
        throw new Error(`[KrakenAdapter] Kraken API error for ${pair}: ${json.error.join(', ')}`);
      }

      // Kraken returns: [time, open, high, low, close, vwap, volume, count]
      // We pick the first key in result that isn't 'last'
      const resultKey = Object.keys(json.result).find((k) => k !== 'last');
      if (!resultKey) {
        return [];
      }

      const candles = json.result[resultKey] ?? [];
      const sinceDate = since ?? '1970-01-01';

      // Normalize XBT back to BTC in the output symbol
      const outputSymbol = symbol.toUpperCase() === 'XBT' ? 'BTC' : symbol.toUpperCase();

      const records: OHLCVRecord[] = candles
        .map(([time, open, high, low, close, , volume]) => {
          const date = new Date(time * 1000).toISOString().slice(0, 10);
          return {
            date,
            assetId: '', // Hydrated by the Use Case from the ledger
            symbol: outputSymbol,
            open: parseFloat(open),
            high: parseFloat(high),
            low: parseFloat(low),
            close: parseFloat(close),
            volume: parseFloat(volume),
            currency: 'USD',
          } satisfies OHLCVRecord;
        })
        .filter((r) => r.date >= sinceDate);

      return records;
    }

    throw lastError ?? new Error(`[KrakenAdapter] Failed to fetch OHLC for ${pair} after ${MAX_ATTEMPTS} attempts`);
  }
}

