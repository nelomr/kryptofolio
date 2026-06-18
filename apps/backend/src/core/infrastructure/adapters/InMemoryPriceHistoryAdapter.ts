import type { AssetPrice } from '@kryptofolio/shared-types';
import type { IPriceHistoryPort } from '../../domain/ports/IPriceHistoryPort.js';

/**
 * InMemoryPriceHistoryAdapter — Infrastructure Adapter (in-memory cache).
 *
 * Implements IPriceHistoryPort for development and as a runtime hot-cache
 * before optional persistence to DuckDB.
 *
 * Storage key: `${symbol}:${currency}` (upper-cased)
 * Per-key ring-buffer capped at `maxEntriesPerSymbol` entries (default 1440 = 24 h at 1 min).
 */
export class InMemoryPriceHistoryAdapter implements IPriceHistoryPort {
  /** Ring buffer per symbol:currency */
  private readonly store = new Map<string, AssetPrice[]>();
  private readonly maxEntriesPerSymbol: number;

  constructor(maxEntriesPerSymbol = 1440) {
    this.maxEntriesPerSymbol = maxEntriesPerSymbol;
  }

  // ---------------------------------------------------------------------------
  // IPriceHistoryPort
  // ---------------------------------------------------------------------------

  async save(price: AssetPrice): Promise<void> {
    const key = this.makeKey(price.symbol, price.currency);
    const existing = this.store.get(key) ?? [];

    existing.push(price);

    // Trim the ring buffer to stay within the cap
    if (existing.length > this.maxEntriesPerSymbol) {
      existing.splice(0, existing.length - this.maxEntriesPerSymbol);
    }

    this.store.set(key, existing);
  }

  async getLatest(symbol: string, currency: string): Promise<AssetPrice | null> {
    const key = this.makeKey(symbol, currency);
    const entries = this.store.get(key);
    if (!entries || entries.length === 0) return null;

    return entries[entries.length - 1] ?? null;
  }

  async getHistory(
    symbol: string,
    currency: string,
    from: string,
    to?: string,
  ): Promise<AssetPrice[]> {
    const key = this.makeKey(symbol, currency);
    const entries = this.store.get(key) ?? [];

    const fromMs = new Date(from).getTime();
    const toMs = to ? new Date(to).getTime() : Date.now();

    return entries.filter((p) => {
      const ts = new Date(p.timestamp).getTime();
      return ts >= fromMs && ts <= toMs;
    });
  }

  async getTrackedSymbols(): Promise<string[]> {
    return [...this.store.keys()];
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private makeKey(symbol: string, currency: string): string {
    return `${symbol.toUpperCase()}:${currency.toUpperCase()}`;
  }
}
