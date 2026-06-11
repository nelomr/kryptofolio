import type { IVaultPort } from '@/core/domain/ports/IVaultPort';
import type { VaultProvider } from '@/core/domain/models/VaultEntities';

export class GetVaultProvidersUseCase {
  private readonly vaultPort: IVaultPort;

  constructor(vaultPort: IVaultPort) {
    this.vaultPort = vaultPort;
  }

  async execute(): Promise<VaultProvider[]> {
    return this.vaultPort.getProviders();
  }
}
