import { useQuery } from "@pinia/colada";
import { inject } from "vue";
import { VAULT_PORT_KEY } from "@/core/injectionKeys";
import { GetVaultStatusUseCase } from "@/core/application/use-cases/vault/GetVaultStatusUseCase";
import { GetVaultProvidersUseCase } from "@/core/application/use-cases/vault/GetVaultProvidersUseCase";

export const VAULT_STATUS_KEY = ["vault-status"];
export const VAULT_PROVIDERS_KEY = ["vault-providers"];

export function useVaultStatusQuery() {
  const vaultPort = inject(VAULT_PORT_KEY);
  if (!vaultPort) throw new Error("VAULT_PORT_KEY not provided");

  const useCase = new GetVaultStatusUseCase(vaultPort);

  return useQuery({
    key: VAULT_STATUS_KEY,
    query: async () => useCase.execute(),
  });
}

export function useVaultProvidersQuery() {
  const vaultPort = inject(VAULT_PORT_KEY);
  if (!vaultPort) throw new Error("VAULT_PORT_KEY not provided");

  const useCase = new GetVaultProvidersUseCase(vaultPort);

  return useQuery({
    key: VAULT_PROVIDERS_KEY,
    query: async () => useCase.execute(),
  });
}
