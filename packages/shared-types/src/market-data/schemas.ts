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
import type { AssetPrice, GlobalMarketMetrics } from './models.js';

// ---------------------------------------------------------------------------
// AssetPrice schema
// ---------------------------------------------------------------------------

export const AssetPriceSchema = z.object({
  symbol: z.string().min(1).toUpperCase(),
  currency: z.string().min(1).toUpperCase(),
  price: z.number().nonnegative(),
  change24hPercent: z.number(),
  provider: z.string().min(1),
  timestamp: z.string().datetime({ offset: true }),
}) satisfies z.ZodType<AssetPrice>;

// ---------------------------------------------------------------------------
// GlobalMarketMetrics schema
// ---------------------------------------------------------------------------

export const GlobalMarketMetricsSchema = z.object({
  totalMarketCapUsd: z.number().nonnegative(),
  marketCapChange24hPercent: z.number(),
  fearGreedIndex: z.number().min(0).max(100).nullable(),
  fearGreedLabel: z.string().nullable(),
  topAssets: z.array(AssetPriceSchema),
  timestamp: z.string().datetime({ offset: true }),
}) satisfies z.ZodType<GlobalMarketMetrics>;

// ---------------------------------------------------------------------------
// Raw Kraken WS payload schema (Anti-Corruption)
// Kraken sends a ticker frame as an array: [channelId, {...}, "ticker", "XBT/USD"]
// ---------------------------------------------------------------------------

export const KrakenTickerPayloadSchema = z.object({
  /** Ask price info: [price, wholeLotVolume, lotVolume] */
  a: z.tuple([z.string(), z.number(), z.string()]),
  /** Bid price info */
  b: z.tuple([z.string(), z.number(), z.string()]),
  /** Last trade: [price, lotVolume] */
  c: z.tuple([z.string(), z.string()]),
  /** 24-h opening price */
  o: z.tuple([z.string(), z.string()]),
});

export type KrakenTickerPayload = z.infer<typeof KrakenTickerPayloadSchema>;

/**
 * Full Kraken WS message (the tuple-based envelope).
 * [channelId, tickerData, "ticker", "SYMBOL/QUOTE"]
 */
export const KrakenWsTickerMessageSchema = z.tuple([
  z.number(),
  KrakenTickerPayloadSchema,
  z.literal('ticker'),
  z.string(),
]);

export type KrakenWsTickerMessage = z.infer<typeof KrakenWsTickerMessageSchema>;

// ---------------------------------------------------------------------------
// Raw CoinGecko REST payload schema (Anti-Corruption)
// From /coins/markets endpoint
// ---------------------------------------------------------------------------

export const CoinGeckoMarketItemSchema = z.object({
  id: z.string(),
  symbol: z.string(),
  name: z.string(),
  current_price: z.number().nullable(),
  price_change_percentage_24h: z.number().nullable(),
  market_cap: z.number().nullable(),
  last_updated: z.string(),
});

export type CoinGeckoMarketItem = z.infer<typeof CoinGeckoMarketItemSchema>;

export const CoinGeckoMarketsResponseSchema = z.array(CoinGeckoMarketItemSchema);

export const CoinGeckoGlobalDataSchema = z.object({
  data: z.object({
    total_market_cap: z.record(z.string(), z.number()),
    market_cap_change_percentage_24h_usd: z.number(),
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
