import crypto from 'node:crypto';
import type { ICryptographyPort } from '../../../domain/ports/ICryptographyPort.ts';
import type { IVaultCredentialsPort } from '../../../domain/ports/IVaultCredentialsPort.ts';

const SALT_KEY = 'kdf_salt';

export class UnlockVaultUseCase {
  private readonly cryptographyPort: ICryptographyPort;
  private readonly credentialsPort: IVaultCredentialsPort;

  constructor(
    cryptographyPort: ICryptographyPort,
    credentialsPort: IVaultCredentialsPort
  ) {
    this.cryptographyPort = cryptographyPort;
    this.credentialsPort = credentialsPort;
  }

  public async execute(password: string): Promise<void> {
    let salt = await this.credentialsPort.getMetadata(SALT_KEY);

    if (!salt) {
      salt = crypto.randomBytes(16);
      await this.credentialsPort.setMetadata(SALT_KEY, salt);
    }

    await this.cryptographyPort.initialize(password, salt);
  }
}
