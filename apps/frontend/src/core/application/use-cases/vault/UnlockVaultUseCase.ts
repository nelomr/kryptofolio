import type { IVaultPort, VaultUnlockResult } from '@/core/domain/ports/IVaultPort';

export class UnlockVaultUseCase {
  private readonly vaultPort: IVaultPort;

  constructor(vaultPort: IVaultPort) {
    this.vaultPort = vaultPort;
  }

  async execute(password: string): Promise<VaultUnlockResult> {
    return this.vaultPort.unlockVault(password);
  }
}
