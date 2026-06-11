import { useQuery } from '@pinia/colada';
import { inject } from 'vue';
import { I18N_PORT_KEY, SETTINGS_PORT_KEY } from '@/core/injectionKeys';
import { InitializeLanguageUseCase } from '@/core/application/use-cases/InitializeLanguageUseCase';

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
