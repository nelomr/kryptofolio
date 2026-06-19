import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FetchAndStoreExchangeRatesUC } from '../FetchAndStoreExchangeRatesUC';
import type { IUserSettingsPort } from '../../../domain/ports/IUserSettingsPort';
import type { IExchangeRatePort } from '../../../domain/ports/IExchangeRatePort';

describe('FetchAndStoreExchangeRatesUC', () => {
  let userSettingsPort: import('vitest').Mocked<IUserSettingsPort>;
  let exchangeRatePort: import('vitest').Mocked<IExchangeRatePort>;
  let useCase: FetchAndStoreExchangeRatesUC;

  beforeEach(() => {
    userSettingsPort = {
      getSetting: vi.fn(),
      setSetting: vi.fn(),
    };
    exchangeRatePort = {
      getLatestRates: vi.fn(),
    };
    useCase = new FetchAndStoreExchangeRatesUC(userSettingsPort, exchangeRatePort);
  });

  it('should get rates from port, store USD/EUR rates, and store the publication date', async () => {
    exchangeRatePort.getLatestRates.mockResolvedValue({
      date: '2026-06-19',
      rates: {
        'USD': '1.0825',
        'JPY': '140.22'
      }
    });

    const resultDate = await useCase.execute();

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
});
