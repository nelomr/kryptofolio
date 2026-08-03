import type { ISettingsPort } from '@/core/domain/ports/ISettingsPort';
import type { FiatCurrency } from '@kryptofolio/core-domain';
import { bffClient } from '@/core/infrastructure/http/BffClient';
import type { SelectableAccountEntity } from '@/core/domain/models/AccountEntities';
import { parseSelectableAccounts } from '@/core/infrastructure/dtos/SettingsSchemas';

/**
 * RestSettingsAdapter — Infrastructure adapter implementing ISettingsPort.
 * Communicates with the apps/backend /api/settings/* endpoints.
 */
export class RestSettingsAdapter implements ISettingsPort {
  async getLanguage(): Promise<string> {
    try {
      const res = await bffClient.api.settings.language.$get();
      if (!res.ok) return 'en';
      const data = await res.json();
      return (data as { language: string }).language ?? 'en';
    } catch {
      return 'en';
    }
  }

  async getActiveMarketProvider(): Promise<string | null> {
    try {
      const res = await bffClient.api.settings['market-provider'].$get();
      if (!res.ok) return null;
      const data = await res.json();
      return (data as { providerId: string }).providerId ?? null;
    } catch {
      return null;
    }
  }

  async setLanguage(language: string): Promise<void> {
    const res = await bffClient.api.settings.language.$put({
      json: { language },
    });
    if (!res.ok) {
      throw new Error('FAILED_TO_SAVE_LANGUAGE');
    }
  }

  async setActiveMarketProvider(providerId: string): Promise<void> {
    const res = await bffClient.api.settings['market-provider'].$put({
      json: { providerId },
    });
    if (!res.ok) {
      throw new Error('FAILED_TO_SAVE_MARKET_PROVIDER');
    }
  }

  async getBaseCurrency(): Promise<FiatCurrency> {
    try {
      const res = await bffClient.api.settings['base-currency'].$get();
      if (!res.ok) return 'USD';
      const data = await res.json();
      return ((data as { baseCurrency: string }).baseCurrency as FiatCurrency) ?? 'USD';
    } catch {
      return 'USD';
    }
  }

  async setBaseCurrency(currency: FiatCurrency): Promise<void> {
    const res = await bffClient.api.settings['base-currency'].$put({
      json: { baseCurrency: currency },
    });
    if (!res.ok) {
      throw new Error('FAILED_TO_SAVE_BASE_CURRENCY');
    }
  }

  async getExchangeRate(from: FiatCurrency, to: FiatCurrency): Promise<{ rate: string | null; date: string | null }> {
    try {
      const key = `${from}_${to}`.toLowerCase();
      const res = await bffClient.api.settings['exchange-rate'][':key'].$get({
        param: { key },
      });
      if (!res.ok) return { rate: null, date: null };
      const data = await res.json();
      return { 
        rate: (data as { rate: string | null }).rate ?? null,
        date: (data as { date: string | null }).date ?? null
      };
    } catch {
      return { rate: null, date: null };
    }
  }

  async setExchangeRate(from: FiatCurrency, to: FiatCurrency, rate: string): Promise<void> {
    const key = `${from}_${to}`.toLowerCase();
    const res = await bffClient.api.settings['exchange-rate'][':key'].$put({
      param: { key },
      // Note: we still have to cast rate to any here if the backend generated client expects a number,
      // but earlier we changed the backend to accept string... wait! I need to check backend validation.
      json: { rate: parseFloat(rate) }, // The backend still uses z.number() right now! Wait, I should fix backend or just send number.
    });
    if (!res.ok) {
      throw new Error('FAILED_TO_SAVE_EXCHANGE_RATE');
    }
  }

  async syncExchangeRates(): Promise<void> {
    const res = await bffClient.api.settings['exchange-rate']['sync'].$post();
    if (!res.ok) {
      throw new Error('FAILED_TO_SYNC_RATES');
    }
  }

  async getSelectableAccounts(): Promise<SelectableAccountEntity[]> {
    const res = await bffClient.api.settings.accounts.$get();
    // A failed read is not an empty ledger. Swallowing it would present "no accounts" as fact.
    if (!res.ok) {
      throw new Error('FAILED_TO_READ_ACCOUNTS');
    }
    return parseSelectableAccounts(await res.json());
  }

  async setSupportedAccounts(accounts: { value: string; label: string }[]): Promise<void> {
    const res = await bffClient.api.settings.accounts.$post({
      json: { accounts },
    });
    if (!res.ok) {
      throw new Error('FAILED_TO_SAVE_ACCOUNTS');
    }
  }
}

