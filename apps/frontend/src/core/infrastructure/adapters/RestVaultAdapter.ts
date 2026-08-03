import { bffClient } from '@/core/infrastructure/http/BffClient';
import type {
  IVaultPort,
  VaultStatusResponse,
  VaultUnlockResult,
  VaultSaveKeyResult,
  VaultToggleProviderResult,
} from '@/core/domain/ports/IVaultPort';
import type { VaultProvider } from '@/core/domain/models/VaultEntities';

const parseBffError = (errorData: unknown, fallback: string): string => {
  if (!errorData || typeof errorData !== 'object') return fallback;
  const data = errorData as Record<string, unknown>;
  if (typeof data.error === 'string' && data.error) return data.error;
  if (data.error && typeof data.error === 'object') {
    const errorObj = data.error as Record<string, unknown>;
    if (Array.isArray(errorObj.issues) && typeof errorObj.issues[0]?.message === 'string') {
      return errorObj.issues[0].message;
    }
  }
  if (typeof data.message === 'string' && data.message) return data.message;
  return fallback;
};

export class RestVaultAdapter implements IVaultPort {
  async getVaultStatus(): Promise<VaultStatusResponse> {
    const res = await bffClient.api.credentials.vault.status.$get();
    if (!res.ok) throw new Error("Failed to fetch status");
    const data = await res.json();
    return data as VaultStatusResponse;
  }

  async getProviders(): Promise<VaultProvider[]> {
    const res = await bffClient.api.credentials.vault.providers.$get();
    if (!res.ok) throw new Error("Failed to fetch providers");
    return (await res.json()) as VaultProvider[];
  }

  async unlockVault(password: string): Promise<VaultUnlockResult> {
    const res = await bffClient.api.credentials.vault.unlock.$post({
      json: { password },
    });
    if (!res.ok) {
      const errorData = await res.json().catch(() => null);
      throw new Error(parseBffError(errorData, "vault.errors.unlock_failed"));
    }
    const body = await res.json();
    return { message: 'message' in body ? body.message : '' };
  }

  async saveVaultKey(service: string, payload: Record<string, string>): Promise<VaultSaveKeyResult> {
    const res = await bffClient.api.credentials.vault[':service'].$post({
      param: { service },
      json: { payload },
    });
    if (!res.ok) {
      const errorData = await res.json().catch(() => null);
      throw new Error(parseBffError(errorData, "vault.errors.save_failed"));
    }
    const body = await res.json();
    return { message: 'message' in body ? body.message : '' };
  }

  async toggleVaultProvider(service: string, enabled: boolean): Promise<VaultToggleProviderResult> {
    const res = await bffClient.api.credentials.vault[':service'].status.$patch({
      param: { service },
      json: { enabled },
    });
    if (!res.ok) {
      const errorData = await res.json().catch(() => null);
      throw new Error(parseBffError(errorData, "vault.errors.toggle_failed"));
    }
    const body = await res.json();
    return { enabled: 'enabled' in body ? body.enabled : enabled };
  }
}
