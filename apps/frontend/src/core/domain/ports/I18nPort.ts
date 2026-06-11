export interface I18nPort {
  translate(key: string, params?: Record<string, string>): string;
  setLocale(locale: string): void;
  getLocale(): string;
  getSupportedLocales(): Array<{ code: string; labelKey: string }>;
}


