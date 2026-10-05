import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Memory } from '@mastra/memory';
import { LibSQLStore } from '@mastra/libsql';
import { MastraLanguageModelV2Mock } from '@mastra/core/test-utils/llm-mock';
import { ADVISOR_TOOL_NAMES, ADVISOR_TOOL_TIERS } from '@kryptofolio/shared-types';
import type { IUserSettingsPort } from '../../../domain/ports/IUserSettingsPort.js';
import type { ICryptographyPort, EncryptedArtifact } from '../../../domain/ports/ICryptographyPort.js';
import type { IVaultCredentialsPort } from '../../../domain/ports/IVaultCredentialsPort.js';
import type { AdvisorRequest } from '../../../domain/models/AdvisorRequest.js';
import type { ToolUseCases } from '../tools/index.js';
import { writeModelChain } from '../models/resolveModelChain.js';

const modelsByModelId = new Map<string, MastraLanguageModelV2Mock>();
const ollamaFactory = vi.fn((modelId: string) => {
  const model = modelsByModelId.get(modelId);
  if (!model) throw new Error(`no scripted model registered for modelId "${modelId}"`);
  return model;
});
vi.mock('ollama-ai-provider-v2', () => ({ createOllama: vi.fn(() => ollamaFactory) }));

const buildTaxAnalystAgentSpy = vi.hoisted(() => vi.fn());
vi.mock('../agents/taxAnalyst.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../agents/taxAnalyst.js')>();
  buildTaxAnalystAgentSpy.mockImplementation(original.buildTaxAnalystAgent);
  return { ...original, buildTaxAnalystAgent: buildTaxAnalystAgentSpy };
});

const { MastraAdvisorAdapter } = await import('../MastraAdvisorAdapter.js');

class SettingsStub implements IUserSettingsPort {
  private readonly values = new Map<string, string>();

  async getSetting(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async setSetting(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }
}

/** Never actually invoked by any test here — every chain entry is a local `ollama` one, and
 * local entries never touch the vault — throwing loudly turns an accidental vault call into a test
 * failure with a clear cause, instead of a confusing downstream one. */
class UnusedCryptographyPort implements ICryptographyPort {
  async initialize(): Promise<void> {
    throw new Error('not used in this test');
  }
  isUnlocked(): boolean {
    return true;
  }
  lock(): void {}
  async encrypt(): Promise<EncryptedArtifact> {
    throw new Error('not used in this test');
  }
  async decrypt(): Promise<Buffer> {
    throw new Error('not used in this test');
  }
}

class UnusedVaultPort implements IVaultCredentialsPort {
  async getConfiguredServices(): Promise<string[]> {
    throw new Error('not used in this test');
  }
  async getEnabledServices(): Promise<string[]> {
    throw new Error('not used in this test');
  }
  async setServiceEnabled(): Promise<void> {
    throw new Error('not used in this test');
  }
  async saveCredential(): Promise<void> {
    throw new Error('not used in this test');
  }
  async getCredential(): Promise<EncryptedArtifact | null> {
    throw new Error('a local ollama entry must never contact the vault');
  }
  async getMetadata(): Promise<Buffer | null> {
    throw new Error('not used in this test');
  }
  async setMetadata(): Promise<void> {
    throw new Error('not used in this test');
  }
}

const notUsed = async (): Promise<never> => {
  throw new Error('tool use case not exercised in this test');
};

function buildStubToolUseCases(): ToolUseCases {
  const unused = { execute: notUsed };
  return new Proxy({} as ToolUseCases, { get: () => unused });
}

function textOnlyModel(text: string, modelId = 'test-local-model'): MastraLanguageModelV2Mock {
  return new MastraLanguageModelV2Mock({
    provider: 'ollama',
    modelId,
    doStream: async () => ({
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue({ type: 'stream-start', warnings: [] });
          controller.enqueue({ type: 'text-start', id: 't1' });
          controller.enqueue({ type: 'text-delta', id: 't1', delta: text });
          controller.enqueue({ type: 'text-end', id: 't1' });
          controller.enqueue({
            type: 'finish',
            finishReason: 'stop',
            usage: { inputTokens: 4, outputTokens: 6, totalTokens: 10 },
          });
          controller.close();
        },
      }),
    }),
  });
}

const request: AdvisorRequest = { message: 'hello', locale: 'en', baseCurrency: 'EUR' };

describe('MastraAdvisorAdapter tool exposure', () => {
  let settings: SettingsStub;

  beforeEach(() => {
    settings = new SettingsStub();
    modelsByModelId.clear();
    buildTaxAnalystAgentSpy.mockClear();
  });

  it('hands taxAnalyst only the core tier when the resolved chain is all local', async () => {
    modelsByModelId.set('local-model', textOnlyModel('ok'));
    await writeModelChain(settings, [{ providerId: 'ollama', modelId: 'local-model', contextWindow: 8192 }]);
    const adapter = new MastraAdvisorAdapter({
      userSettingsPort: settings,
      cryptographyPort: new UnusedCryptographyPort(),
      vaultPort: new UnusedVaultPort(),
      toolUseCases: buildStubToolUseCases(),
      memory: new Memory({ storage: new LibSQLStore({ id: `mem-${Math.random()}`, url: ':memory:' }) }),
    });

    for await (const _event of adapter.ask(request)) void _event;

    const [tools] = buildTaxAnalystAgentSpy.mock.calls[0] ?? [];
    const core = ADVISOR_TOOL_NAMES.filter((name) => ADVISOR_TOOL_TIERS[name] === 'core');
    expect(Object.keys(tools).sort()).toEqual([...core].sort());
  });

  /**
   * An ollama entry with a cloud suffix classifies as metered yet never touches the vault, so a
   * metered and a mixed chain can run through the real adapter with the same doubles as a local one.
   */
  async function exposedToolsFor(chain: Parameters<typeof writeModelChain>[1], runProfile: string) {
    for (const entry of chain) modelsByModelId.set(entry.modelId, textOnlyModel('ok', entry.modelId));
    await writeModelChain(settings, chain);
    const adapter = new MastraAdvisorAdapter({
      userSettingsPort: settings,
      cryptographyPort: new UnusedCryptographyPort(),
      vaultPort: new UnusedVaultPort(),
      toolUseCases: buildStubToolUseCases(),
      memory: new Memory({ storage: new LibSQLStore({ id: `mem-${Math.random()}`, url: ':memory:' }) }),
    });

    const events = [];
    for await (const event of adapter.ask(request)) events.push(event);

    const terminal = events.at(-1);
    if (terminal?.kind !== 'completed') throw new Error('expected a completed run');
    expect(terminal.receipt.executionProfile).toBe(runProfile);
    const [tools, , profile] = buildTaxAnalystAgentSpy.mock.calls[0] ?? [];
    expect(profile).toBe('metered');
    return Object.keys(tools).sort();
  }

  it('hands taxAnalyst every tool when the resolved chain is metered', async () => {
    const exposed = await exposedToolsFor([{ providerId: 'ollama', modelId: 'gpt-oss:120b-cloud' }], 'metered');

    expect(exposed).toEqual([...ADVISOR_TOOL_NAMES].sort());
    expect(exposed).toHaveLength(25);
  });

  it('hands taxAnalyst every tool when the chain mixes a local and a metered entry', async () => {
    const exposed = await exposedToolsFor(
      [
        { providerId: 'ollama', modelId: 'local-model', contextWindow: 8192 },
        { providerId: 'ollama', modelId: 'gpt-oss:120b-cloud' },
      ],
      'mixed',
    );

    expect(exposed).toEqual([...ADVISOR_TOOL_NAMES].sort());
  });
});
