import { describe, it, expect, vi } from 'vitest';
import type { IUserSettingsPort } from '../../../../domain/ports/IUserSettingsPort.js';
import type { ICryptographyPort, EncryptedArtifact } from '../../../../domain/ports/ICryptographyPort.js';
import type { IVaultCredentialsPort } from '../../../../domain/ports/IVaultCredentialsPort.js';
import { resolveChainForRequest } from '../resolveChainForRequest.js';
import { MODEL_CHAIN_SETTINGS_KEY, writeModelChain } from '../resolveModelChain.js';

class SettingsStub implements IUserSettingsPort {
  private readonly values = new Map<string, string>();

  async getSetting(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async setSetting(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }
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
    return { ciphertext: Buffer.from(plainPayload), iv: Buffer.alloc(0), authTag: Buffer.alloc(0) };
  }

  async decrypt(artifact: EncryptedArtifact): Promise<Buffer> {
    return Buffer.from(artifact.ciphertext);
  }
}

class VaultStub implements IVaultCredentialsPort {
  private readonly credentials = new Map<string, EncryptedArtifact>();

  set(serviceIdentifier: string, apiKey: string): void {
    this.credentials.set(
      serviceIdentifier,
      { ciphertext: Buffer.from(JSON.stringify({ apiKey })), iv: Buffer.alloc(0), authTag: Buffer.alloc(0) },
    );
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

describe('resolveChainForRequest', () => {
  it('fails NO_MODEL_AVAILABLE with no outbound request when no chain was ever persisted', async () => {
    const settings = new SettingsStub();
    const crypto = new CryptographyStub(true);
    const vault = new VaultStub();
    const getCredentialSpy = vi.spyOn(vault, 'getCredential');

    const result = await resolveChainForRequest({ userSettingsPort: settings, cryptographyPort: crypto, vaultPort: vault });

    expect(result).toEqual({ kind: 'failed', code: 'NO_MODEL_AVAILABLE' });
    expect(getCredentialSpy).not.toHaveBeenCalled();
  });

  it('fails NO_MODEL_AVAILABLE when the persisted chain is fully filtered by absent credentials', async () => {
    const settings = new SettingsStub();
    await writeModelChain(settings, [{ providerId: 'openai', modelId: 'gpt-4o-mini' }]);
    const crypto = new CryptographyStub(true);
    const vault = new VaultStub();

    const result = await resolveChainForRequest({ userSettingsPort: settings, cryptographyPort: crypto, vaultPort: vault });

    expect(result).toEqual({ kind: 'failed', code: 'NO_MODEL_AVAILABLE' });
  });

  it('fails VAULT_LOCKED instead when the filtering was caused by a locked vault', async () => {
    const settings = new SettingsStub();
    await writeModelChain(settings, [{ providerId: 'openai', modelId: 'gpt-4o-mini' }]);
    const crypto = new CryptographyStub(false);
    const vault = new VaultStub();
    vault.set('openai', 'sk-live-real-key');

    const result = await resolveChainForRequest({ userSettingsPort: settings, cryptographyPort: crypto, vaultPort: vault });

    expect(result).toEqual({ kind: 'failed', code: 'VAULT_LOCKED' });
  });

  it('resolves ready with the filtered, credentialed entries and an execution profile', async () => {
    const settings = new SettingsStub();
    await writeModelChain(settings, [{ providerId: 'ollama', modelId: 'llama3.1', contextWindow: 8192 }]);
    const crypto = new CryptographyStub(true);
    const vault = new VaultStub();

    const result = await resolveChainForRequest({ userSettingsPort: settings, cryptographyPort: crypto, vaultPort: vault });

    expect(result.kind).toBe('ready');
    if (result.kind === 'ready') {
      expect(result.entries).toEqual([{ providerId: 'ollama', modelId: 'llama3.1', contextWindow: 8192 }]);
      expect(result.executionProfile.runProfile).toBe('local');
    }
  });

  it('fails NO_MODEL_AVAILABLE, without throwing, when the stored chain no longer validates', async () => {
    const settings = new SettingsStub();
    await settings.setSetting(MODEL_CHAIN_SETTINGS_KEY, JSON.stringify([{ providerId: 'ollama' }]));

    const result = await resolveChainForRequest({
      userSettingsPort: settings,
      cryptographyPort: new CryptographyStub(true),
      vaultPort: new VaultStub(),
    });

    expect(result).toEqual({ kind: 'failed', code: 'NO_MODEL_AVAILABLE' });
  });

  it('keeps a legacy cloud-suffixed ollama entry that was saved with a contextWindow, as a metered daemon entry', async () => {
    const settings = new SettingsStub();
    await settings.setSetting(
      MODEL_CHAIN_SETTINGS_KEY,
      JSON.stringify([{ providerId: 'ollama', modelId: 'gpt-oss:120b-cloud', contextWindow: 8192 }]),
    );

    const result = await resolveChainForRequest({
      userSettingsPort: settings,
      cryptographyPort: new CryptographyStub(true),
      vaultPort: new VaultStub(),
    });

    expect(result.kind).toBe('ready');
    if (result.kind === 'ready') {
      expect(result.entries).toEqual([{ providerId: 'ollama', modelId: 'gpt-oss:120b-cloud' }]);
      expect(result.executionProfile.runProfile).toBe('metered');
    }
  });
});
