/**
 * market-data/schemas.ts — Zod Anti-Corruption Layer for Market Data.
 *
 * These schemas are the single source of truth for validating external API
 * payloads (Kraken WS, CoinGecko REST, …) before they reach the domain layer.
 *
 * Adapters MUST parse raw API responses through these schemas.
 * On validation failure, an error must be surfaced (not swallowed silently).
 */

import { z } from 'zod';
import { preciseAmountSchema } from '../schemas/transactions.js';
import type { AssetPrice, GlobalMarketMetrics } from './models.js';

// ---------------------------------------------------------------------------
// AssetPrice schema
// ---------------------------------------------------------------------------

export const AssetPriceSchema = z.object({
  symbol: z.string().min(1).toUpperCase(),
  currency: z.string().min(1).toUpperCase(),
  price: preciseAmountSchema.refine((val) => !val.startsWith('-'), "Price cannot be negative"),
  change24hPercent: preciseAmountSchema,
  provider: z.string().min(1),
  timestamp: z.string().datetime({ offset: true }),
}) satisfies z.ZodType<AssetPrice>;

// ---------------------------------------------------------------------------
// GlobalMarketMetrics schema
// ---------------------------------------------------------------------------

export const GlobalMarketMetricsSchema = z.object({
  totalMarketCapUsd: preciseAmountSchema,
  marketCapChange24hPercent: preciseAmountSchema,
  fearGreedIndex: z.number().min(0).max(100).nullable(),
  fearGreedLabel: z.string().nullable(),
  topAssets: z.array(AssetPriceSchema),
  timestamp: z.string().datetime({ offset: true }),
}) satisfies z.ZodType<GlobalMarketMetrics>;

// ---------------------------------------------------------------------------
// Raw Kraken WS v2 payload schema (Anti-Corruption)
// Kraken WS v2 sends ticker frames as a JSON object:
//   { "channel": "ticker", "type": "update", "data": [{ "symbol": "BTC/USD", "last": 65000.0, ... }] }
// Reference: https://docs.kraken.com/api/docs/websocket-v2/ticker
// ---------------------------------------------------------------------------

export const KrakenV2TickerItemSchema = z.object({
  /** Trading pair symbol, e.g. "BTC/USD" */
  symbol: z.string(),
  /** Best bid price */
  bid: z.number(),
  /** Best bid quantity */
  bid_qty: z.number(),
  /** Best ask price */
  ask: z.number(),
  /** Best ask quantity */
  ask_qty: z.number(),
  /** Last trade price */
  last: z.number(),
  /** 24h volume */
  volume: z.number(),
  /** Volume-weighted average price over 24h */
  vwap: z.number(),
  /** 24h low price */
  low: z.number(),
  /** 24h high price */
  high: z.number(),
  /** Price change since open */
  change: z.number(),
  /** Percentage price change since open */
  change_pct: z.number(),
});

export type KrakenV2TickerItem = z.infer<typeof KrakenV2TickerItemSchema>;

/**
 * Full Kraken WS v2 ticker message (object envelope).
 * { "channel": "ticker", "type": "update"|"snapshot", "data": [KrakenV2TickerItem] }
 */
export const KrakenWsTickerMessageSchema = z.object({
  channel: z.literal('ticker'),
  type: z.enum(['update', 'snapshot']),
  data: z.array(KrakenV2TickerItemSchema).min(1),
});

export type KrakenWsTickerMessage = z.infer<typeof KrakenWsTickerMessageSchema>;

// ---------------------------------------------------------------------------
// Raw Binance WS payload schema (Anti-Corruption)
// Binance combined stream wraps individual ticker frames:
//   { "stream": "btcusdt@ticker", "data": { "e": "24hrTicker", "s": "BTCUSDT", "c": "65000.0", "P": "2.5" } }
// Reference: https://developers.binance.com/docs/binance-spot-api-docs/web-socket-streams#individual-symbol-ticker-streams
// ---------------------------------------------------------------------------

