import { ref, computed } from 'vue';
import type { I18nPort } from '@/core/domain/ports/I18nPort';
import type { I18nDictionary } from '@/core/domain/models/I18nDictionary';
import { es } from '@/i18n/dictionaries/es';
import { en } from '@/i18n/dictionaries/en';

const dictionaries: Record<string, I18nDictionary> = { es, en };

/**
 * ReactiveI18nAdapter — Infrastructure adapter implementing I18nPort.
 *
 * Uses a reactive Vue `ref()` for the active locale so that all
 * components using `useI18n().t()` automatically re-render when
 * `setLocale()` is called (e.g., after saving language setting).
 */
export class ReactiveI18nAdapter implements I18nPort {
  public readonly locale = ref<string>('en');
  private readonly dictionary = computed<I18nDictionary>(
    () => dictionaries[this.locale.value] ?? en,
  );

  constructor(initialLocale: string = 'en') {
    this.locale.value = initialLocale;
  }


  setLocale(locale: string): void {
    this.locale.value = locale;
  }

  getLocale(): string {
    return this.locale.value;
  }

  getSupportedLocales(): Array<{ code: string; labelKey: string }> {
    return Object.keys(dictionaries).map((code) => ({
      code,
      labelKey: `settings.language.option_${code}`,
    }));
  }

  translate(key: string, params?: Record<string, string>): string {
    let translation = this.dictionary.value[key];

    if (translation === undefined) {
      console.warn(`[i18n] Missing translation for key: "${key}"`);
      return key;
    }

    if (params) {
      for (const [paramKey, paramValue] of Object.entries(params)) {
        translation = translation.replace(
          new RegExp(`\\{${paramKey}\\}`, 'g'),
          paramValue,
        );
      }
    }

    return translation;
  }
}
