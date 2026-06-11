import type { I18nPort } from '@/core/domain/ports/I18nPort';
import type { I18nDictionary } from '@/core/domain/models/I18nDictionary';

export class EnvI18nAdapter implements I18nPort {
  private dictionary: I18nDictionary;
  private currentLocale: string;
  private supportedLocales: string[];

  constructor(dictionary: I18nDictionary, locale: string = 'en', supportedLocales?: string[]) {
    this.dictionary = dictionary;
    this.currentLocale = locale;
    this.supportedLocales = supportedLocales ?? [locale];
  }

  setLocale(locale: string): void {
    this.currentLocale = locale;
  }

  getLocale(): string {
    return this.currentLocale;
  }

  getSupportedLocales(): Array<{ code: string; labelKey: string }> {
    return this.supportedLocales.map((code) => ({
      code,
      labelKey: `settings.language.option_${code}`,
    }));
  }

  translate(key: string, params?: Record<string, string>): string {
    let translation = this.dictionary[key];

    if (translation === undefined) {
      console.warn(`[i18n] Missing translation for key: "${key}"`);
      return key;
    }

    if (params) {
      for (const [paramKey, paramValue] of Object.entries(params)) {
        translation = translation.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), paramValue);
      }
    }

    return translation;
  }
}

