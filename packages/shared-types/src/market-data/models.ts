/**
 * market-data/models.ts — Shared domain interfaces for Market Data.
 *
 * These live in packages/shared-types so both the backend (adapters) and the
 * frontend (composables, views) refer to the SAME contracts without duplication.
 *
 * RULES:
 *  - No Zod imports here  ← Zod lives in schemas.ts (Anti-Corruption Layer)
 *  - No framework imports (Vue, Hono, etc.)
 *  - Pure TypeScript only
 */

// ---------------------------------------------------------------------------
// Category
// ---------------------------------------------------------------------------

/**
 * Category of a market data provider.
 * Mutually exclusive per vault: only ONE provider per category can be active.
 */
export type MarketCategory = 'crypto' | 'stocks' | 'forex' | 'general';

// ---------------------------------------------------------------------------
// AssetPrice
// ---------------------------------------------------------------------------

/**
 * A single price snapshot for a tradeable asset.
 * Emitted by the backend SSE stream and cached in InMemoryPriceHistoryAdapter.
 */
export interface AssetPrice {
  /** Ticker symbol, upper-cased (e.g. "BTC", "ETH") */
  symbol: string;
  /** Quote currency (e.g. "USD", "EUR") */
  currency: string;
  /** Current spot price */
  price: number;
  /** 24-hour percentage change (e.g. 2.3 = +2.3%) */
  change24hPercent: number;
  /** Provider that emitted this price (e.g. "kraken", "coingecko") */
  provider: string;
  /** ISO-8601 timestamp of when this price was captured */
  timestamp: string;
}

// ---------------------------------------------------------------------------
// GlobalMarketMetrics
// ---------------------------------------------------------------------------

/**
 * Global macro-level market metrics (e.g. total market cap, Fear & Greed index).
 * Polled periodically from REST providers such as CoinGecko.
 */
export interface GlobalMarketMetrics {
  /** Total crypto market cap in USD */
  totalMarketCapUsd: number;
  /** 24h market cap change percentage */
  marketCapChange24hPercent: number;
  /** Fear & Greed index value (0–100) */
  fearGreedIndex: number | null;
  /** Fear & Greed label (e.g. "Extreme Fear", "Greed") */
  fearGreedLabel: string | null;
  /** Top assets sorted by market cap descending */
  topAssets: AssetPrice[];
  /** ISO-8601 timestamp of this snapshot */
  timestamp: string;
}
