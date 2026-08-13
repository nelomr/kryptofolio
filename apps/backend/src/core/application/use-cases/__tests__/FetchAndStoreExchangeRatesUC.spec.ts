import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FetchAndStoreExchangeRatesUC } from '../FetchAndStoreExchangeRatesUC';
import type { IUserSettingsPort } from '../../../domain/ports/IUserSettingsPort';
import type { IExchangeRatePort } from '../../../domain/ports/IExchangeRatePort';
import type {
  IFxRateLedgerPort,
  DailyExchangeRate,
  StoredRateDateQuery,
} from '../../../domain/ports/IFxRateLedgerPort';

/** 1 / 1.0825 bounded to the 18 decimal places the DECIMAL(38,18) basis columns hold. */
const LEDGER_RATE = '0.923787528868360277';

describe('FetchAndStoreExchangeRatesUC', () => {
  let userSettingsPort: import('vitest').Mocked<IUserSettingsPort>;
  let exchangeRatePort: import('vitest').Mocked<IExchangeRatePort>;
  let fxRateLedgerPort: import('vitest').Mocked<IFxRateLedgerPort>;
  let useCase: FetchAndStoreExchangeRatesUC;
  /** Rows the fake ledger has accepted, keyed by the table's own primary key. */
  let stored: Map<string, DailyExchangeRate>;

  beforeEach(() => {
    userSettingsPort = {
      getSetting: vi.fn(),
      setSetting: vi.fn(),
    };
    exchangeRatePort = {
      getLatestRates: vi.fn(),
      getHistoricalRates: vi.fn(),
    };
    stored = new Map();
    fxRateLedgerPort = {
      // Mirrors the port's precedence rule on (date, pair): only a published rate superseding a
      // carried-forward one writes over an existing row; everything else is dropped.
      upsertDailyExchangeRates: vi.fn(async (rates: readonly DailyExchangeRate[]) => {
        let written = 0;
        for (const rate of rates) {
          const key = `${rate.date}|${rate.pair}`;
          const held = stored.get(key);
          if (held && !(held.source === 'ECB_PRIOR_DAY' && rate.source === 'ECB')) continue;
          stored.set(key, rate);
          written += 1;
        }
        return written;
      }),
      getRateAsOf: vi.fn(async (pair: string, date: string) => {
        const candidates = [...stored.values()]
          .filter((rate) => rate.pair === pair && rate.date <= date)
          .sort((a, b) => a.date.localeCompare(b.date));
        return candidates.at(-1) ?? null;
      }),
      getStoredRateDates: vi.fn(async (query: StoredRateDateQuery) =>
        [...stored.values()]
          .filter(
            (rate) =>
              rate.pair === query.pair && rate.date >= query.from && rate.date <= query.to,
          )
          .map((rate) => rate.date)
          .sort(),
      ),
    };
    useCase = new FetchAndStoreExchangeRatesUC(
      userSettingsPort,
      exchangeRatePort,
      fxRateLedgerPort
    );
  });

  it('should get rates from port, store USD/EUR rates, and store the publication date', async () => {
    exchangeRatePort.getLatestRates.mockResolvedValue({
      date: '2026-06-19',
      rates: {
        'USD': '1.0825',
        'JPY': '140.22'
      }
    });

    const resultDate = await useCase.execute({ asOfDate: '2026-06-19' });

    expect(resultDate).toBe('2026-06-19');
    expect(exchangeRatePort.getLatestRates).toHaveBeenCalledTimes(1);
    expect(userSettingsPort.setSetting).toHaveBeenCalledWith('exchange_rate_eur_usd', '1.0825');
    expect(userSettingsPort.setSetting).toHaveBeenCalledWith('exchange_rate_usd_eur', '0.92378752886836027714');
    expect(userSettingsPort.setSetting).toHaveBeenCalledWith('exchange_rate_date', '2026-06-19');
  });

  it('should throw an error if the USD rate is missing', async () => {
    exchangeRatePort.getLatestRates.mockResolvedValue({
      date: '2026-06-19',
      rates: {
        'JPY': '140.22'
      }
    });

    await expect(useCase.execute()).rejects.toThrow('USD rate not found in exchange rate data');
  });

  describe('the historical FX ledger', () => {
    beforeEach(() => {
      exchangeRatePort.getLatestRates.mockResolvedValue({
        date: '2026-06-19',
        rates: { USD: '1.0825' },
      });
    });

    it('writes the ECB-published rate at its own publication date', async () => {
      await useCase.execute({ asOfDate: '2026-06-19' });

      expect([...stored.values()]).toEqual([
        {
          date: '2026-06-19',
          pair: 'USD/EUR',
          rate: LEDGER_RATE,
          source: 'ECB',
        },
      ]);
    });

    it('is idempotent on a second run for the same date', async () => {
      await useCase.execute({ asOfDate: '2026-06-19' });
      const insertedAgain = await fxRateLedgerPort.upsertDailyExchangeRates.mock.results[0]!.value;
      expect(insertedAgain).toBe(1);

      await useCase.execute({ asOfDate: '2026-06-19' });

      expect(stored.size).toBe(1);
      expect(await fxRateLedgerPort.upsertDailyExchangeRates.mock.results[1]!.value).toBe(0);
    });

    it('marks a carried-forward day as ECB_PRIOR_DAY, never as published', async () => {
      // The ECB does not publish at weekends: on Sunday the 21st the newest rate is still the 19th's,
      // and the two intervening days carry it forward. Labelling them `ECB` would assert a
      // publication that never happened.
      await useCase.execute({ asOfDate: '2026-06-21' });

      expect([...stored.values()]).toEqual([
        { date: '2026-06-19', pair: 'USD/EUR', rate: LEDGER_RATE, source: 'ECB' },
        { date: '2026-06-20', pair: 'USD/EUR', rate: LEDGER_RATE, source: 'ECB_PRIOR_DAY' },
        { date: '2026-06-21', pair: 'USD/EUR', rate: LEDGER_RATE, source: 'ECB_PRIOR_DAY' },
      ]);
    });

    it('writes only the published row when the publication date is today', async () => {
      await useCase.execute({ asOfDate: '2026-06-19' });
      expect([...stored.values()].filter((r) => r.source === 'ECB_PRIOR_DAY')).toEqual([]);
    });

    it('never back-dates: an asOf date before publication writes the published row alone', async () => {
      await useCase.execute({ asOfDate: '2026-06-18' });
      expect([...stored.values()]).toEqual([
        { date: '2026-06-19', pair: 'USD/EUR', rate: LEDGER_RATE, source: 'ECB' },
      ]);
    });

    it('stores the rate as USD/EUR — the direction the ECB publishes reciprocally', async () => {
      // exchange_rates holds `<base>/<quote>` meaning EUR = USD × rate, so the stored figure is the
      // reciprocal of the ECB's EUR-based quote. A row of 1.0825 here would scale every converted
      // figure by ~1.17 instead of ~0.92.
      await useCase.execute({ asOfDate: '2026-06-19' });
      const row = stored.get('2026-06-19|USD/EUR');
      expect(row).toBeDefined();
      expect(Number(row!.rate)).toBeLessThan(1);
    });

    it('still writes the KV store when the ledger write is what fails', async () => {
      fxRateLedgerPort.upsertDailyExchangeRates.mockRejectedValueOnce(new Error('disk full'));
      await expect(useCase.execute({ asOfDate: '2026-06-19' })).rejects.toThrow('disk full');
      expect(userSettingsPort.setSetting).toHaveBeenCalledWith('exchange_rate_date', '2026-06-19');
    });
  });
});
