/**
 * ISettingsPort — Port for reading and writing user application settings.
 * Implemented by the infrastructure adapter that calls the backend API.
 */
export interface ISettingsPort {
  getLanguage(): Promise<string>;
  setLanguage(language: string): Promise<void>;
  getActiveMarketProvider(): Promise<string | null>;
  setActiveMarketProvider(providerId: string): Promise<void>;
}
