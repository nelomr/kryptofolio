import type { ICryptographyPort } from '../../../domain/ports/ICryptographyPort.ts';
import type { IVaultCredentialsPort } from '../../../domain/ports/IVaultCredentialsPort.ts';

export class StoreServiceCredentialUseCase {
  private readonly cryptographyPort: ICryptographyPort;
  private readonly credentialsPort: IVaultCredentialsPort;

  constructor(
    cryptographyPort: ICryptographyPort,
    credentialsPort: IVaultCredentialsPort
  ) {
    this.cryptographyPort = cryptographyPort;
    this.credentialsPort = credentialsPort;
  }

  public async execute(serviceIdentifier: string, payload: Record<string, string>): Promise<void> {
    if (!this.cryptographyPort.isUnlocked()) {
      throw new Error('VAULT_LOCKED');
    }

    const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const plainBuffer = Buffer.from(payloadString, 'utf8');
    const encryptedArtifact = await this.cryptographyPort.encrypt(plainBuffer);

    await this.credentialsPort.saveCredential(serviceIdentifier, encryptedArtifact);
  }
}
