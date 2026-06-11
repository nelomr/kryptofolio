import type { EncryptedArtifact } from './ICryptographyPort.ts';

export interface IVaultCredentialsPort {
  initializeDatabase(): Promise<void>;
  getConfiguredServices(): Promise<string[]>;
  getEnabledServices(): Promise<string[]>;
  setServiceEnabled(serviceIdentifier: string, enabled: boolean): Promise<void>;
  saveCredential(serviceIdentifier: string, artifact: EncryptedArtifact): Promise<void>;
  getCredential(serviceIdentifier: string): Promise<EncryptedArtifact | null>;
  getMetadata(key: string): Promise<Buffer | null>;
  setMetadata(key: string, value: Buffer): Promise<void>;
}
