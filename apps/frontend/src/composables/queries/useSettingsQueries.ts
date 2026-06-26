import { useQuery } from '@pinia/colada';
import { inject, toValue, type MaybeRefOrGetter } from 'vue';
import { I18N_PORT_KEY, SETTINGS_PORT_KEY } from '@/core/injectionKeys';
import { InitializeLanguageUseCase } from '@/core/application/use-cases/InitializeLanguageUseCase';
import type { FiatCurrency } from '@kryptofolio/shared-types';

/**
 * useInitializeLanguageQuery
 *
 * Pinia Colada query that executes InitializeLanguageUseCase on app startup.
 * It will fetch the user's preferred language from the backend and apply it.
 */
export function useInitializeLanguageQuery() {
  const settingsPort = inject(SETTINGS_PORT_KEY);
  const i18nPort = inject(I18N_PORT_KEY);

  if (!settingsPort || !i18nPort) {
    throw new Error('[useInitializeLanguageQuery] Required ports are not provided.');
  }

  const useCase = new InitializeLanguageUseCase(settingsPort, i18nPort);

  return useQuery({
    key: ['settings', 'language', 'initialization'],
    query: async () => {
      await useCase.execute();
      return true;
    },
    staleTime: Infinity, // We only need to run this once on startup
  });
}

export function useActiveMarketProviderQuery() {
  const settingsPort = inject(SETTINGS_PORT_KEY);

  if (!settingsPort) {
    throw new Error('[useActiveMarketProviderQuery] Required port ISettingsPort is not provided.');
  }

  return useQuery({
    key: ['settings', 'active_market_provider'],
    query: async () => {
      return await settingsPort.getActiveMarketProvider();
    },
    staleTime: 60 * 1000,
  });
}

/**
 * useBaseCurrencyQuery
 *
 * Fetches the user's saved base fiat currency from the backend.
 * Defaults to 'USD' if not configured.
 */
export function useBaseCurrencyQuery() {
  const settingsPort = inject(SETTINGS_PORT_KEY);

  if (!settingsPort) {
    throw new Error('[useBaseCurrencyQuery] Required port ISettingsPort is not provided.');
  }

  return useQuery({
    key: ['settings', 'base_currency'],
    query: async (): Promise<FiatCurrency> => {
      return await settingsPort.getBaseCurrency();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}


/**
 * useExchangeRateQuery
 *
 * Fetches the latest stored fiat exchange rate (e.g. USD→EUR) from the backend.
 * Reactive: will re-fetch if 'from' or 'to' references change.
 */
export function useExchangeRateQuery(
  from: MaybeRefOrGetter<FiatCurrency>, 
  to: MaybeRefOrGetter<FiatCurrency>
) {
  const settingsPort = inject(SETTINGS_PORT_KEY);

  if (!settingsPort) {
    throw new Error('[useExchangeRateQuery] Required port ISettingsPort is not provided.');
  }

  return useQuery({
    key: () => ['settings', 'exchange_rate', toValue(from), toValue(to)],
    query: async (): Promise<{ rate: string | null; date: string | null }> => {
      return await settingsPort.getExchangeRate(toValue(from), toValue(to));
    },
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * useSupportedAccountsQuery
 *
 * Fetches the supported accounts configuration.
 */
export function useSupportedAccountsQuery() {
  const settingsPort = inject(SETTINGS_PORT_KEY);

  if (!settingsPort) {
    throw new Error('[useSupportedAccountsQuery] Required port ISettingsPort is not provided.');
  }

  return useQuery({
    key: ['settings', 'supported_accounts'],
    query: async () => {
      return await settingsPort.getSupportedAccounts();
    },
    staleTime: 5 * 60 * 1000,
  });
}

