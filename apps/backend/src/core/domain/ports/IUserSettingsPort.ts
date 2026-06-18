/**
 * IUserSettingsPort — Domain Port for persisting user application settings.
 *
 * Lives in the DOMAIN layer. Implemented by SqliteVaultPortAdapter (shared DB instance).
 */
export interface IUserSettingsPort {
  getSetting(key: string): Promise<string | null>;
  setSetting(key: string, value: string): Promise<void>;
}
