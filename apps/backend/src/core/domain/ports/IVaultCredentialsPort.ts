import type { EncryptedArtifact } from "./ICryptographyPort.js";

/**
 * IVaultCredentialsPort — Domain Port for encrypted credential storage.
 *
 * Lives in the DOMAIN layer. No database-engine imports allowed here.
 * Implementations: SqliteVaultPortAdapter (current), future PostgresVaultPortAdapter.
 */
export interface IVaultCredentialsPort {
  getConfiguredServices(): Promise<string[]>;
  getEnabledServices(): Promise<string[]>;
  setServiceEnabled(serviceIdentifier: string, enabled: boolean): Promise<void>;
  saveCredential(
    serviceIdentifier: string,
    artifact: EncryptedArtifact,
  ): Promise<void>;
  getCredential(serviceIdentifier: string): Promise<EncryptedArtifact | null>;
  getMetadata(key: string): Promise<Buffer | null>;
  setMetadata(key: string, value: Buffer): Promise<void>;
}
