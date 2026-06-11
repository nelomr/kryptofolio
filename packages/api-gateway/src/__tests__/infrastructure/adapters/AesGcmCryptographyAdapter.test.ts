import { describe, it, expect, beforeEach } from "vitest";
import crypto from "node:crypto";
import { AesGcmCryptographyAdapter } from "../../../core/infrastructure/adapters/AesGcmCryptographyAdapter.ts";

describe("AesGcmCryptographyAdapter", () => {
  let adapter: AesGcmCryptographyAdapter;
  const mockMasterKey = crypto.randomBytes(32);

  beforeEach(() => {
    adapter = new AesGcmCryptographyAdapter();
  });

  it("should be locked initially", () => {
    expect(adapter.isUnlocked()).toBe(false);
  });

  it("should throw when encrypting without initialization", async () => {
    await expect(adapter.encrypt(Buffer.from("test"))).rejects.toThrow(
      "VAULT_LOCKED",
    );
  });

  it("should initialize with provided key", async () => {
    await adapter.initialize(mockMasterKey);
    expect(adapter.isUnlocked()).toBe(true);
  });

  it("should encrypt and decrypt data properly", async () => {
    await adapter.initialize(mockMasterKey);

    const plaintextStr = "super_secret_api_key_123";
    const plainBuffer = Buffer.from(plaintextStr, "utf8");

    const artifact = await adapter.encrypt(plainBuffer);

    expect(artifact.ciphertext).toBeDefined();
    expect(artifact.iv).toBeDefined();
    expect(artifact.authTag).toBeDefined();

    // Verify buffer was scrubbed
    expect(plainBuffer.toString("hex")).toBe(
      Buffer.alloc(plaintextStr.length, 0).toString("hex"),
    );

    const decryptedBuffer = await adapter.decrypt(artifact);
    expect(decryptedBuffer.toString("utf8")).toBe(plaintextStr);
  });

  it("should fail decryption if auth tag is tampered", async () => {
    await adapter.initialize(mockMasterKey);

    const artifact = await adapter.encrypt(Buffer.from("sensitive_data"));

    // Tamper with the auth tag
    artifact.authTag[0] = artifact.authTag[0] ^ 1;

    await expect(adapter.decrypt(artifact)).rejects.toThrow();
  });
});
