import type { VaultProvider } from '../models/VaultEntities';

export interface VaultStatusResponse {
  isUnlocked: boolean;
  configuredServices: string[];
  enabledServices: string[];
}

/**
 * These describe only the successful outcome. A failed vault operation reaches the caller as a
 * thrown error carrying the backend's reason, never as a `success: false` value — so a union with
 * a failure arm would describe a shape the adapter cannot return.
 */
export interface VaultUnlockResult {
  readonly message: string;
}

export interface VaultSaveKeyResult {
  readonly message: string;
}

export interface VaultToggleProviderResult {
  readonly enabled: boolean;
}

export interface IVaultPort {
  getVaultStatus(): Promise<VaultStatusResponse>;
  getProviders(): Promise<VaultProvider[]>;
  unlockVault(password: string): Promise<VaultUnlockResult>;
  saveVaultKey(service: string, payload: Record<string, string>): Promise<VaultSaveKeyResult>;
  toggleVaultProvider(service: string, enabled: boolean): Promise<VaultToggleProviderResult>;
}
