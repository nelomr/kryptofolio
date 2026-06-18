import crypto from 'node:crypto';
import type { ICryptographyPort } from '../../../domain/ports/ICryptographyPort.js';
import type { IVaultCredentialsPort } from '../../../domain/ports/IVaultCredentialsPort.js';

const SALT_KEY = 'kdf_salt';
const VERIFIER_KEY = 'verification_payload';
const EXPECTED_VERIFIER = 'kryptofolio_vault_ok';

export class UnlockVaultUseCase {
  private cryptographyPort: ICryptographyPort;
  private credentialsPort: IVaultCredentialsPort;

  constructor(
    cryptographyPort: ICryptographyPort,
    credentialsPort: IVaultCredentialsPort,
  ) {
    this.cryptographyPort = cryptographyPort;
    this.credentialsPort = credentialsPort;
  }

  public async execute(password: string): Promise<void> {
    let salt = await this.credentialsPort.getMetadata(SALT_KEY);
    const isFirstRun = !salt;

    if (!salt) {
      salt = crypto.randomBytes(16);
      await this.credentialsPort.setMetadata(SALT_KEY, salt);
    }

    await this.cryptographyPort.initialize(password, salt);

    if (isFirstRun) {
      await this.createAndStoreVerifier();
    } else {
      const verifierPayload = await this.credentialsPort.getMetadata(VERIFIER_KEY);
      if (!verifierPayload) {
        await this.createAndStoreVerifier();
      } else {
        await this.verifyPassword(verifierPayload);
      }
    }
  }

  private async createAndStoreVerifier(): Promise<void> {
    const artifact = await this.cryptographyPort.encrypt(Buffer.from(EXPECTED_VERIFIER));
    const serialized = Buffer.concat([artifact.iv, artifact.authTag, artifact.ciphertext]);
    await this.credentialsPort.setMetadata(VERIFIER_KEY, serialized);
  }

  private async verifyPassword(serializedPayload: Buffer): Promise<void> {
    try {
      const iv = serializedPayload.subarray(0, 12);
      const authTag = serializedPayload.subarray(12, 28);
      const ciphertext = serializedPayload.subarray(28);

      const decrypted = await this.cryptographyPort.decrypt({ iv, authTag, ciphertext });
      if (decrypted.toString() !== EXPECTED_VERIFIER) {
        throw new Error('INVALID_PASSWORD');
      }
    } catch (_error) {
      this.cryptographyPort.lock();
      throw new Error('INVALID_PASSWORD');
    }
  }
}
