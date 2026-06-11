import type { ISettingsPort } from '@/core/domain/ports/ISettingsPort';
import type { I18nPort } from '@/core/domain/ports/I18nPort';

/**
 * InitializeLanguageUseCase
 *
 * Fetches the saved language from the backend (via ISettingsPort)
 * and updates the UI locale (via I18nPort) on application startup.
 */
export class InitializeLanguageUseCase {
  private readonly settingsPort: ISettingsPort;
  private readonly i18nPort: I18nPort;

  constructor(settingsPort: ISettingsPort, i18nPort: I18nPort) {
    this.settingsPort = settingsPort;
    this.i18nPort = i18nPort;
  }

  async execute(): Promise<void> {
    try {
      const locale = await this.settingsPort.getLanguage();
      const supportedLocales = this.i18nPort.getSupportedLocales().map((l) => l.code);
      
      const normalizedLocale = supportedLocales.includes(locale)
        ? locale
        : 'en';

      this.i18nPort.setLocale(normalizedLocale);
    } catch (e) {
      console.error('[InitializeLanguageUseCase] Failed to load language:', e);
    }
  }
}
