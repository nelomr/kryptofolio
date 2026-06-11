import { useMutation } from '@pinia/colada';
import { inject } from 'vue';
import { toast } from 'vue-sonner';
import { I18N_PORT_KEY, SETTINGS_PORT_KEY } from '@/core/injectionKeys';
import { UpdateLanguageUseCase } from '@/core/application/use-cases/UpdateLanguageUseCase';

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

