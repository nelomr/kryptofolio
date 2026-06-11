import type { ICryptographyPort } from '../../../domain/ports/ICryptographyPort.ts';
import type { IVaultCredentialsPort } from '../../../domain/ports/IVaultCredentialsPort.ts';

export class ToggleVaultProviderUseCase {
  private readonly cryptographyPort: ICryptographyPort;
  private readonly credentialsPort: IVaultCredentialsPort;

  constructor(
    cryptographyPort: ICryptographyPort,
    credentialsPort: IVaultCredentialsPort
  ) {
    this.cryptographyPort = cryptographyPort;
    this.credentialsPort = credentialsPort;
  }

  public async execute(providerId: string, enabled: boolean): Promise<void> {
    if (!this.cryptographyPort.isUnlocked()) {
      throw new Error('VAULT_LOCKED');
    }

    const configuredServices = await this.credentialsPort.getConfiguredServices();
    if (!configuredServices.includes(providerId)) {
      throw new Error('PROVIDER_NOT_CONFIGURED');
    }

    await this.credentialsPort.setServiceEnabled(providerId, enabled);
  }
}
