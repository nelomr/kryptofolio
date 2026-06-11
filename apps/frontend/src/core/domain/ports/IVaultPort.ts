import type { VaultProvider } from '../models/VaultEntities';

export interface VaultStatusResponse {
  isUnlocked: boolean;
  configuredServices: string[];
  enabledServices: string[];
}

export interface IVaultPort {
  getVaultStatus(): Promise<VaultStatusResponse>;
  getProviders(): Promise<VaultProvider[]>;
  unlockVault(password: string): Promise<any>;
  saveVaultKey(service: string, payload: Record<string, string>): Promise<any>;
  toggleVaultProvider(service: string, enabled: boolean): Promise<any>;
}
