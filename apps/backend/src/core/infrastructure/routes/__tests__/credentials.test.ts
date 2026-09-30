import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { AI_PROVIDER_IDS as SHARED_AI_PROVIDER_IDS } from '@kryptofolio/shared-types';
import { NodeSqliteAdapter } from '@kryptofolio/database';
import credentialsApi from '../credentials.js';
import { container } from '../../di/container.js';
import { StoreServiceCredentialUseCase } from '../../../application/use-cases/vault/StoreServiceCredentialUseCase.js';
import { AesGcmCryptographyAdapter } from '../../adapters/AesGcmCryptographyAdapter.js';
import { SqliteVaultPortAdapter } from '../../adapters/SqliteVaultPortAdapter.js';

vi.mock('../../di/container', async () => {
  const { GetAvailableProvidersUseCase } = await import(
    '../../../application/use-cases/vault/GetAvailableProvidersUseCase.js'
  );
  return {
    container: {
      unlockVaultUseCase: { execute: vi.fn() },
      getVaultStatusUseCase: { execute: vi.fn() },
      getAvailableProvidersUseCase: new GetAvailableProvidersUseCase(),
      storeServiceCredentialUseCase: { execute: vi.fn() },
      toggleVaultProviderUseCase: { execute: vi.fn() },
    },
  };
});

const AI_PROVIDER_IDS = ['openai', 'anthropic', 'google', 'opencode', 'ollama', 'ollama-cloud'];

describe('Credentials API — vault registry (AI providers)', () => {
  const app = new Hono().route('/api/credentials', credentialsApi);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers exactly the six Phase 0 AI providers', async () => {
    const res = await app.request('/api/credentials/vault/providers');
    const providers = (await res.json()) as Array<{ id: string; category: { kind: string } }>;

    const aiProviders = providers.filter((p) => p.category.kind === 'ai-model');
    expect(aiProviders.map((p) => p.id).sort()).toEqual([...AI_PROVIDER_IDS].sort());
  });

  it('accepts an AI provider id through the existing encrypted credentials path', async () => {
    const res = await app.request('/api/credentials/vault/openai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload: { apiKey: 'sk-test-key' } }),
    });

    expect(res.status).toBe(200);
    expect(container.storeServiceCredentialUseCase.execute).toHaveBeenCalledWith('openai', {
      apiKey: 'sk-test-key',
    });
  });

  it('still rejects an unregistered AI id with UNKNOWN_PROVIDER', async () => {
    const res = await app.request('/api/credentials/vault/not-a-real-ai-provider', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload: { apiKey: 'sk-test-key' } }),
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ success: false, error: 'UNKNOWN_PROVIDER' });
  });

  it('filtering the registry on category.kind === "ai-model" matches no exchange or market-data provider', async () => {
    const res = await app.request('/api/credentials/vault/providers');
    const providers = (await res.json()) as Array<{ id: string; category: { kind: string } }>;

    const aiProviderIds = new Set(
      providers.filter((p) => p.category.kind === 'ai-model').map((p) => p.id),
    );
    const nonAiProviders = providers.filter((p) => p.category.kind !== 'ai-model');

    expect(nonAiProviders.every((p) => !aiProviderIds.has(p.id))).toBe(true);
    expect(nonAiProviders.length).toBeGreaterThan(0);
  });

  it('registers exactly the shared-types AI_PROVIDER_IDS set — a provider can never be selectable in a chain yet unable to hold a credential', async () => {
    const res = await app.request('/api/credentials/vault/providers');
    const providers = (await res.json()) as Array<{ id: string; category: { kind: string } }>;

    const registryAiIds = providers
      .filter((p) => p.category.kind === 'ai-model')
      .map((p) => p.id)
      .sort();

    expect(registryAiIds).toEqual([...SHARED_AI_PROVIDER_IDS].sort());
  });
  describe('through the real encrypted vault path', () => {
    const API_KEY = 'sk-plaintext-marker-7f3a';
    let db: NodeSqliteAdapter;
    let cryptography: AesGcmCryptographyAdapter;

    async function schemaSnapshot(): Promise<string[]> {
      const rows = await db.queryMany<{ name: string; sql: string }>(
        "SELECT name, sql FROM sqlite_master WHERE type = 'table' ORDER BY name",
      );
      return rows.map((r) => `${r.name}:${r.sql}`);
    }

    beforeEach(async () => {
      db = new NodeSqliteAdapter();
      await db.initialize();
      cryptography = new AesGcmCryptographyAdapter();
      await cryptography.initialize(Buffer.alloc(32, 7));
      const store = new StoreServiceCredentialUseCase(cryptography, new SqliteVaultPortAdapter(db));
      vi.mocked(container.storeServiceCredentialUseCase.execute).mockImplementation((service, payload) =>
        store.execute(service, payload),
      );
    });

    it('stores an AI provider key encrypted in system_credentials under its service_identifier, without altering the schema', async () => {
      const schemaBefore = await schemaSnapshot();

      const res = await app.request('/api/credentials/vault/openai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload: { apiKey: API_KEY } }),
      });
      expect(res.status).toBe(200);

      const rows = await db.queryMany<{
        service_identifier: string;
        ciphertext: Uint8Array;
        initialization_vector: Uint8Array;
        authentication_tag: Uint8Array;
      }>('SELECT service_identifier, ciphertext, initialization_vector, authentication_tag FROM system_credentials');
      expect(rows.map((r) => r.service_identifier)).toEqual(['openai']);

      const [row] = rows;
      const stored = Buffer.from(row?.ciphertext ?? []);
      expect(stored.length).toBeGreaterThan(0);
      expect(stored.toString('utf8')).not.toContain(API_KEY);

      const decrypted = await cryptography.decrypt({
        ciphertext: stored,
        iv: Buffer.from(row?.initialization_vector ?? []),
        authTag: Buffer.from(row?.authentication_tag ?? []),
      });
      expect(JSON.parse(decrypted.toString('utf8'))).toEqual({ apiKey: API_KEY });

      expect(await schemaSnapshot()).toEqual(schemaBefore);
    });
  });
});
