import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StreamNormalizedMarketDataUC } from '../StreamNormalizedMarketDataUC';
import type { IUserSettingsPort } from '../../../domain/ports/IUserSettingsPort';
import type { AssetPrice } from '@kryptofolio/shared-types';

describe('StreamNormalizedMarketDataUC', () => {
  let userSettingsPort: import('vitest').Mocked<IUserSettingsPort>;
  let useCase: StreamNormalizedMarketDataUC;

  beforeEach(() => {
    userSettingsPort = {
      getSetting: vi.fn(),
      setSetting: vi.fn(),
    };
    useCase = new StreamNormalizedMarketDataUC(userSettingsPort);
  });

  it('returns the raw price if base currency is the same as the price currency', async () => {
    userSettingsPort.getSetting.mockResolvedValue('USD');
    const rawPrice: AssetPrice = {
      symbol: 'BTC',
      currency: 'USD',
      price: "50000",
      change24hPercent: "2.5",
      provider: 'kraken',
      timestamp: '2023-01-01T00:00:00Z',
    };

    const result = await useCase.execute(rawPrice);
    expect(result).toEqual(rawPrice);
  });

  it('normalizes the price to the base currency if an exchange rate is available', async () => {
    // Mock user having EUR as base currency
    userSettingsPort.getSetting.mockImplementation(async (key: string) => {
      if (key === 'base_currency') return 'EUR';
      if (key === 'exchange_rate_usd_eur') return '0.9'; // 1 USD = 0.9 EUR
      return null;
    });

    const rawPrice: AssetPrice = {
      symbol: 'BTC',
      currency: 'USD',
      price: "50000",
      change24hPercent: "2.5",
      provider: 'kraken',
      timestamp: '2023-01-01T00:00:00Z',
    };

    const result = await useCase.execute(rawPrice);
    
    // 50000 * 0.9 = 45000
    expect(result.currency).toBe('EUR');
    expect(result.price).toBe("45000");
    expect(result.symbol).toBe('BTC');
    expect(result.change24hPercent).toBe("2.5");
    expect(result.provider).toBe('kraken');
    expect(result.timestamp).toBe('2023-01-01T00:00:00Z');
  });

  it('returns the raw price if the exchange rate is missing', async () => {
    userSettingsPort.getSetting.mockImplementation(async (key: string) => {
      if (key === 'base_currency') return 'EUR';
      if (key === 'exchange_rate_usd_eur') return null; // Missing rate
      return null;
    });

    const rawPrice: AssetPrice = {
      symbol: 'BTC',
      currency: 'USD',
      price: "50000",
      change24hPercent: "2.5",
      provider: 'kraken',
      timestamp: '2023-01-01T00:00:00Z',
    };

    const result = await useCase.execute(rawPrice);
    expect(result).toEqual(rawPrice); // Fallback to raw
  });

  /**
   * `ExchangeRate` and `FiatMoney` accept only the supported currency union. Three `as any` casts
   * used to force any string into it, so an unsupported code reached `CurrencyConverter` typed as
   * something it was not.
   */
  describe('unsupported currency codes', () => {
    const gbpPrice: AssetPrice = {
      symbol: 'BTC',
      currency: 'GBP',
      price: '50000',
      change24hPercent: '2.5',
      provider: 'kraken',
      timestamp: '2023-01-01T00:00:00Z',
    };

    it('returns the raw price when the source currency is not supported', async () => {
      userSettingsPort.getSetting.mockImplementation(async (key: string) => {
        if (key === 'base_currency') return 'EUR';
        if (key === 'exchange_rate_gbp_eur') return '1.17';
        return null;
      });

      const result = await useCase.execute(gbpPrice);

      expect(result).toEqual(gbpPrice);
      expect(result.currency).toBe('GBP');
    });

    it('returns the raw price when the configured base currency is not supported', async () => {
      userSettingsPort.getSetting.mockImplementation(async (key: string) => {
        if (key === 'base_currency') return 'JPY';
        if (key === 'exchange_rate_usd_jpy') return '150';
        return null;
      });

      const usdPrice: AssetPrice = { ...gbpPrice, currency: 'USD' };
      const result = await useCase.execute(usdPrice);

      expect(result).toEqual(usdPrice);
    });

    it('does not convert using a rate it cannot type', async () => {
      // The old casts produced a converted figure carrying a currency the domain never accepted.
      userSettingsPort.getSetting.mockImplementation(async (key: string) => {
        if (key === 'base_currency') return 'EUR';
        if (key === 'exchange_rate_gbp_eur') return '1.17';
        return null;
      });

      const result = await useCase.execute(gbpPrice);

      expect(result.price).toBe('50000');
    });
  });
});
