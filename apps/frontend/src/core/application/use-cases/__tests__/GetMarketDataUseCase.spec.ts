import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetMarketDataUseCase } from '../GetMarketDataUseCase';
import type { IMarketDataPort } from '@/core/domain/ports/IMarketDataPort';

// ── Helpers ────────────────────────────────────────────────────────────────

function createMockMarketDataPort(): IMarketDataPort {
  return {
    subscribeToStream: vi.fn().mockReturnValue(() => undefined),
    getGlobalMetrics: vi.fn().mockResolvedValue({
      totalMarketCapUsd: 0,
      marketCapChange24hPercent: 0,
      fearGreedIndex: null,
      fearGreedLabel: null,
      topAssets: [],
      timestamp: new Date().toISOString(),
    }),
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('GetMarketDataUseCase', () => {
  let port: ReturnType<typeof createMockMarketDataPort>;
  let useCase: GetMarketDataUseCase;

  beforeEach(() => {
    port = createMockMarketDataPort();
    useCase = new GetMarketDataUseCase(port);
  });

  it('delegates subscribeToStream to the port and returns the cleanup function', () => {
    const onPrice = vi.fn();
    const cleanup = useCase.subscribeToStream(onPrice);

    expect(port.subscribeToStream).toHaveBeenCalledWith(onPrice, undefined);
    expect(typeof cleanup).toBe('function');
  });

  it('passes the optional onError callback to the port', () => {
    const onPrice = vi.fn();
    const onError = vi.fn();

    useCase.subscribeToStream(onPrice, onError);

    expect(port.subscribeToStream).toHaveBeenCalledWith(onPrice, onError);
  });

  it('delegates getGlobalMetrics to the port', async () => {
    await useCase.getGlobalMetrics();
    expect(port.getGlobalMetrics).toHaveBeenCalledOnce();
  });

  it('returns the resolved GlobalMarketMetrics from the port', async () => {
    const result = await useCase.getGlobalMetrics();
    expect(result.topAssets).toEqual([]);
    expect(result.fearGreedIndex).toBeNull();
  });
});
