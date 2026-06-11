/**
 * IUserSettingsPort — Port for persisting and reading user application settings.
 * Implemented by SqliteVaultRepositoryAdapter (shared DB instance).
 */
export interface IUserSettingsPort {
  getSetting(key: string): Promise<string | null>;
  setSetting(key: string, value: string): Promise<void>;
}
