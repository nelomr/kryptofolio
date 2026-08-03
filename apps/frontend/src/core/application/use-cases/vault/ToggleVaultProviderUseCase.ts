import type { IVaultPort, VaultToggleProviderResult } from '@/core/domain/ports/IVaultPort';

export class ToggleVaultProviderUseCase {
  private readonly vaultPort: IVaultPort;

  constructor(vaultPort: IVaultPort) {
    this.vaultPort = vaultPort;
  }

  async execute(service: string, enabled: boolean): Promise<VaultToggleProviderResult> {
    return this.vaultPort.toggleVaultProvider(service, enabled);
  }
}
