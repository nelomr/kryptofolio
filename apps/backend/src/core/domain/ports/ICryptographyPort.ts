/**
 * ICryptographyPort — Domain Port for symmetric encryption/decryption.
 *
 * Lives in the DOMAIN layer. No crypto library imports here.
 * Implementation: AesGcmCryptographyAdapter (infrastructure layer).
 */
export interface EncryptedArtifact {
  ciphertext: Buffer;
  iv: Buffer;
  authTag: Buffer;
}

export interface ICryptographyPort {
  initialize(passwordOrKey?: Buffer | string, salt?: Buffer): Promise<void>;
  isUnlocked(): boolean;
  lock(): void;
  encrypt(plainPayload: Buffer): Promise<EncryptedArtifact>;
  decrypt(artifact: EncryptedArtifact): Promise<Buffer>;
}
