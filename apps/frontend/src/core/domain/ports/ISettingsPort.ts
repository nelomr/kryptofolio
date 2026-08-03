import type { FiatCurrency } from '@kryptofolio/core-domain';
import type { SelectableAccountEntity } from '@/core/domain/models/AccountEntities';

/**
 * ISettingsPort — Port for reading and writing user application settings.
 * Implemented by the infrastructure adapter that calls the backend API.
 */
export interface ISettingsPort {
  getLanguage(): Promise<string>;
  setLanguage(language: string): Promise<void>;
  getActiveMarketProvider(): Promise<string | null>;
  setActiveMarketProvider(providerId: string): Promise<void>;
  /** Returns the user's configured base fiat currency. Defaults to 'USD'. */
  getBaseCurrency(): Promise<FiatCurrency>;
  /** Persists the user's preferred base fiat currency. */
  setBaseCurrency(currency: FiatCurrency): Promise<void>;
  /** Returns the latest stored USD→target exchange rate and its publication date. */
  getExchangeRate(from: FiatCurrency, to: FiatCurrency): Promise<{ rate: string | null; date: string | null }>;
  /** Stores/updates an exchange rate in the backend. */
  setExchangeRate(from: FiatCurrency, to: FiatCurrency, rate: string): Promise<void>;
  /** Manually trigger exchange rate synchronization */
  syncExchangeRates(): Promise<void>;
  /**
   * Returns the accounts that may be offered in a user-facing selector. Synthetic custody
   * counterparties are never among them.
   */
  getSelectableAccounts(): Promise<SelectableAccountEntity[]>;
  /** Updates the supported accounts configuration */
  setSupportedAccounts(accounts: { value: string; label: string }[]): Promise<void>;
}

