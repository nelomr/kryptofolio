import { describe, it, expect, vi } from 'vitest';
import { repairFxCoverageOnBoot } from '../ExchangeRateSyncJob.js';
import type { FxBackfillRequest } from '../../../domain/ports/IBackfillSchedulerPort.js';
import type { IFxRateLedgerPort } from '../../../domain/ports/IFxRateLedgerPort.js';
import type { BackfillExchangeRateGapsResult } from '../../../application/use-cases/BackfillExchangeRateGapsUC.js';

function makeLedger(newestStoredDate: string | null): IFxRateLedgerPort {
  return {
    upsertDailyExchangeRates: vi.fn(async () => 0),
    getRateAsOf: vi.fn(async () =>
      newestStoredDate === null
        ? null
        : { date: newestStoredDate, pair: 'USD/EUR', rate: '0.9', source: 'ECB' as const },
    ),
    getStoredRateDates: vi.fn(async () => []),
  };
}

const NOTHING: BackfillExchangeRateGapsResult = {
  rowsWritten: 0,
  filledDates: [],
  unfilledDates: [],
};

describe('repairFxCoverageOnBoot', () => {
  it('repairs from the newest stored row, however old it is', async () => {
    const requests: FxBackfillRequest[] = [];
    const runner = { execute: vi.fn(async (r: FxBackfillRequest) => (requests.push(r), NOTHING)) };

    await repairFxCoverageOnBoot(makeLedger('2024-08-12'), runner, '2026-08-12');

    expect(requests).toEqual([{ from: '2024-08-12', to: '2026-08-12' }]);
  });

  it('does not cap boot repair at a recent window', async () => {
    const requests: FxBackfillRequest[] = [];
    const runner = { execute: vi.fn(async (r: FxBackfillRequest) => (requests.push(r), NOTHING)) };

    await repairFxCoverageOnBoot(makeLedger('2024-08-12'), runner, '2026-08-12');

    const [request] = requests;
    if (!request) throw new Error('no backfill requested');
    const spanDays =
      (Date.parse(`${request.to}T00:00:00Z`) - Date.parse(`${request.from}T00:00:00Z`)) / 86_400_000;
    expect(spanDays).toBeGreaterThan(365 * 2 - 1);
  });

  it('repairs a short outage over the same span it actually lost', async () => {
    const requests: FxBackfillRequest[] = [];
    const runner = { execute: vi.fn(async (r: FxBackfillRequest) => (requests.push(r), NOTHING)) };

    await repairFxCoverageOnBoot(makeLedger('2026-08-05'), runner, '2026-08-12');

    expect(requests).toEqual([{ from: '2026-08-05', to: '2026-08-12' }]);
  });

  it('falls back to the ECB first publication day when the ledger is empty', async () => {
    const requests: FxBackfillRequest[] = [];
    const runner = { execute: vi.fn(async (r: FxBackfillRequest) => (requests.push(r), NOTHING)) };

    await repairFxCoverageOnBoot(makeLedger(null), runner, '2026-08-12');

    expect(requests).toEqual([{ from: '1999-01-04', to: '2026-08-12' }]);
  });
});
