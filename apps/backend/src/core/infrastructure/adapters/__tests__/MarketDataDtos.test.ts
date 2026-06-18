import { describe, it, expect } from 'vitest';
import {
  AssetPriceSchema,
  GlobalMarketMetricsSchema,
  KrakenWsTickerMessageSchema,
  CoinGeckoMarketsResponseSchema,
  CoinGeckoGlobalDataSchema,
  SseMarketEventSchema,
} from '@kryptofolio/shared-types';

// ── Mock payloads ──────────────────────────────────────────────────────────

const VALID_KRAKEN_TICKER_MSG = [
  42,
  {
    a: ['65000.00', 1, '1.000'],
    b: ['64999.00', 1, '1.000'],
    c: ['65000.00', '0.001'],
    o: ['63000.00', '63500.00'],
  },
  'ticker',
  'XBT/USD',
] as const;

const VALID_COINGECKO_MARKETS = [
  {
    id: 'bitcoin',
    symbol: 'btc',
    name: 'Bitcoin',
    current_price: 65_000,
    price_change_percentage_24h: 2.5,
    market_cap: 1_280_000_000_000,
    last_updated: '2024-01-15T12:00:00.000Z',
  },
];

const VALID_COINGECKO_GLOBAL = {
  data: {
    total_market_cap: { usd: 2_500_000_000_000 },
    market_cap_change_percentage_24h_usd: 1.8,
    updated_at: 1705320000,
  },
};

// ── Tests ──────────────────────────────────────────────────────────────────

describe('AssetPriceSchema', () => {
  it('parses a valid AssetPrice', () => {
    const input = {
      symbol: 'btc',
      currency: 'usd',
      price: 65_000,
      change24hPercent: 2.5,
      provider: 'kraken',
      timestamp: '2024-01-15T12:00:00.000Z',
    };

    const result = AssetPriceSchema.parse(input);

    expect(result.symbol).toBe('BTC'); // toUpperCase transform
    expect(result.currency).toBe('USD');
    expect(result.price).toBe(65_000);
  });

  it('rejects a negative price', () => {
    const input = {
      symbol: 'BTC',
      currency: 'USD',
      price: -1,
      change24hPercent: 0,
      provider: 'kraken',
      timestamp: '2024-01-15T12:00:00.000Z',
    };

    expect(() => AssetPriceSchema.parse(input)).toThrow();
  });

  it('rejects a missing symbol', () => {
    const input = {
      currency: 'USD',
      price: 65_000,
      change24hPercent: 0,
      provider: 'kraken',
      timestamp: '2024-01-15T12:00:00.000Z',
    };

    expect(() => AssetPriceSchema.parse(input)).toThrow();
  });
});

describe('GlobalMarketMetricsSchema', () => {
  it('parses valid global metrics with null fearGreed fields', () => {
    const input = {
      totalMarketCapUsd: 2_500_000_000_000,
      marketCapChange24hPercent: 1.8,
      fearGreedIndex: null,
      fearGreedLabel: null,
      topAssets: [],
      timestamp: '2024-01-15T12:00:00.000Z',
    };

    const result = GlobalMarketMetricsSchema.parse(input);
    expect(result.fearGreedIndex).toBeNull();
  });

  it('rejects fearGreedIndex outside 0-100 range', () => {
    const input = {
      totalMarketCapUsd: 1_000,
      marketCapChange24hPercent: 0,
      fearGreedIndex: 101,
      fearGreedLabel: 'Extreme',
      topAssets: [],
      timestamp: '2024-01-15T12:00:00.000Z',
    };

    expect(() => GlobalMarketMetricsSchema.parse(input)).toThrow();
  });
});

describe('KrakenWsTickerMessageSchema', () => {
  it('parses a valid Kraken WS ticker message', () => {
    const result = KrakenWsTickerMessageSchema.safeParse(VALID_KRAKEN_TICKER_MSG);
    expect(result.success).toBe(true);
  });

  it('rejects a system heartbeat message (not an array with ticker)', () => {
    const heartbeat = { event: 'heartbeat' };
    const result = KrakenWsTickerMessageSchema.safeParse(heartbeat);
    expect(result.success).toBe(false);
  });

  it('rejects a message with wrong third element', () => {
    const msg = [42, VALID_KRAKEN_TICKER_MSG[1], 'ohlc', 'XBT/USD'];
    const result = KrakenWsTickerMessageSchema.safeParse(msg);
    expect(result.success).toBe(false);
  });
});

describe('CoinGeckoMarketsResponseSchema', () => {
  it('parses a valid /coins/markets response', () => {
    const result = CoinGeckoMarketsResponseSchema.safeParse(VALID_COINGECKO_MARKETS);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data[0]?.symbol).toBe('btc');
    }
  });

  it('allows null current_price (coin not listed on some pairs)', () => {
    const input = [{ ...VALID_COINGECKO_MARKETS[0], current_price: null }];
    const result = CoinGeckoMarketsResponseSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('rejects an item missing the id field', () => {
    const input = [{ symbol: 'btc', name: 'Bitcoin', current_price: 65_000, last_updated: '' }];
    const result = CoinGeckoMarketsResponseSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

describe('CoinGeckoGlobalDataSchema', () => {
  it('parses a valid /global response', () => {
    const result = CoinGeckoGlobalDataSchema.safeParse(VALID_COINGECKO_GLOBAL);
    expect(result.success).toBe(true);
  });
});

describe('SseMarketEventSchema', () => {
  it('parses a price SSE event', () => {
    const event = {
      type: 'price',
      data: {
        symbol: 'BTC',
        currency: 'USD',
        price: 65_000,
        change24hPercent: 2.5,
        provider: 'kraken',
        timestamp: '2024-01-15T12:00:00.000Z',
      },
    };

    const result = SseMarketEventSchema.safeParse(event);
    expect(result.success).toBe(true);
  });

  it('parses a global SSE event', () => {
    const event = {
      type: 'global',
      data: {
        totalMarketCapUsd: 2_500_000_000_000,
        marketCapChange24hPercent: 1.5,
        fearGreedIndex: 55,
        fearGreedLabel: 'Greed',
        topAssets: [],
        timestamp: '2024-01-15T12:00:00.000Z',
      },
    };

    const result = SseMarketEventSchema.safeParse(event);
    expect(result.success).toBe(true);
  });

  it('rejects an unknown event type', () => {
    const event = { type: 'trade', data: {} };
    const result = SseMarketEventSchema.safeParse(event);
    expect(result.success).toBe(false);
  });
});
