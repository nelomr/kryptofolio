import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mocked } from 'vitest';
import type { IExchangeRatePort } from '../../../domain/ports/IExchangeRatePort.js';
import type {
  DailyExchangeRate,
  IFxRateLedgerPort,
} from '../../../domain/ports/IFxRateLedgerPort.js';
import { BackfillExchangeRateGapsUC } from '../BackfillExchangeRateGapsUC.js';

/** Publication days as the ECB documents order them: newest first. */
const DAYS = [
  { date: '2025-04-24', rates: { USD: '1.1376' } },
  { date: '2025-04-23', rates: { USD: '1.1415' } },
  { date: '2025-04-22', rates: { USD: '1.1476' } },
  { date: '2025-04-17', rates: { USD: '1.136' } },
  { date: '2025-04-16', rates: { USD: '1.1355' } },
];

describe('BackfillExchangeRateGapsUC', () => {
  let exchangeRatePort: Mocked<IExchangeRatePort>;
  let fxRateLedgerPort: Mocked<IFxRateLedgerPort>;
  let written: DailyExchangeRate[];

  beforeEach(() => {
    written = [];
    exchangeRatePort = {
      getLatestRates: vi.fn(),
      getHistoricalRates: vi.fn(async () => ({
        kind: 'COVERS_REQUEST' as const,
        document: 'FULL_ARCHIVE' as const,
        days: DAYS,
      })),
    };
    fxRateLedgerPort = {
      upsertDailyExchangeRates: vi.fn(async (rates: readonly DailyExchangeRate[]) => {
        written.push(...rates);
        return rates.length;
      }),
      getRateAsOf: vi.fn(),
      getStoredRateDates: vi.fn(async () => []),
    };
  });

  const run = (from: string, to: string) =>
    new BackfillExchangeRateGapsUC(exchangeRatePort, fxRateLedgerPort).execute({ from, to });

  it('writes exactly the gap set and nothing outside it', async () => {
    fxRateLedgerPort.getStoredRateDates.mockResolvedValue(['2025-04-16', '2025-04-24']);

    const result = await run('2025-04-16', '2025-04-24');

    expect(written.map((r) => r.date)).toEqual(['2025-04-17', '2025-04-22', '2025-04-23']);
    expect(result.rowsWritten).toBe(3);
    expect(result.unfilledDates).toEqual([]);
  });

  it('writes published rates, reciprocated into the ledger USD/EUR quote', async () => {
    fxRateLedgerPort.getStoredRateDates.mockResolvedValue([]);

    await run('2025-04-17', '2025-04-17');

    expect(written).toEqual([
      { date: '2025-04-17', pair: 'USD/EUR', rate: '0.88028169014084507', source: 'ECB' },
    ]);
  });

  it('performs no fetch when every date in the range is already held', async () => {
    fxRateLedgerPort.getStoredRateDates.mockResolvedValue([
      '2025-04-22',
      '2025-04-23',
      '2025-04-24',
    ]);

    const result = await run('2025-04-22', '2025-04-24');

    expect(exchangeRatePort.getHistoricalRates).not.toHaveBeenCalled();
    expect(fxRateLedgerPort.upsertDailyExchangeRates).not.toHaveBeenCalled();
    expect(result.rowsWritten).toBe(0);
  });

  it('does not treat an unpublished weekday as a gap', async () => {
    fxRateLedgerPort.getStoredRateDates.mockResolvedValue([]);

    const result = await run('2025-04-17', '2025-04-22');

    // 04-18 Good Friday, 04-21 Easter Monday: weekdays the ECB never published on.
    expect(result.filledDates).toEqual(['2025-04-17', '2025-04-22']);
  });

  it('leaves dates the document could not reach in the gap set', async () => {
    fxRateLedgerPort.getStoredRateDates.mockResolvedValue([]);
    exchangeRatePort.getHistoricalRates.mockResolvedValue({
      kind: 'SHORT_OF_REQUEST',
      document: 'FULL_ARCHIVE',
      days: DAYS,
      oldestAvailableDate: '2025-04-16',
    });

    const result = await run('2025-04-16', '2025-04-24');

    expect(result.filledDates).toEqual([
      '2025-04-16',
      '2025-04-17',
      '2025-04-22',
      '2025-04-23',
      '2025-04-24',
    ]);
    expect(result.unfilledDates).toEqual([]);
  });

  it('asks the provider for the gap set oldest date, not for the whole requested range', async () => {
    fxRateLedgerPort.getStoredRateDates.mockResolvedValue(['2025-04-16', '2025-04-17']);

    await run('2025-04-16', '2025-04-24');

    expect(exchangeRatePort.getHistoricalRates).toHaveBeenCalledWith('2025-04-18');
  });
});
