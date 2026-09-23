/**
 * FifoChainFreshnessService — single-flight coalescence over IDerivedChainPort.rebuild()
 * (design D4). Every test here is deterministic: a rebuild's completion is controlled by
 * the test via an explicit deferred, never by a timer or a real delay.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IUserSettingsPort } from '../../../domain/ports/IUserSettingsPort.js';
import type { IDerivedChainPort } from '../../../domain/ports/IDerivedChainPort.js';
import type { FifoBuildId, FifoChainState } from '../../../domain/models/FifoChainState.js';
import { FifoChainFreshnessService, RebuildFailedError } from '../FifoChainFreshnessService.js';
import type { MaterializationSummary } from '../FifoMaterializerService.js';

const NOTHING = { inserted: 0, updated: 0, retired: 0, reactivated: 0 };
const SUMMARY: MaterializationSummary = {
  taxLots: { ...NOTHING, reactivated: 3 },
  lotHistoryEvents: { ...NOTHING },
  custodyEntries: { ...NOTHING },
  flagged: 0,
  pendingReview: 0,
};

function freshState(buildId: string): FifoChainState {
  return { kind: 'fresh', buildId: buildId as FifoBuildId, builtAt: '2026-01-01T00:00:00Z' };
}

function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void } {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function fakeUserSettings(initial: Record<string, string> = {}): IUserSettingsPort & {
  readonly store: Record<string, string>;
} {
  const store: Record<string, string> = { ...initial };
  return {
    store,
    async getSetting(key: string) {
      return store[key] ?? null;
    },
    async setSetting(key: string, value: string) {
      store[key] = value;
    },
  };
}

describe('FifoChainFreshnessService', () => {
  let userSettings: ReturnType<typeof fakeUserSettings>;
  let rebuild: ReturnType<typeof vi.fn<() => Promise<FifoBuildId>>>;
  let describeChain: ReturnType<typeof vi.fn<() => Promise<FifoChainState>>>;
  let port: IDerivedChainPort;
  let service: FifoChainFreshnessService;
  let delayCalls: number[];
  let recalculate: ReturnType<typeof vi.fn<() => Promise<MaterializationSummary>>>;

  beforeEach(() => {
    userSettings = fakeUserSettings({ needs_recalculation: 'true' });
    rebuild = vi.fn();
    describeChain = vi.fn();
    port = { rebuild, describe: describeChain };
    recalculate = vi.fn(async () => SUMMARY);
    delayCalls = [];
    // Records the requested backoff instead of actually waiting — the coalescence and
    // backoff properties are correctness properties, not timing properties, and this
    // project's own doctrine is that a test controlling completion via a real delay is a
    // flake waiting to happen.
    service = new FifoChainFreshnessService(userSettings, port, { recalculate }, async (ms) => {
      delayCalls.push(ms);
    });
  });

  describe('the derived-state pipeline (design D4a)', () => {
    function recordOrder(): string[] {
      const order: string[] = [];
      rebuild.mockImplementation(async () => {
        order.push('rebuild');
        return 'build-1' as FifoBuildId;
      });
      recalculate.mockImplementation(async () => {
        order.push(`reconcile(flag=${userSettings.store.needs_recalculation})`);
        return SUMMARY;
      });
      const originalSet = userSettings.setSetting.bind(userSettings);
      userSettings.setSetting = async (key: string, value: string) => {
        order.push(`set ${key}=${value}`);
        await originalSet(key, value);
      };
      describeChain.mockResolvedValue(freshState('build-1'));
      return order;
    }

    it('runs rebuild, then reconciliation, then clears the flag — in that order', async () => {
      const order = recordOrder();

      await service.ensureFresh();

      expect(order).toEqual([
        'rebuild',
        'reconcile(flag=true)',
        'set needs_recalculation=false',
      ]);
    });

    it('leaves the flag dirty and rejects with the typed error when reconciliation fails', async () => {
      rebuild.mockResolvedValue('build-1' as FifoBuildId);
      describeChain.mockResolvedValue(freshState('build-1'));
      recalculate.mockRejectedValueOnce(new Error('SQLite is locked'));

      await expect(service.ensureFresh()).rejects.toBeInstanceOf(RebuildFailedError);
      expect(userSettings.store.needs_recalculation).toBe('true');
    });

    it('refresh() always runs the pipeline and returns the chain with the reconciliation summary', async () => {
      await userSettings.setSetting('needs_recalculation', 'false');
      const order = recordOrder();

      const result = await service.refresh();

      expect(order).toEqual([
        'rebuild',
        'reconcile(flag=false)',
        'set needs_recalculation=false',
      ]);
      expect(result.chain.buildId).toBe('build-1');
      expect(result.materialization).toEqual(SUMMARY);
    });

    it('refresh() called during an in-flight pipeline runs its own pipeline after it, never joining it', async () => {
      const gate = deferred<FifoBuildId>();
      rebuild.mockReturnValueOnce(gate.promise).mockResolvedValueOnce('build-2' as FifoBuildId);
      describeChain.mockResolvedValueOnce(freshState('build-1')).mockResolvedValue(freshState('build-2'));

      const onRead = service.ensureFresh();
      await Promise.resolve();
      const explicit = service.refresh();
      await Promise.resolve();
      expect(rebuild).toHaveBeenCalledTimes(1);

      gate.resolve('build-1' as FifoBuildId);
      const [readResult, refreshResult] = await Promise.all([onRead, explicit]);

      expect(rebuild).toHaveBeenCalledTimes(2);
      expect(recalculate).toHaveBeenCalledTimes(2);
      expect(readResult.buildId).toBe('build-1');
      expect(refreshResult.chain.buildId).toBe('build-2');
    });

    it('coalesces concurrent ensureFresh() callers onto one pipeline, reconciling once', async () => {
      const gate = deferred<FifoBuildId>();
      rebuild.mockReturnValue(gate.promise);
      describeChain.mockResolvedValue(freshState('build-1'));

      const calls = Array.from({ length: 5 }, () => service.ensureFresh());
      await Promise.resolve();
      gate.resolve('build-1' as FifoBuildId);
      await Promise.all(calls);

      expect(rebuild).toHaveBeenCalledTimes(1);
      expect(recalculate).toHaveBeenCalledTimes(1);
    });

    it('runs the full pipeline on a never-built chain even with a clean flag', async () => {
      await userSettings.setSetting('needs_recalculation', 'false');
      describeChain
        .mockResolvedValueOnce({ kind: 'stale', reason: 'never-built' } satisfies FifoChainState)
        .mockResolvedValue(freshState('build-first'));
      rebuild.mockResolvedValueOnce('build-first' as FifoBuildId);

      await service.ensureFresh();

      expect(rebuild).toHaveBeenCalledTimes(1);
      expect(recalculate).toHaveBeenCalledTimes(1);
    });

    it('a clean, fresh chain runs neither rebuild nor reconciliation', async () => {
      await userSettings.setSetting('needs_recalculation', 'false');
      describeChain.mockResolvedValue(freshState('build-current'));

      await service.ensureFresh();

      expect(rebuild).not.toHaveBeenCalled();
      expect(recalculate).not.toHaveBeenCalled();
    });
  });

  it('coalesces nine concurrent calls into exactly one rebuild, all resolving to the same build', async () => {
    const gate = deferred<FifoBuildId>();
    rebuild.mockReturnValue(gate.promise);
    describeChain.mockResolvedValue({
      kind: 'fresh',
      buildId: 'build-1' as FifoBuildId,
      builtAt: '2026-01-01T00:00:00Z',
    } satisfies FifoChainState);

    const calls = Array.from({ length: 9 }, () => service.ensureFresh());

    // Give the microtask queue a chance to run everything up to the point where each call
    // would be blocked on the in-flight rebuild — without ever resolving it.
    await Promise.resolve();
    await Promise.resolve();
    expect(rebuild).toHaveBeenCalledTimes(1);

    gate.resolve('build-1' as FifoBuildId);
    const results = await Promise.all(calls);

    expect(results).toHaveLength(9);
    for (const r of results) {
      expect(r.kind).toBe('fresh');
      expect(r.buildId).toBe('build-1');
    }
  });

  it('starts a new rebuild after settlement when the flag is dirty again', async () => {
    rebuild.mockResolvedValueOnce('build-1' as FifoBuildId);
    describeChain.mockResolvedValue({
      kind: 'fresh',
      buildId: 'build-1' as FifoBuildId,
      builtAt: '2026-01-01T00:00:00Z',
    } satisfies FifoChainState);

    await service.ensureFresh();
    expect(rebuild).toHaveBeenCalledTimes(1);

    await userSettings.setSetting('needs_recalculation', 'true');
    rebuild.mockResolvedValueOnce('build-2' as FifoBuildId);
    describeChain.mockResolvedValue({
      kind: 'fresh',
      buildId: 'build-2' as FifoBuildId,
      builtAt: '2026-01-01T00:01:00Z',
    } satisfies FifoChainState);

    const second = await service.ensureFresh();
    expect(rebuild).toHaveBeenCalledTimes(2);
    expect(second.buildId).toBe('build-2');
  });

  it('rejects all nine waiters with a typed failure, leaves the flag dirty, and lets the next call retry', async () => {
    const gate = deferred<FifoBuildId>();
    rebuild.mockReturnValueOnce(gate.promise);

    const calls = Array.from({ length: 9 }, () => service.ensureFresh().catch((e: unknown) => e));

    await Promise.resolve();
    await Promise.resolve();
    expect(rebuild).toHaveBeenCalledTimes(1);

    const failure = new Error('DuckDB is on fire');
    gate.reject(failure);
    const results = await Promise.all(calls);

    expect(results).toHaveLength(9);
    for (const r of results) {
      expect(r).toBeInstanceOf(RebuildFailedError);
    }
    expect(userSettings.store.needs_recalculation).toBe('true');

    // The next call must be able to retry — no poisoned promise left behind.
    rebuild.mockResolvedValueOnce('build-retry' as FifoBuildId);
    describeChain.mockResolvedValue({
      kind: 'fresh',
      buildId: 'build-retry' as FifoBuildId,
      builtAt: '2026-01-01T00:02:00Z',
    } satisfies FifoChainState);
    const retried = await service.ensureFresh();
    expect(retried.buildId).toBe('build-retry');
    expect(rebuild).toHaveBeenCalledTimes(2);
  });

  it('invokes no rebuild and resolves with the current build when the flag is clean', async () => {
    await userSettings.setSetting('needs_recalculation', 'false');
    describeChain.mockResolvedValue({
      kind: 'fresh',
      buildId: 'build-current' as FifoBuildId,
      builtAt: '2026-01-01T00:00:00Z',
    } satisfies FifoChainState);

    const result = await service.ensureFresh();

    expect(rebuild).not.toHaveBeenCalled();
    expect(result.buildId).toBe('build-current');
  });

  it('forces a rebuild even with a clean flag when the chain has never been built', async () => {
    await userSettings.setSetting('needs_recalculation', 'false');
    describeChain.mockResolvedValueOnce({ kind: 'stale', reason: 'never-built' } satisfies FifoChainState);
    rebuild.mockResolvedValueOnce('build-first' as FifoBuildId);
    describeChain.mockResolvedValueOnce({
      kind: 'fresh',
      buildId: 'build-first' as FifoBuildId,
      builtAt: '2026-01-01T00:00:00Z',
    } satisfies FifoChainState);

    const result = await service.ensureFresh();

    expect(rebuild).toHaveBeenCalledTimes(1);
    expect(result.buildId).toBe('build-first');
  });

  it('backs off before a retry, scaling with consecutive failures, capped at 5000ms', async () => {
    rebuild.mockRejectedValueOnce(new Error('first failure'));
    await service.ensureFresh().catch(() => {});
    expect(delayCalls).toEqual([]); // no backoff before the FIRST attempt

    rebuild.mockRejectedValueOnce(new Error('second failure'));
    await service.ensureFresh().catch(() => {});
    expect(delayCalls).toEqual([400]); // one prior failure

    rebuild.mockRejectedValueOnce(new Error('third failure'));
    await service.ensureFresh().catch(() => {});
    expect(delayCalls).toEqual([400, 800]); // two prior failures

    // The success attempt itself still backs off (two prior failures), but resets the
    // counter once it succeeds — the next failure backs off from zero again.
    rebuild.mockResolvedValueOnce('build-ok' as FifoBuildId);
    describeChain.mockResolvedValueOnce({
      kind: 'fresh',
      buildId: 'build-ok' as FifoBuildId,
      builtAt: '2026-01-01T00:00:00Z',
    } satisfies FifoChainState);
    await service.ensureFresh();
    expect(delayCalls).toEqual([400, 800, 1200]);

    await userSettings.setSetting('needs_recalculation', 'true');
    rebuild.mockRejectedValueOnce(new Error('fourth failure'));
    await service.ensureFresh().catch(() => {});
    expect(delayCalls).toEqual([400, 800, 1200]); // unchanged: no backoff right after a reset
  });
});
