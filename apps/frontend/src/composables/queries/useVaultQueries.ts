import { useQuery } from "@pinia/colada";
import { bffClient } from "@/core/infrastructure/http/BffClient";
import type { VaultProvider } from "@/core/domain/models/VaultEntities";

export const VAULT_STATUS_KEY = ["vault-status"];
export const VAULT_PROVIDERS_KEY = ["vault-providers"];

export function useVaultStatusQuery() {
  return useQuery({
    key: VAULT_STATUS_KEY,
    query: async () => {
      const res = await bffClient.api.credentials.vault.status.$get();
      if (!res.ok) throw new Error("Failed to fetch status");
      const data = await res.json() as { isUnlocked: boolean; configuredServices: string[]; enabledServices: string[] };
      return data;
    },
  });
}

export function useVaultProvidersQuery() {
  return useQuery({
    key: VAULT_PROVIDERS_KEY,
    query: async () => {
      const res = await bffClient.api.credentials.vault.providers.$get();
      if (!res.ok) throw new Error("Failed to fetch providers");
      return (await res.json()) as VaultProvider[];
    },
  });
}
