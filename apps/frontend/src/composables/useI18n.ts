/**
 * useI18n — Composable description.
 */

import { inject } from 'vue';
import { I18N_PORT_KEY } from '@/core/injectionKeys';

export function useI18n() {
  const i18n = inject(I18N_PORT_KEY);

  if (!i18n) {
    throw new Error('I18nPort is not provided. Make sure to provide it at the app root.');
  }

  const t = (key: string, params?: Record<string, string>): string => {
    return i18n.translate(key, params);
  };

  return { t };
}
