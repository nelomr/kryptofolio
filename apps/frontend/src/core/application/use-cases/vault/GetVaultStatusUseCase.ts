import type {
  IVaultPort,
  VaultStatusResponse,
} from "@/core/domain/ports/IVaultPort";

export class GetVaultStatusUseCase {
  private readonly vaultPort: IVaultPort;

  constructor(vaultPort: IVaultPort) {
    this.vaultPort = vaultPort;
  }

  async execute(): Promise<VaultStatusResponse> {
    return this.vaultPort.getVaultStatus();
  }
}
