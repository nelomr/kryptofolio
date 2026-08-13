import { describe, it, expect, vi } from 'vitest';
import { DeferredBackfillSchedulerAdapter } from '../DeferredBackfillSchedulerAdapter.js';
import type { BackfillExchangeRateGapsResult } from '../../../application/use-cases/BackfillExchangeRateGapsUC.js';

function makeAdapter(result: BackfillExchangeRateGapsResult | Error) {
  const backfill = vi.fn(async () =>
    result instanceof Error ? Promise.reject(result) : result,
  );
  const rematerialize = vi.fn(async () => undefined);
  const adapter = new DeferredBackfillSchedulerAdapter(
    { execute: backfill },
    { recalculate: rematerialize },
  );
  return { adapter, backfill, rematerialize };
}

const FILLED: BackfillExchangeRateGapsResult = {
  rowsWritten: 2,
  filledDates: ['2025-04-17', '2025-04-22'],
  unfilledDates: [],
};

const NOTHING: BackfillExchangeRateGapsResult = {
  rowsWritten: 0,
  filledDates: [],
  unfilledDates: [],
};

describe('DeferredBackfillSchedulerAdapter', () => {
  it('re-materialises after a backfill that inserted rows', async () => {
    const { adapter, backfill, rematerialize } = makeAdapter(FILLED);

    adapter.requestFxBackfill({ from: '2025-04-16', to: '2025-04-24' });
    await adapter.settled();

    expect(backfill).toHaveBeenCalledWith({ from: '2025-04-16', to: '2025-04-24' });
    expect(rematerialize).toHaveBeenCalledTimes(1);
  });

  it('re-materialises nothing when the backfill inserted nothing', async () => {
    const { adapter, backfill, rematerialize } = makeAdapter(NOTHING);

    adapter.requestFxBackfill({ from: '2025-04-16', to: '2025-04-24' });
    await adapter.settled();

    expect(backfill).toHaveBeenCalledTimes(1);
    expect(rematerialize).not.toHaveBeenCalled();
  });

  it('does not return a promise the caller could block an import on', () => {
    const { adapter } = makeAdapter(FILLED);

    expect(adapter.requestFxBackfill({ from: '2025-04-16', to: '2025-04-24' })).toBeUndefined();
  });

  it('absorbs a failed backfill rather than surfacing it to the caller', async () => {
    const { adapter, rematerialize } = makeAdapter(new Error('ECB unreachable'));

    expect(() => adapter.requestFxBackfill({ from: '2025-04-16', to: '2025-04-24' })).not.toThrow();
    await expect(adapter.settled()).resolves.toBeUndefined();
    expect(rematerialize).not.toHaveBeenCalled();
  });
});
