import { useMutation, useQueryCache } from '@pinia/colada';
import { inject } from 'vue';
import { toast } from 'vue-sonner';
import { I18N_PORT_KEY, SETTINGS_PORT_KEY } from '@/core/injectionKeys';
import { UpdateLanguageUseCase } from '@/core/application/use-cases/UpdateLanguageUseCase';
import { UpdateBaseCurrencyUseCase } from '@/core/application/use-cases/UpdateBaseCurrencyUseCase';
import { SyncExchangeRatesUseCase } from '@/core/application/use-cases/SyncExchangeRatesUseCase';
import type { FiatCurrency } from '@kryptofolio/core-domain';

/**
 * useUpdateLanguageMutation
 *
 * Pinia Colada mutation that executes UpdateLanguageUseCase.
 * On success the UI language switches reactively (no reload needed).
 * Success/error feedback is handled via Sonner toasts.
 */
export function useUpdateLanguageMutation() {
  const settingsPort = inject(SETTINGS_PORT_KEY);
  const i18nPort = inject(I18N_PORT_KEY);

  if (!settingsPort || !i18nPort) {
    throw new Error('[useUpdateLanguageMutation] Required ports are not provided.');
  }

  const useCase = new UpdateLanguageUseCase(settingsPort, i18nPort);

  return useMutation({
    mutation: async (language: string) => {
      await useCase.execute(language);
      return language;
    },
    onSuccess: () => {
      toast.success(i18nPort.translate('settings.language.success'));
    },
    onError: () => {
      toast.error(i18nPort.translate('settings.language.error'));
    },
  });
}

/**
 * useToggleActiveMarketProviderMutation
 *
 * Updates the global active market provider.
 */
export function useToggleActiveMarketProviderMutation() {
  const settingsPort = inject(SETTINGS_PORT_KEY);
  const i18nPort = inject(I18N_PORT_KEY);

  if (!settingsPort || !i18nPort) {
    throw new Error('[useToggleActiveMarketProviderMutation] Required ports are not provided.');
  }

  // We import the usecase here dynamically or globally
  // Since we already have the usecase in the same file... Wait, let's import it.
  // Actually, we can just use the port directly or import the use case. Let's import the use case.
  const queryCache = useQueryCache();

  return useMutation({
    mutation: async (providerId: string) => {
      // Lazy init to avoid circular deps if any
      const { ToggleActiveMarketProviderUseCase } = await import('@/core/application/use-cases/ToggleActiveMarketProviderUseCase');
      const useCase = new ToggleActiveMarketProviderUseCase(settingsPort);
      await useCase.execute(providerId);
      return providerId;
    },
    onSuccess: () => {
      queryCache.invalidateQueries({ key: ['settings', 'active_market_provider'] });
      toast.success(i18nPort.translate('market.provider.success'));
    },
    onError: () => {
      toast.error(i18nPort.translate('market.provider.error'));
    },
  });
}

/**
 * useUpdateBaseCurrencyMutation
 *
 * Pinia Colada mutation to persist the user's preferred base fiat currency.
 * On success, invalidates the base_currency and exchange_rate queries.
 */
export function useUpdateBaseCurrencyMutation() {
  const settingsPort = inject(SETTINGS_PORT_KEY);
  const i18nPort = inject(I18N_PORT_KEY);

  if (!settingsPort) {
    throw new Error('[useUpdateBaseCurrencyMutation] Required port ISettingsPort is not provided.');
  }

  const queryCache = useQueryCache();
  const useCase = new UpdateBaseCurrencyUseCase(settingsPort);

  return useMutation({
    mutation: async (currency: FiatCurrency) => {
      await useCase.execute(currency);
      return currency;
    },
    onSuccess: (currency) => {
      queryCache.invalidateQueries({ key: ['settings', 'base_currency'] });
      queryCache.invalidateQueries({ key: ['settings', 'exchange_rate'] });
      const label = i18nPort?.translate('settings.currency.success') ?? `Base currency set to ${currency}`;
      toast.success(label);
    },
    onError: () => {
      const label = i18nPort?.translate('settings.currency.error') ?? 'Failed to save currency';
      toast.error(label);
    },
  });
}

/**
 * useSyncExchangeRatesMutation
 *
 * Triggers a manual sync of the fiat exchange rates from the ECB XML.
 * Invalidates the exchange_rate queries upon success.
 */
export function useSyncExchangeRatesMutation() {
  const settingsPort = inject(SETTINGS_PORT_KEY);
  const i18nPort = inject(I18N_PORT_KEY);

  if (!settingsPort) {
    throw new Error('[useSyncExchangeRatesMutation] Required port ISettingsPort is not provided.');
  }

  const queryCache = useQueryCache();
  const useCase = new SyncExchangeRatesUseCase(settingsPort);

  return useMutation({
    mutation: async () => {
      await useCase.execute();
    },
    onSuccess: () => {
      queryCache.invalidateQueries({ key: ['settings', 'exchange_rate'] });
      const label = i18nPort?.translate('settings.currency.sync_success') ?? 'Exchange rates synced successfully';
      toast.success(label);
    },
    onError: () => {
      const label = i18nPort?.translate('settings.currency.sync_error') ?? 'Failed to sync exchange rates';
      toast.error(label);
    },
  });
}

/**
 * useUpdateSupportedAccountsMutation
 *
 * Mutation to update the supported accounts configuration.
 */
export function useUpdateSupportedAccountsMutation() {
  const settingsPort = inject(SETTINGS_PORT_KEY);
  const i18nPort = inject(I18N_PORT_KEY);

  if (!settingsPort) {
    throw new Error('[useUpdateSupportedAccountsMutation] Required port ISettingsPort is not provided.');
  }

  const queryCache = useQueryCache();

  return useMutation({
    mutation: async (accounts: { value: string; label: string }[]) => {
      await settingsPort.setSupportedAccounts(accounts);
      return accounts;
    },
    onSuccess: () => {
      queryCache.invalidateQueries({ key: ['settings', 'supported_accounts'] });
      const label = i18nPort?.translate('settings.accounts.success') ?? 'Accounts updated successfully';
      toast.success(label);
    },
    onError: () => {
      const label = i18nPort?.translate('settings.accounts.error') ?? 'Failed to save accounts';
      toast.error(label);
    },
  });
}
