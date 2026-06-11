import { useMutation, useQueryCache } from "@pinia/colada";
import { bffClient } from "@/core/infrastructure/http/BffClient";
import { VAULT_STATUS_KEY } from "./useVaultQueries";

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

export function useUnlockVaultMutation() {
  const queryCache = useQueryCache();

  return useMutation({
    mutation: async (password: string) => {
      const res = await bffClient.api.credentials.vault.unlock.$post({
        json: { password },
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        throw new Error(parseBffError(errorData, "vault.errors.unlock_failed"));
      }
      const data = await res.json();
      
      // Invalidate the vault status query so it refetches
      queryCache.invalidateQueries({ key: VAULT_STATUS_KEY });
      
      return data;
    },
  });
}

export function useSaveVaultKeyMutation() {
  const queryCache = useQueryCache();

  return useMutation({
    mutation: async ({
      service,
      payload,
    }: {
      service: string;
      payload: Record<string, string>;
    }) => {
      const res = await bffClient.api.credentials.vault[":service"].$post({
        param: { service },
        json: { payload },
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        throw new Error(parseBffError(errorData, "vault.errors.save_failed"));
      }
      
      // Invalidate the vault status query to reflect the newly configured service
      queryCache.invalidateQueries({ key: VAULT_STATUS_KEY });
      
      return res.json();
    },
  });
}

export function useToggleVaultProviderMutation() {
  const queryCache = useQueryCache();

  return useMutation({
    mutation: async ({
      service,
      enabled,
    }: {
      service: string;
      enabled: boolean;
    }) => {
      const res = await bffClient.api.credentials.vault[":service"].status.$patch({
        param: { service },
        json: { enabled },
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        throw new Error(parseBffError(errorData, "vault.errors.toggle_failed"));
      }
      
      // Invalidate the vault status query to reflect the newly enabled/disabled service
      queryCache.invalidateQueries({ key: VAULT_STATUS_KEY });
      
      return res.json();
    },
  });
}
