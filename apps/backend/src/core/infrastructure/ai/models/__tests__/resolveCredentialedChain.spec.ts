import { describe, it, expect, vi } from 'vitest';
import type { ICryptographyPort, EncryptedArtifact } from '../../../../domain/ports/ICryptographyPort.js';
import type { IVaultCredentialsPort } from '../../../../domain/ports/IVaultCredentialsPort.js';
import { resolveCredentialedChain } from '../resolveCredentialedChain.js';
import type { ModelChain } from '@kryptofolio/shared-types';

function fakeArtifact(payload: unknown): EncryptedArtifact {
  return {
    ciphertext: Buffer.from(JSON.stringify(payload), 'utf8'),
    iv: Buffer.alloc(0),
    authTag: Buffer.alloc(0),
  };
}

class CryptographyStub implements ICryptographyPort {
  private unlocked: boolean;

  constructor(unlocked = true) {
    this.unlocked = unlocked;
  }

  async initialize(): Promise<void> {}

  isUnlocked(): boolean {
    return this.unlocked;
  }

  lock(): void {
    this.unlocked = false;
  }

  async encrypt(plainPayload: Buffer): Promise<EncryptedArtifact> {
    return fakeArtifact(JSON.parse(plainPayload.toString('utf8')));
  }

  async decrypt(artifact: EncryptedArtifact): Promise<Buffer> {
    return Buffer.from(artifact.ciphertext);
  }
}

class VaultStub implements IVaultCredentialsPort {
  private readonly credentials = new Map<string, EncryptedArtifact>();

  set(serviceIdentifier: string, apiKey: string): void {
    this.credentials.set(serviceIdentifier, fakeArtifact({ apiKey }));
  }

  async getConfiguredServices(): Promise<string[]> {
    return [...this.credentials.keys()];
  }

  async getEnabledServices(): Promise<string[]> {
    return [...this.credentials.keys()];
  }

  async setServiceEnabled(): Promise<void> {}

  async saveCredential(serviceIdentifier: string, artifact: EncryptedArtifact): Promise<void> {
    this.credentials.set(serviceIdentifier, artifact);
  }

  async getCredential(serviceIdentifier: string): Promise<EncryptedArtifact | null> {
    return this.credentials.get(serviceIdentifier) ?? null;
  }

  async getMetadata(): Promise<Buffer | null> {
    return null;
  }

  async setMetadata(): Promise<void> {}
}

describe('resolveCredentialedChain', () => {
  it('filters out an entry whose credential is absent and never contacts it', async () => {
    const vault = new VaultStub();
    const crypto = new CryptographyStub(true);
    const getCredentialSpy = vi.spyOn(vault, 'getCredential');
    const chain: ModelChain = [{ providerId: 'openai', modelId: 'gpt-4o-mini' }];

    const result = await resolveCredentialedChain(chain, crypto, vault);

    expect(result.entries).toEqual([]);
    expect(result.vaultLocked).toBe(false);
    expect(getCredentialSpy).toHaveBeenCalledWith('openai');
  });

  it('filters every keyed entry when the vault is locked', async () => {
    const vault = new VaultStub();
    vault.set('openai', 'sk-live-real-key');
    const crypto = new CryptographyStub(false);
    const chain: ModelChain = [{ providerId: 'openai', modelId: 'gpt-4o-mini' }];

    const result = await resolveCredentialedChain(chain, crypto, vault);

    expect(result.entries).toEqual([]);
    expect(result.vaultLocked).toBe(true);
  });

  it('lets an ollama entry survive with no credential when the vault is unlocked', async () => {
    const vault = new VaultStub();
    const crypto = new CryptographyStub(true);
    const chain: ModelChain = [{ providerId: 'ollama', modelId: 'llama3.1', contextWindow: 8192 }];

    const result = await resolveCredentialedChain(chain, crypto, vault);

    expect(result.entries).toEqual([{ providerId: 'ollama', modelId: 'llama3.1', contextWindow: 8192 }]);
    expect(result.vaultLocked).toBe(false);
  });

  it('lets an ollama entry survive even while the vault is locked', async () => {
    const vault = new VaultStub();
    const crypto = new CryptographyStub(false);
    const chain: ModelChain = [{ providerId: 'ollama', modelId: 'llama3.1', contextWindow: 8192 }];

    const result = await resolveCredentialedChain(chain, crypto, vault);

    expect(result.entries).toEqual([{ providerId: 'ollama', modelId: 'llama3.1', contextWindow: 8192 }]);
    expect(result.vaultLocked).toBe(true);
  });

  it('never hands an empty or placeholder apiKey to the router', async () => {
    const vault = new VaultStub();
    vault.set('openai', '');
    const crypto = new CryptographyStub(true);
    const chain: ModelChain = [{ providerId: 'openai', modelId: 'gpt-4o-mini' }];

    const result = await resolveCredentialedChain(chain, crypto, vault);

    expect(result.entries).toEqual([]);
  });

  it('resolves a keyed entry with its decrypted apiKey attached', async () => {
    const vault = new VaultStub();
    vault.set('anthropic', 'sk-ant-real-key');
    const crypto = new CryptographyStub(true);
    const chain: ModelChain = [{ providerId: 'anthropic', modelId: 'claude-3-5-sonnet' }];

    const result = await resolveCredentialedChain(chain, crypto, vault);

    expect(result.entries).toEqual([
      { providerId: 'anthropic', modelId: 'claude-3-5-sonnet', apiKey: 'sk-ant-real-key' },
    ]);
  });
  it('does not fall back to the provider environment variable when the vault holds no credential', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-from-environment');
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-from-environment');
    try {
      const chain: ModelChain = [
        { providerId: 'openai', modelId: 'gpt-5' },
        { providerId: 'anthropic', modelId: 'claude-3-5-sonnet' },
      ];

      const result = await resolveCredentialedChain(chain, new CryptographyStub(true), new VaultStub());

      expect(result.entries).toEqual([]);
      expect(JSON.stringify(result)).not.toContain('from-environment');
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
