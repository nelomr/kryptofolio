import type { ISettingsPort } from '@/core/domain/ports/ISettingsPort';
import type { I18nPort } from '@/core/domain/ports/I18nPort';

/**
 * UpdateLanguageUseCase
 *
 * Orchestrates the persistence and reactive switch of the UI language.
 * 1. Persists the new language via ISettingsPort (backend API).
 * 2. On success, calls I18nPort.setLocale() to trigger a reactive UI re-render.
 */
export class UpdateLanguageUseCase {
  private readonly settingsPort: ISettingsPort;
  private readonly i18nPort: I18nPort;

  constructor(settingsPort: ISettingsPort, i18nPort: I18nPort) {
    this.settingsPort = settingsPort;
    this.i18nPort = i18nPort;
  }

  async execute(locale: string): Promise<void> {
    const supportedLocales = this.i18nPort.getSupportedLocales().map((l) => l.code);
    
    const normalizedLocale = supportedLocales.includes(locale)
      ? locale
      : 'en';

    await this.settingsPort.setLanguage(normalizedLocale);
    this.i18nPort.setLocale(normalizedLocale);
  }
}
