import type { ICryptographyPort } from '../../../domain/ports/ICryptographyPort.js';
import type { IVaultCredentialsPort } from '../../../domain/ports/IVaultCredentialsPort.js';

export interface VaultStatus {
  isUnlocked: boolean;
  configuredServices: string[];
  enabledServices: string[];
}

export class GetVaultStatusUseCase {
  private cryptographyPort: ICryptographyPort;
  private credentialsPort: IVaultCredentialsPort;

  constructor(
    cryptographyPort: ICryptographyPort,
    credentialsPort: IVaultCredentialsPort,
  ) {
    this.cryptographyPort = cryptographyPort;
    this.credentialsPort = credentialsPort;
  }

  public async execute(): Promise<VaultStatus> {
    const isUnlocked = this.cryptographyPort.isUnlocked();
    if (!isUnlocked) {
      return { isUnlocked: false, configuredServices: [], enabledServices: [] };
    }

    const configuredServices = await this.credentialsPort.getConfiguredServices();
    const enabledServices = await this.credentialsPort.getEnabledServices();
    return { isUnlocked: true, configuredServices, enabledServices };
  }
}
