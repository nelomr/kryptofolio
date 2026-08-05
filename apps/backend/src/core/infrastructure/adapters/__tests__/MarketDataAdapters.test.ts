/**
 * Integration-style unit tests for KrakenMarketDataAdapter and CoinGeckoMarketDataAdapter.
 *
 * Tests verify:
 * 1. That adapters implement the IMarketDataProvider.onError() contract
 * 2. That Zod validation failures call onError (not fail silently)
 * 3. That HTTP 429 in CoinGecko calls onError
 * 4. That valid messages call onPrice correctly
 *
 * WebSocket connections are mocked using a fake WebSocket class.
 * fetch() is mocked using vi.stubGlobal.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AssetPrice } from '@kryptofolio/shared-types';
import { CoinGeckoMarketDataAdapter } from '../CoinGeckoMarketDataAdapter.js';
import { KrakenMarketDataAdapter } from '../KrakenMarketDataAdapter.js';
import { WebSocket } from 'ws';

/**
 * The shape of the mocked `ws` module's instances and its `lastInstance` static, named here so the
 * one place that reads them back (`wsInstance` below) can do so through a real type instead of `any`
 * — the mock class itself lives inside the `vi.mock` factory and isn't importable by name.
 */
type MockWebSocketListener = (...args: unknown[]) => void;

interface MockWebSocketInstance {
  listeners: Record<string, MockWebSocketListener[]>;
  on: ReturnType<typeof vi.fn>;
  emit: (event: string, ...args: unknown[]) => void;
  send: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
}

interface MockWebSocketStatic {
  lastInstance: MockWebSocketInstance | null;
}

vi.mock('ws', () => {
  class MockWebSocket implements MockWebSocketInstance {
    static lastInstance: MockWebSocket | null = null;
    constructor() {
      MockWebSocket.lastInstance = this;
    }
    listeners: Record<string, MockWebSocketListener[]> = {};
    on = vi.fn().mockImplementation((event: string, callback: MockWebSocketListener) => {
      if (!this.listeners[event]) this.listeners[event] = [];
      this.listeners[event].push(callback);
    });
    emit = (event: string, ...args: unknown[]) => {
      if (this.listeners[event]) {
        this.listeners[event].forEach((cb) => cb(...args));
      }
    };
    send = vi.fn();
    close = vi.fn();
  }
  return { WebSocket: MockWebSocket };
});

// ── Helpers ────────────────────────────────────────────────────────────────

function mockFetch(status: number, body: unknown): void {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  }));
}

const VALID_COINGECKO_MARKETS_RESPONSE = [
  {
    id: 'bitcoin',
    symbol: 'btc',
    name: 'Bitcoin',
    current_price: 65000,
    price_change_percentage_24h: 2.5,
    market_cap: 1280000000000,
    last_updated: '2024-01-15T12:00:00.000Z',
  },
];

// ── CoinGeckoMarketDataAdapter Tests ──────────────────────────────────────

describe('CoinGeckoMarketDataAdapter', () => {
  let adapter: CoinGeckoMarketDataAdapter;
  let onError: ReturnType<typeof vi.fn<(error: Error) => void>>;
  let onPrice: ReturnType<typeof vi.fn<(price: AssetPrice) => void>>;

  beforeEach(() => {
    adapter = new CoinGeckoMarketDataAdapter(
      ['bitcoin'],
      'usd',
      999_999, // High poll interval so it doesn't auto-poll in tests
      'https://api.coingecko.com/api/v3',
    );
    onError = vi.fn<(error: Error) => void>();
    onPrice = vi.fn<(price: AssetPrice) => void>();
    adapter.onError(onError);
    adapter.onPrice(onPrice);
  });

  afterEach(async () => {
    await adapter.disconnect();
    vi.unstubAllGlobals();
  });

  it('calls onError — NOT onPrice — when CoinGecko responds with HTTP 429', async () => {
    mockFetch(429, { status: '429', error: 'You have exceeded the Rate Limit' });

    await adapter.connect();

    // fetchPrices is called twice (usd + eur), so onError fires at least twice (once per 429)
    expect(onError).toHaveBeenCalled();
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
    expect((onError.mock.calls[0][0] as Error).message).toContain('429');
    expect(onPrice).not.toHaveBeenCalled();
  });

  it('calls onError — NOT onPrice — when CoinGecko returns a malformed payload', async () => {
    mockFetch(200, [{ id: 'bitcoin' }]); // Missing required fields

    await adapter.connect();

    // At least one error for the malformed payload
    expect(onError).toHaveBeenCalled();
    expect((onError.mock.calls[0][0] as Error).message).toContain('coingecko');
    expect(onPrice).not.toHaveBeenCalled();
  });

  it('calls onPrice when the response is valid', async () => {
    mockFetch(200, VALID_COINGECKO_MARKETS_RESPONSE);

    await adapter.connect();

    // fetchPrices is called for USD and EUR (2 calls to onPrice)
    expect(onPrice).toHaveBeenCalledTimes(2);
    const price = onPrice.mock.calls[0][0];
    expect(price.symbol).toBe('BTC');
    expect(price.provider).toBe('coingecko');
    expect(onError).not.toHaveBeenCalled();
  });

  it('skips coins with null current_price without calling onError', async () => {
    mockFetch(200, [{ ...VALID_COINGECKO_MARKETS_RESPONSE[0], current_price: null }]);

    await adapter.connect();

    expect(onPrice).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it('calls onError on network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

    await adapter.connect();

    expect(onError).toHaveBeenCalled();
    expect((onError.mock.calls[0][0] as Error).message).toContain('Network error');
  });
});

// ── WebSocket Adapters Tests (Kraken as representative) ───────────────────

describe('WebSocket Adapters (e.g. KrakenMarketDataAdapter)', () => {
  let adapter: KrakenMarketDataAdapter;
  let onError: ReturnType<typeof vi.fn<(error: Error) => void>>;
  let onPrice: ReturnType<typeof vi.fn<(price: AssetPrice) => void>>;

  beforeEach(() => {
    adapter = new KrakenMarketDataAdapter(['BTC/USD']);
    onError = vi.fn<(error: Error) => void>();
    onPrice = vi.fn<(price: AssetPrice) => void>();
    adapter.onError(onError);
    adapter.onPrice(onPrice);
  });

  afterEach(async () => {
    await adapter.disconnect();
    vi.clearAllMocks();
  });

  it('calls onError when the WebSocket encounters an unexpected error while connected', async () => {
    // Start connecting...
    const connectPromise = adapter.connect();
    
    // The adapter creates a new WebSocket instance. We can grab it from vitest mock instances
    // or just rely on the fact that we can grab the connected state if we trigger the open event.
    // Let's get the active mock instance.
    const MockWsClass = WebSocket as unknown as MockWebSocketStatic;
    const wsInstance = MockWsClass.lastInstance;
    if (!wsInstance) throw new Error('adapter.connect() did not construct a WebSocket mock instance');

    // Simulate connection established
    wsInstance.emit('open');
    await connectPromise;

    expect(adapter.isConnected()).toBe(true);

    // Simulate an unexpected disconnect or network error post-connection
    const fakeError = new Error('ECONNRESET: Connection reset by peer');
    wsInstance.emit('error', fakeError);

    // Verify onError was called with our fake error
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(fakeError);
  });
});
