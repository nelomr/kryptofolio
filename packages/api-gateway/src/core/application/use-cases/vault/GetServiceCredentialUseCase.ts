import type { ICryptographyPort } from '../../../domain/ports/ICryptographyPort.ts';
import type { IVaultCredentialsPort } from '../../../domain/ports/IVaultCredentialsPort.ts';

export class GetServiceCredentialUseCase {
  private readonly cryptographyPort: ICryptographyPort;
  private readonly credentialsPort: IVaultCredentialsPort;

  constructor(
    cryptographyPort: ICryptographyPort,
    credentialsPort: IVaultCredentialsPort
  ) {
    this.cryptographyPort = cryptographyPort;
    this.credentialsPort = credentialsPort;
  }

  public async execute(serviceIdentifier: string): Promise<Record<string, string> | null> {
    if (!this.cryptographyPort.isUnlocked()) {
      throw new Error('VAULT_LOCKED');
    }

    const encryptedArtifact = await this.credentialsPort.getCredential(serviceIdentifier);
    if (!encryptedArtifact) return null;

    const decryptedBuffer = await this.cryptographyPort.decrypt(encryptedArtifact);
    const decryptedString = decryptedBuffer.toString('utf8');

    // Securely scrub the decrypted buffer from memory
    decryptedBuffer.fill(0);

    try {
      return JSON.parse(decryptedString) as Record<string, string>;
    } catch {
      return { apiKey: decryptedString };
    }
  }
}
