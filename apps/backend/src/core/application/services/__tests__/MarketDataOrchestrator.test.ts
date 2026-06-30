import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MarketDataOrchestrator } from '../MarketDataOrchestrator.js';
import type { IMarketDataProvider } from '../../../domain/ports/IMarketDataProvider.js';
import type { AssetPrice } from '@kryptofolio/shared-types';

// ── Helpers ────────────────────────────────────────────────────────────────

function createMockProvider(
  id: string,
  category: 'crypto' | 'stocks' = 'crypto',
): IMarketDataProvider {
  return {
    id,
    category,
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    onPrice: vi.fn(),
    onError: vi.fn(),
    isConnected: vi.fn().mockReturnValue(false),
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('MarketDataOrchestrator', () => {
  let orchestrator: MarketDataOrchestrator;
  let sseCallback: (price: AssetPrice) => void;

  beforeEach(() => {
    sseCallback = vi.fn();
    orchestrator = new MarketDataOrchestrator(sseCallback);
  });

  // Task 3.2 spec — safe toggling

  it('connects a provider and marks it as active', async () => {
    const provider = createMockProvider('kraken');

    await orchestrator.activate(provider);

    expect(provider.connect).toHaveBeenCalledOnce();
    expect(orchestrator.getActiveProvider('crypto')).toBe(provider);
  });

  it('disconnects the previous provider before connecting a new one (category exclusivity)', async () => {
    const providerA = createMockProvider('kraken');
    const providerB = createMockProvider('coingecko');

    await orchestrator.activate(providerA);
    await orchestrator.activate(providerB);

    // Old provider must have been cleanly stopped
    expect(providerA.disconnect).toHaveBeenCalledOnce();
    // New provider must be connected
    expect(providerB.connect).toHaveBeenCalledOnce();
    expect(orchestrator.getActiveProvider('crypto')).toBe(providerB);
  });

  it('deactivating a provider calls disconnect and clears the slot', async () => {
    const provider = createMockProvider('kraken');

    await orchestrator.activate(provider);
    await orchestrator.deactivate('crypto');

    expect(provider.disconnect).toHaveBeenCalledOnce();
    expect(orchestrator.getActiveProvider('crypto')).toBeNull();
  });

  it('deactivating a non-active category is a no-op (does not throw)', async () => {
    await expect(orchestrator.deactivate('stocks')).resolves.toBeUndefined();
  });

  it('forwards onPrice events to the SSE broadcast callback', async () => {
    const provider = createMockProvider('kraken');
    let capturedCallback: ((price: AssetPrice) => void) | undefined;

    (provider.onPrice as ReturnType<typeof vi.fn>).mockImplementation(
      (cb: (price: AssetPrice) => void) => {
        capturedCallback = cb;
      },
    );

    await orchestrator.activate(provider);

    const price: AssetPrice = {
      symbol: 'BTC',
      currency: 'USD',
      price: '65000',
      change24hPercent: '1.2',
      provider: 'kraken',
      timestamp: new Date().toISOString(),
    };

    capturedCallback!(price);

    expect(sseCallback).toHaveBeenCalledWith(price);
  });

  it('providers with different categories coexist independently', async () => {
    const cryptoProvider = createMockProvider('kraken', 'crypto');
    const stockProvider = createMockProvider('yahoo', 'stocks');

    await orchestrator.activate(cryptoProvider);
    await orchestrator.activate(stockProvider);

    // Neither should have been disconnected by the other
    expect(cryptoProvider.disconnect).not.toHaveBeenCalled();
    expect(stockProvider.disconnect).not.toHaveBeenCalled();

    expect(orchestrator.getActiveProvider('crypto')).toBe(cryptoProvider);
    expect(orchestrator.getActiveProvider('stocks')).toBe(stockProvider);
  });

  it('subscribes to the provider onError callback when activating', async () => {
    const provider = createMockProvider('kraken');

    await orchestrator.activate(provider);

    // The orchestrator must subscribe to onError on activation
    expect(provider.onError).toHaveBeenCalledOnce();
  });

  it('logs errors from the provider via the onError callback', async () => {
    const provider = createMockProvider('kraken');
    let capturedErrorCallback: ((error: Error) => void) | undefined;

    (provider.onError as ReturnType<typeof vi.fn>).mockImplementation(
      (cb: (error: Error) => void) => {
        capturedErrorCallback = cb;
      },
    );

    await orchestrator.activate(provider);

    // When an error is emitted, it should not crash — orchestrator handles it
    expect(() =>
      capturedErrorCallback!(new Error('Zod validation failed')),
    ).not.toThrow();
  });
});