export const BinanceTickerDataSchema = z.object({
  /** Event type */
  e: z.literal('24hrTicker'),
  /** Symbol, e.g. "BTCUSDT" */
  s: z.string().min(1),
  /** Last price (string) */
  c: z.string(),
  /** Price change percent (string) */
  P: z.string(),
});

export const BinanceCombinedStreamMessageSchema = z.object({
  stream: z.string(),
  data: BinanceTickerDataSchema,
});

export type BinanceCombinedStreamMessage = z.infer<typeof BinanceCombinedStreamMessageSchema>;

// ---------------------------------------------------------------------------
// Raw Coinbase WS payload schema (Anti-Corruption)
// Coinbase Advanced Trade WS sends ticker frames as:
//   { "type": "ticker", "product_id": "BTC-USD", "price": "65000.00", "open_24h": "63000.00" }
// Reference: https://docs.cdp.coinbase.com/exchange/docs/websocket-channels#ticker-channel
// ---------------------------------------------------------------------------

export const CoinbaseTickerMessageSchema = z.object({
  type: z.literal('ticker'),
  /** Product ID, e.g. "BTC-USD" */
  product_id: z.string().regex(/^[A-Z]+-[A-Z]+$/, 'Expected format: BASE-QUOTE'),
  /** Last trade price as string */
  price: z.string(),
  /** 24h open price as string (optional, used for change calculation) */
  open_24h: z.string().optional(),
});

export type CoinbaseTickerMessage = z.infer<typeof CoinbaseTickerMessageSchema>;

// ---------------------------------------------------------------------------
// Raw Bit2Me WS payload schema (Anti-Corruption)
// Bit2Me Trading WS sends ticker frames as:
//   { "event": "ticker", "data": { "symbol": "BTC/EUR", "price": "65000.0", "change24h": "2.5" } }
// ---------------------------------------------------------------------------

export const Bit2MeTickerDataSchema = z.object({
  /** Trading pair symbol, e.g. "BTC/EUR" */
  symbol: z.string().regex(/^[A-Z]+\/[A-Z]+$/, 'Expected format: BASE/QUOTE'),
  /** Last price */
  price: z.coerce.string(),
  /** 24h price change percent */
  change24h: z.coerce.string().optional(),
});

export const Bit2MeTickerMessageSchema = z.object({
  event: z.literal('ticker'),
  data: Bit2MeTickerDataSchema,
});

export type Bit2MeTickerMessage = z.infer<typeof Bit2MeTickerMessageSchema>;

// ---------------------------------------------------------------------------
// Raw CoinGecko REST payload schema (Anti-Corruption)
// From /coins/markets endpoint
// ---------------------------------------------------------------------------

export const CoinGeckoMarketItemSchema = z.object({
  id: z.string(),
  symbol: z.string(),
  name: z.string(),
  // CoinGecko returns numbers; coerce to string for domain precision layer
  current_price: z.coerce.string().nullable(),
  price_change_percentage_24h: z.coerce.string().nullable(),
  market_cap: z.coerce.string().nullable(),
  last_updated: z.string(),
});

export type CoinGeckoMarketItem = z.infer<typeof CoinGeckoMarketItemSchema>;

export const CoinGeckoMarketsResponseSchema = z.array(CoinGeckoMarketItemSchema);

export const CoinGeckoGlobalDataSchema = z.object({
  data: z.object({
    // CoinGecko returns numbers; coerce to string for domain precision layer
    total_market_cap: z.record(z.string(), z.coerce.string()),
    market_cap_change_percentage_24h_usd: z.coerce.string(),
    updated_at: z.number(),
  }),
});

export type CoinGeckoGlobalData = z.infer<typeof CoinGeckoGlobalDataSchema>;

// ---------------------------------------------------------------------------
// SSE event envelope — what the backend streams to the frontend
// ---------------------------------------------------------------------------

export const SseMarketEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('price'),
    data: AssetPriceSchema,
  }),
  z.object({
    type: z.literal('global'),
    data: GlobalMarketMetricsSchema,
  }),
  z.object({
    type: z.literal('error'),
    data: z.object({ message: z.string() }),
  }),
]);

export type SseMarketEvent = z.infer<typeof SseMarketEventSchema>;
