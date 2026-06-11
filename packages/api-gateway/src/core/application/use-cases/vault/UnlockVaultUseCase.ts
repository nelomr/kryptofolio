import crypto from 'node:crypto';
import type { ICryptographyPort } from '../../../domain/ports/ICryptographyPort.ts';
import type { IVaultCredentialsPort } from '../../../domain/ports/IVaultCredentialsPort.ts';

const SALT_KEY = 'kdf_salt';

const VERIFIER_KEY = 'verification_payload';
const EXPECTED_VERIFIER = 'kryptofolio_vault_ok';

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
    const isFirstRun = !salt;

    if (!salt) {
      salt = crypto.randomBytes(16);
      await this.credentialsPort.setMetadata(SALT_KEY, salt);
    }

    // Initialize key derivation
    await this.cryptographyPort.initialize(password, salt);

    if (isFirstRun) {
      await this.createAndStoreVerifier();
    } else {
      const verifierPayload = await this.credentialsPort.getMetadata(VERIFIER_KEY);
      if (!verifierPayload) {
        // Graceful migration: existing DB had salt but no verifier.
        // Assume key is valid and generate a verifier so next time it validates.
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
      // Structure: 12 bytes IV + 16 bytes AuthTag + N bytes Ciphertext
      const iv = serializedPayload.subarray(0, 12);
      const authTag = serializedPayload.subarray(12, 28);
      const ciphertext = serializedPayload.subarray(28);

      const decrypted = await this.cryptographyPort.decrypt({ iv, authTag, ciphertext });
      if (decrypted.toString() !== EXPECTED_VERIFIER) {
        throw new Error('INVALID_PASSWORD');
      }
    } catch (error) {
      this.cryptographyPort.lock();
      throw new Error('INVALID_PASSWORD');
    }
  }
}
