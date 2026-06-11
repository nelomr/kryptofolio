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
