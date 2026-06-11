import type { IVaultPort } from '@/core/domain/ports/IVaultPort';

export class SaveVaultKeyUseCase {
  private readonly vaultPort: IVaultPort;

  constructor(vaultPort: IVaultPort) {
    this.vaultPort = vaultPort;
  }

  async execute(service: string, payload: Record<string, string>): Promise<any> {
    return this.vaultPort.saveVaultKey(service, payload);
  }
}
