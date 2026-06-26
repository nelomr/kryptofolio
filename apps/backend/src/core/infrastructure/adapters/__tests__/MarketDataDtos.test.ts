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

// Kraken WS v2 format: a JSON object with channel, type, and data array
const VALID_KRAKEN_V2_TICKER_MSG = {
  channel: 'ticker',
  type: 'update',
  data: [
    {
      symbol: 'BTC/USD',
      bid: 64999.0,
      bid_qty: 1.5,
      ask: 65001.0,
      ask_qty: 0.5,
      last: 65000.0,
      volume: 1234.56,
      vwap: 64800.0,
      low: 63000.0,
      high: 66000.0,
      change: 2000.0,
      change_pct: 3.17,
    },
  ],
};

const VALID_COINGECKO_MARKETS = [
  {
    id: 'bitcoin',
    symbol: 'btc',
    name: 'Bitcoin',
    current_price: "65000",
    price_change_percentage_24h: "2.5",
    market_cap: "1280000000000",
    last_updated: '2024-01-15T12:00:00.000Z',
  },
];

const VALID_COINGECKO_GLOBAL = {
  data: {
    total_market_cap: { usd: "2500000000000" },
    market_cap_change_percentage_24h_usd: "1.8",
    updated_at: 1705320000,
  },
};

// ── Tests ──────────────────────────────────────────────────────────────────

describe('AssetPriceSchema', () => {
  it('parses a valid AssetPrice', () => {
    const input = {
      symbol: 'btc',
      currency: 'usd',
      price: "65000",
      change24hPercent: "2.5",
      provider: 'kraken',
      timestamp: '2024-01-15T12:00:00.000Z',
    };

    const result = AssetPriceSchema.parse(input);

    expect(result.symbol).toBe('BTC'); // toUpperCase transform
    expect(result.currency).toBe('USD');
    expect(result.price).toBe("65000");
  });

  it('rejects a negative price', () => {
    const input = {
      symbol: 'BTC',
      currency: 'USD',
      price: "-1",
      change24hPercent: "0",
      provider: 'kraken',
      timestamp: '2024-01-15T12:00:00.000Z',
    };

    expect(() => AssetPriceSchema.parse(input)).toThrow();
  });

  it('rejects a missing symbol', () => {
    const input = {
      currency: 'USD',
      price: "65000",
      change24hPercent: "0",
      provider: 'kraken',
      timestamp: '2024-01-15T12:00:00.000Z',
    };

    expect(() => AssetPriceSchema.parse(input)).toThrow();
  });
});

describe('GlobalMarketMetricsSchema', () => {
  it('parses valid global metrics with null fearGreed fields', () => {
    const input = {
      totalMarketCapUsd: "2500000000000",
      marketCapChange24hPercent: "1.8",
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
      totalMarketCapUsd: "1000",
      marketCapChange24hPercent: "0",
      fearGreedIndex: 101,
      fearGreedLabel: 'Extreme',
      topAssets: [],
      timestamp: '2024-01-15T12:00:00.000Z',
    };

    expect(() => GlobalMarketMetricsSchema.parse(input)).toThrow();
  });
});

describe('KrakenWsTickerMessageSchema', () => {
  it('parses a valid Kraken WS v2 ticker update message', () => {
    const result = KrakenWsTickerMessageSchema.safeParse(VALID_KRAKEN_V2_TICKER_MSG);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.channel).toBe('ticker');
      expect(result.data.data[0]?.symbol).toBe('BTC/USD');
      expect(result.data.data[0]?.last).toBe(65000.0);
    }
  });

  it('rejects a non-ticker channel message', () => {
    const msg = { channel: 'book', type: 'update', data: [] };
    const result = KrakenWsTickerMessageSchema.safeParse(msg);
    expect(result.success).toBe(false);
  });

  it('rejects the old v1 array-based format', () => {
    const v1Msg = [42, { a: ['65000', '1', '1'], b: ['64999', '1', '1'], c: ['65000', '0.001'], o: ['63000', '63500'] }, 'ticker', 'XBT/USD'];
    const result = KrakenWsTickerMessageSchema.safeParse(v1Msg);
    expect(result.success).toBe(false);
  });

  it('rejects a heartbeat message', () => {
    const heartbeat = { channel: 'heartbeat' };
    const result = KrakenWsTickerMessageSchema.safeParse(heartbeat);
    expect(result.success).toBe(false);
  });

  it('rejects a message with missing data array', () => {
    const msg = { channel: 'ticker', type: 'update' };
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
    const input = [{ symbol: 'btc', name: 'Bitcoin', current_price: "65000", last_updated: '' }];
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
        price: "65000",
        change24hPercent: "2.5",
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
        totalMarketCapUsd: "2500000000000",
        marketCapChange24hPercent: "1.5",
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
