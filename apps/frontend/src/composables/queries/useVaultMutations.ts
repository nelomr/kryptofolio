import { useMutation, useQueryCache } from "@pinia/colada";
import { inject } from "vue";
import { VAULT_PORT_KEY } from "@/core/injectionKeys";
import { VAULT_STATUS_KEY } from "./useVaultQueries";
import { UnlockVaultUseCase } from "@/core/application/use-cases/vault/UnlockVaultUseCase";
import { SaveVaultKeyUseCase } from "@/core/application/use-cases/vault/SaveVaultKeyUseCase";
import { ToggleVaultProviderUseCase } from "@/core/application/use-cases/vault/ToggleVaultProviderUseCase";

export function useUnlockVaultMutation() {
  const queryCache = useQueryCache();
  const vaultPort = inject(VAULT_PORT_KEY);
  if (!vaultPort) throw new Error("VAULT_PORT_KEY not provided");

  const useCase = new UnlockVaultUseCase(vaultPort);

  return useMutation({
    mutation: async (password: string) => {
      const data = await useCase.execute(password);
      queryCache.invalidateQueries({ key: VAULT_STATUS_KEY });
      return data;
    },
  });
}

export function useSaveVaultKeyMutation() {
  const queryCache = useQueryCache();
  const vaultPort = inject(VAULT_PORT_KEY);
  if (!vaultPort) throw new Error("VAULT_PORT_KEY not provided");

  const useCase = new SaveVaultKeyUseCase(vaultPort);

  return useMutation({
    mutation: async ({ service, payload }: { service: string; payload: Record<string, string> }) => {
      const data = await useCase.execute(service, payload);
      queryCache.invalidateQueries({ key: VAULT_STATUS_KEY });
      return data;
    },
  });
}

export function useToggleVaultProviderMutation() {
  const queryCache = useQueryCache();
  const vaultPort = inject(VAULT_PORT_KEY);
  if (!vaultPort) throw new Error("VAULT_PORT_KEY not provided");

  const useCase = new ToggleVaultProviderUseCase(vaultPort);

  return useMutation({
    mutation: async ({ service, enabled }: { service: string; enabled: boolean }) => {
      const data = await useCase.execute(service, enabled);
      queryCache.invalidateQueries({ key: VAULT_STATUS_KEY });
      return data;
    },
  });
}
