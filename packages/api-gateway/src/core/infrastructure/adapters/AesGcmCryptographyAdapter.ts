import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { type ICryptographyPort, type EncryptedArtifact } from '../../domain/ports/ICryptographyPort.ts';
import { bffLogger } from '../../../utils/logger.ts';

const scryptAsync = promisify(crypto.scrypt);

export class AesGcmCryptographyAdapter implements ICryptographyPort {
  private readonly algorithm = 'aes-256-gcm';
  private masterKey: Buffer | null = null;

  public async initialize(passwordOrKey?: Buffer | string, salt?: Buffer): Promise<void> {
    if (passwordOrKey) {
      if (typeof passwordOrKey === 'string') {
        if (!salt) {
          throw new Error('Salt is required for password-based key derivation');
        }
        this.masterKey = (await scryptAsync(passwordOrKey, salt, 32)) as Buffer;
      } else {
        this.masterKey = passwordOrKey;
      }
      return;
    }
    try {
      const { AsyncEntry } = await import('@napi-rs/keyring');
      const entry = new AsyncEntry('kryptofolio', 'master_key');
      let keyHex: string | undefined;
      try {
        keyHex = await entry.getPassword();
      } catch (e) {
        // Not found or error retrieving
        keyHex = undefined;
      }
      
      if (!keyHex) {
        keyHex = crypto.randomBytes(32).toString('hex');
        await entry.setPassword(keyHex);
      }
      this.masterKey = Buffer.from(keyHex, 'hex');
    } catch (e) {
      bffLogger.warn({ err: e }, '[Vault] Keytar unavailable, falling back to environment variables.');
      const envKey = process.env.KRYPTO_MASTER_KEY;
      if (envKey) {
        this.masterKey = Buffer.from(envKey, 'base64');
      } else {
        throw new Error('VAULT_LOCKED');
      }
    }
  }

  public isUnlocked(): boolean {
    return this.masterKey !== null;
  }

  public lock(): void {
    if (this.masterKey) {
      this.masterKey.fill(0);
      this.masterKey = null;
    }
  }

  public async encrypt(plainPayload: Buffer): Promise<EncryptedArtifact> {
    if (!this.masterKey) throw new Error('VAULT_LOCKED');
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(this.algorithm, this.masterKey, iv); 

    const encrypted = Buffer.concat([
      cipher.update(plainPayload),
      cipher.final()
    ]);
    const authTag = cipher.getAuthTag(); 

    // Securely clear the plaintext buffer from memory
    plainPayload.fill(0); 

    return { ciphertext: encrypted, iv, authTag };
  }

  public async decrypt(artifact: EncryptedArtifact): Promise<Buffer> {
    if (!this.masterKey) throw new Error('VAULT_LOCKED');
    const decipher = crypto.createDecipheriv(this.algorithm, this.masterKey, artifact.iv); 
    decipher.setAuthTag(artifact.authTag); 

    // Returns a Buffer, NOT a string, for memory safety.
    return Buffer.concat([
      decipher.update(artifact.ciphertext),
      decipher.final()
    ]);
  }
}

