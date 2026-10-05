import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Memory } from '@mastra/memory';
import { LibSQLStore } from '@mastra/libsql';
import { MastraLanguageModelV2Mock } from '@mastra/core/test-utils/llm-mock';
import type { IUserSettingsPort } from '../../../domain/ports/IUserSettingsPort.js';
import type { ICryptographyPort, EncryptedArtifact } from '../../../domain/ports/ICryptographyPort.js';
import type { IVaultCredentialsPort } from '../../../domain/ports/IVaultCredentialsPort.js';
import type { AdvisorEvent } from '../../../domain/models/AdvisorEvent.js';
import type { AdvisorRequest } from '../../../domain/models/AdvisorRequest.js';
import type { ToolUseCases } from '../tools/index.js';
import { writeModelChain } from '../models/resolveModelChain.js';
import { bffLogger } from '../../../utils/logger.js';
import { toWireEvent } from '../../dtos/advisor.js';
import { propertyInitializers } from './support/advisorSourceScan.js';

/**
 * Substitutes the real `ollama-ai-provider-v2` package — the same technique
 * `buildModelChainConfig.spec.ts` already uses — so a local `ollama` chain entry resolves
 * to a scripted `MastraLanguageModelV2Mock` instead of a real network-bound provider. Every test in
 * this file uses local entries exclusively: they never touch the vault, so the adapter's real
 * behaviour is exercised without any credential plumbing.
 */
const modelsByModelId = new Map<string, MastraLanguageModelV2Mock>();
const ollamaFactory = vi.fn((modelId: string) => {
  const model = modelsByModelId.get(modelId);
  if (!model) throw new Error(`no scripted model registered for modelId "${modelId}"`);
  return model;
});
const createOllamaMock = vi.fn(() => ollamaFactory);

vi.mock('ollama-ai-provider-v2', () => ({ createOllama: createOllamaMock }));

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
  return {
    portfolioSummary: { execute: notUsed },
    fiscalIntegrity: { execute: notUsed },
    tokenHistory: { execute: notUsed },
    assetAllocation: { execute: notUsed },
    riskMetrics: { execute: notUsed },
    kpis: { execute: notUsed },
    drawdownCurve: { execute: notUsed },
    performanceHistory: { execute: notUsed },
    volatilityHeatmap: { execute: notUsed },
    spanishTaxReport: { execute: notUsed },
    priceHistory: { getLatest: notUsed, getTrackedSymbols: notUsed },
    fiscalIntegrityRows: { execute: notUsed },
    tokenLots: { execute: notUsed },
    txSearch: { execute: notUsed },
    portfolioScenario: { positionValue: notUsed, breakeven: notUsed, portfolioShock: notUsed, concentration: notUsed },
    custodyLocations: { execute: notUsed },
    derivativesPnl: { execute: notUsed },
    taxYearComparison: { execute: notUsed },
    listAccounts: { execute: notUsed },
    holdingDetail: { execute: notUsed },
  };
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

function failingModel(modelId: string, message = 'simulated 500'): MastraLanguageModelV2Mock {
  return new MastraLanguageModelV2Mock({
    provider: 'ollama',
    modelId,
    doStream: async () => {
      throw Object.assign(new Error(message), { statusCode: 500 });
    },
  });
}

async function setLocalChain(settings: SettingsStub, modelId: string, contextWindow = 8192): Promise<void> {
  await writeModelChain(settings, [{ providerId: 'ollama', modelId, contextWindow }]);
}

async function collect(iterable: AsyncIterable<AdvisorEvent>): Promise<AdvisorEvent[]> {
  const events: AdvisorEvent[] = [];
  for await (const event of iterable) events.push(event);
  return events;
}

const baseRequest: AdvisorRequest = { message: 'hello', locale: 'en', baseCurrency: 'EUR' };

describe('MastraAdvisorAdapter', () => {
  let settings: SettingsStub;

  beforeEach(() => {
    settings = new SettingsStub();
    modelsByModelId.clear();
  });

  function buildAdapter(memory?: Memory) {
    return new MastraAdvisorAdapter({
      userSettingsPort: settings,
      cryptographyPort: new UnusedCryptographyPort(),
      vaultPort: new UnusedVaultPort(),
      toolUseCases: buildStubToolUseCases(),
      memory: memory ?? new Memory({ storage: new LibSQLStore({ id: `mem-${Math.random()}`, url: ':memory:' }) }),
    });
  }

  describe('an unresolved or fully-filtered model chain never reaches Mastra', () => {
    it('yields failed / NO_MODEL_AVAILABLE when no chain has ever been configured', async () => {
      const adapter = buildAdapter();

      const events = await collect(adapter.ask(baseRequest));

      expect(events).toEqual([
        {
          kind: 'failed',
          runId: expect.any(String),
          code: 'NO_MODEL_AVAILABLE',
          receipt: expect.objectContaining({ kind: 'pre-run', toolsCalled: [] }),
        },
      ]);
      const [event] = events;
      if (event?.kind !== 'failed') throw new Error('expected a failed event');
      expect(event.receipt).not.toHaveProperty('executionProfile');
      expect(event.receipt).not.toHaveProperty('stepsUsed');
      expect(event.receipt).not.toHaveProperty('maxSteps');
      expect(createOllamaMock).not.toHaveBeenCalled();
    });
  });

  describe('a normal completion streamed as the async generator over Agent.stream(...).fullStream', () => {
    it('streams tokens then a completed terminal event carrying a populated receipt', async () => {
      modelsByModelId.set('local-model', textOnlyModel('Your biggest position is `BTC`.'));
      await setLocalChain(settings, 'local-model');
      const adapter = buildAdapter();

      const events = await collect(adapter.ask(baseRequest));

      const terminal = events.at(-1);
      expect(events.slice(0, -1).every((event) => event.kind === 'token')).toBe(true);
      expect(terminal?.kind).toBe('completed');
      if (terminal?.kind !== 'completed') throw new Error('expected a completed terminal event');
      expect(terminal.receipt.providerId).toBe('ollama');
      expect(terminal.receipt.modelId).toBe('local-model');
      expect(terminal.receipt.executionProfile).toBe('local');
      expect(terminal.receipt.usage).toEqual({ inputTokens: 4, outputTokens: 6 });
    });
  });

  describe('conversation memory', () => {
    it('a follow-up on the same threadId sees the prior turn, reported thread id round-trips', async () => {
      const memory = new Memory({ storage: new LibSQLStore({ id: 'mem-continuity', url: ':memory:' }) });
      modelsByModelId.set('local-model', textOnlyModel('first answer'));
      await setLocalChain(settings, 'local-model');
      const adapter = buildAdapter(memory);

      const firstRun = await collect(adapter.ask({ ...baseRequest, message: 'remember the number 42' }));
      const firstTerminal = firstRun.at(-1);
      if (firstTerminal?.kind !== 'completed') throw new Error('expected first run to complete');
      const threadId = firstTerminal.receipt.threadId;
      expect(threadId).toEqual(expect.any(String));

      modelsByModelId.set('local-model', textOnlyModel('second answer'));
      const secondRun = await collect(adapter.ask({ ...baseRequest, threadId, message: 'what number?' }));
      const secondTerminal = secondRun.at(-1);
      if (secondTerminal?.kind !== 'completed') throw new Error('expected second run to complete');

      expect(secondTerminal.receipt.threadId).toBe(threadId);
      const savedThread = await memory.getThreadById({ threadId });
      expect(savedThread).not.toBeNull();
      const { messages } = await memory.getContext({ threadId, resourceId: 'local' });
      expect(JSON.stringify(messages)).toContain('remember the number 42');
    });

    it('two different threadId values are isolated from each other', async () => {
      const memory = new Memory({ storage: new LibSQLStore({ id: 'mem-isolation', url: ':memory:' }) });
      modelsByModelId.set('local-model', textOnlyModel('answer'));
      await setLocalChain(settings, 'local-model');
      const adapter = buildAdapter(memory);

      const first = await collect(adapter.ask({ ...baseRequest, threadId: 'thread-a', message: 'a-only secret' }));
      const second = await collect(adapter.ask({ ...baseRequest, threadId: 'thread-b', message: 'b-only secret' }));

      const firstTerminal = first.at(-1);
      const secondTerminal = second.at(-1);
      if (firstTerminal?.kind !== 'completed' || secondTerminal?.kind !== 'completed') {
        throw new Error('expected both runs to complete');
      }
      expect(firstTerminal.receipt.threadId).toBe('thread-a');
      expect(secondTerminal.receipt.threadId).toBe('thread-b');

      const { messages: threadAMessages } = await memory.getContext({ threadId: 'thread-a', resourceId: 'local' });
      const threadAText = JSON.stringify(threadAMessages);
      expect(threadAText).toContain('a-only secret');
      expect(threadAText).not.toContain('b-only secret');
    });

    it('a request omitting threadId gets a thread created, reported in the terminal event', async () => {
      modelsByModelId.set('local-model', textOnlyModel('answer'));
      await setLocalChain(settings, 'local-model');
      const adapter = buildAdapter();

      const events = await collect(adapter.ask(baseRequest));
      const terminal = events.at(-1);

      if (terminal?.kind !== 'completed') throw new Error('expected a completed event');
      expect(typeof terminal.receipt.threadId).toBe('string');
      expect(terminal.receipt.threadId.length).toBeGreaterThan(0);
    });

    /**
     * A real, running Mastra `Agent` does not expose which internal method it used to apply a
     * per-call `memory.options` (its own `getContext`/`rememberMessages`/store-query internals are
     * not spy-able from outside without reaching into private implementation details), so this
     * asserts on the adapter's source text instead of the runtime behaviour it can't observe
     * directly. This is forward-provisioning honesty, not a weaker requirement: the
     * *behavioural* claims (continuity, isolation, auto-created thread id) are proven at runtime by
     * the three tests above; this one confirms the adapter's own call site sets the options that
     * make those claims true.
     */
    it('the adapter\'s own per-call site sets semanticRecall/workingMemory off and lastMessages from the resolved profile', async () => {
      const { readFileSync } = await import('node:fs');
      const source = readFileSync(new URL('../MastraAdvisorAdapter.ts', import.meta.url), 'utf8');

      expect(source).toContain('semanticRecall: false');
      expect(source).toContain('workingMemory: { enabled: false }');
      expect(source).toContain('lastMessages: executionProfile.settings.lastMessages');
      expect(source).not.toMatch(/embedder|vector/i);
    });
  });

  describe('tool page sizes are wired from the resolved execution profile', () => {
    it('every page-size config the adapter builds reads the resolved profile, never a literal', async () => {
      const { readFileSync } = await import('node:fs');
      const source = readFileSync(new URL('../MastraAdvisorAdapter.ts', import.meta.url), 'utf8');

      expect(propertyInitializers(source, 'lotsPageSize')).toEqual([
        'profile.settings.lotsPageSize',
        'profile.settings.lotsPageSize',
      ]);
      expect(propertyInitializers(source, 'rowsPageSize')).toEqual([
        'profile.settings.rowsPageSize',
        'profile.settings.rowsPageSize',
      ]);
    });

    it('the initializer scan reports a literal page size', () => {
      expect(propertyInitializers('const c = { rowsPageSize: 25, other: { rowsPageSize: profile.x } };', 'rowsPageSize')).toEqual([
        '25',
        'profile.x',
      ]);
    });
  });

  describe('cancellation tears down the underlying model call', () => {
    it('a consumer that breaks out of for-await runs the finally teardown and aborts the call', async () => {
      let capturedSignal: AbortSignal | undefined;
      const model = new MastraLanguageModelV2Mock({
        provider: 'ollama',
        modelId: 'local-model',
        doStream: async (options) => {
          capturedSignal = options.abortSignal;
          return {
            stream: new ReadableStream({
              start(controller) {
                controller.enqueue({ type: 'stream-start', warnings: [] });
                controller.enqueue({ type: 'text-start', id: 't1' });
                controller.enqueue({ type: 'text-delta', id: 't1', delta: 'partial' });
                // Deliberately never closes/finishes — the consumer is the one that stops.
              },
            }),
          };
        },
      });
      modelsByModelId.set('local-model', model);
      await setLocalChain(settings, 'local-model');
      const adapter = buildAdapter();

      for await (const event of adapter.ask(baseRequest)) {
        if (event.kind === 'token') break;
      }

      expect(capturedSignal).toBeDefined();
      expect(capturedSignal?.aborted).toBe(true);
    });
  });

  describe('a retryable failure advances the chain', () => {
    it('an earlier entry answering 429 until its retries are exhausted hands the run to the next entry, whose provider and model the completed receipt names', async () => {
      let rateLimitedCalls = 0;
      modelsByModelId.set(
        'model-a',
        new MastraLanguageModelV2Mock({
          provider: 'ollama',
          modelId: 'model-a',
          doStream: async () => {
            rateLimitedCalls += 1;
            throw Object.assign(new Error('rate limited'), {
              name: 'AI_APICallError',
              statusCode: 429,
              isRetryable: true,
            });
          },
        }),
      );
      modelsByModelId.set('model-b', textOnlyModel('answer from the second entry', 'model-b'));
      await writeModelChain(settings, [
        { providerId: 'ollama', modelId: 'model-a', contextWindow: 8192 },
        { providerId: 'ollama', modelId: 'model-b', contextWindow: 8192 },
      ]);

      const events = await collect(buildAdapter().ask(baseRequest));

      expect(rateLimitedCalls).toBeGreaterThan(1);
      const terminal = events.at(-1);
      if (terminal?.kind !== 'completed') throw new Error('expected a completed terminal event');
      expect(terminal.receipt.providerId).toBe('ollama');
      expect(terminal.receipt.modelId).toBe('model-b');
      expect(events.some((event) => event.kind === 'failed')).toBe(false);
      expect(events.filter((event) => event.kind === 'token').map((t) => (t.kind === 'token' ? t.text : ''))).toEqual([
        'answer from the second entry',
      ]);
    });
  });

  describe('total provider failure', () => {
    it('every entry exhausting retries yields failed / ALL_PROVIDERS_FAILED, never completed', async () => {
      modelsByModelId.set('model-a', failingModel('model-a'));
      modelsByModelId.set('model-b', failingModel('model-b'));
      await writeModelChain(settings, [
        { providerId: 'ollama', modelId: 'model-a', contextWindow: 8192 },
        { providerId: 'ollama', modelId: 'model-b', contextWindow: 8192 },
      ]);
      const adapter = buildAdapter();

      const events = await collect(adapter.ask(baseRequest));

      expect(events.some((event) => event.kind === 'completed')).toBe(false);
      const terminal = events.at(-1);
      expect(terminal?.kind).toBe('failed');
      if (terminal?.kind !== 'failed') throw new Error('expected a failed terminal event');
      expect(terminal.code).toBe('ALL_PROVIDERS_FAILED');
    });

    describe('the cause of the failure', () => {
      const SECRET_TEXT = 'Bearer sk-live-SuperSecretValue000 rejected for https://internal.example.com/v1/chat';

      function rejectingModel(modelId: string, statusCode: number): MastraLanguageModelV2Mock {
        return new MastraLanguageModelV2Mock({
          provider: 'ollama',
          modelId,
          doStream: async () => {
            throw Object.assign(new Error(SECRET_TEXT), {
              name: 'AI_APICallError',
              statusCode,
              isRetryable: false,
              url: 'https://internal.example.com/v1/chat',
              responseHeaders: { 'set-cookie': 'session=top-secret-cookie' },
              requestBodyValues: { messages: ['private question'] },
            });
          },
        });
      }

      it('a 401 from the last chain entry yields auth-rejected naming that provider and model', async () => {
        modelsByModelId.set('model-a', failingModel('model-a'));
        modelsByModelId.set('model-b', rejectingModel('model-b', 401));
        await writeModelChain(settings, [
          { providerId: 'ollama', modelId: 'model-a', contextWindow: 8192 },
          { providerId: 'ollama', modelId: 'model-b', contextWindow: 8192 },
        ]);

        const events = await collect(buildAdapter().ask(baseRequest));

        const terminal = events.at(-1);
        if (terminal?.kind !== 'failed' || terminal.code !== 'ALL_PROVIDERS_FAILED') {
          throw new Error('expected an ALL_PROVIDERS_FAILED terminal event');
        }
        expect(terminal.cause).toEqual({ kind: 'auth-rejected', providerId: 'ollama', modelId: 'model-b' });
      });

      it('no provider error text, URL, header or request body reaches the wire frame', async () => {
        modelsByModelId.set('model-b', rejectingModel('model-b', 401));
        await setLocalChain(settings, 'model-b');

        const events = await collect(buildAdapter().ask(baseRequest));

        const terminal = events.at(-1);
        if (terminal === undefined) throw new Error('expected a terminal event');
        const frame = JSON.stringify(toWireEvent(terminal));
        for (const leaked of ['SuperSecretValue', 'internal.example.com', 'top-secret-cookie', 'private question', 'Bearer']) {
          expect(frame).not.toContain(leaked);
        }
      });

      it('logs one line per failed run with provider, model, kind and status, and no secret-bearing text', async () => {
        const warn = vi.spyOn(bffLogger, 'warn').mockImplementation(() => undefined);
        try {
          modelsByModelId.set('model-b', rejectingModel('model-b', 401));
          await setLocalChain(settings, 'model-b');

          await collect(buildAdapter().ask(baseRequest));

          expect(warn).toHaveBeenCalledTimes(1);
          const [fields] = warn.mock.calls[0] ?? [];
          expect(fields).toMatchObject({
            providerId: 'ollama',
            modelId: 'model-b',
            kind: 'auth-rejected',
            statusCode: 401,
          });
          const logged = JSON.stringify(warn.mock.calls);
          for (const leaked of ['SuperSecretValue', 'internal.example.com', 'top-secret-cookie', 'private question']) {
            expect(logged).not.toContain(leaked);
          }
        } finally {
          warn.mockRestore();
        }
      });

      it('a failure before any model is tried keeps its own code and logs no provider failure', async () => {
        const warn = vi.spyOn(bffLogger, 'warn').mockImplementation(() => undefined);
        try {
          const events = await collect(buildAdapter().ask(baseRequest));

          const terminal = events.at(-1);
          if (terminal?.kind !== 'failed') throw new Error('expected a failed event');
          expect(terminal.code).toBe('NO_MODEL_AVAILABLE');
          expect(terminal).not.toHaveProperty('cause');
          expect(warn).not.toHaveBeenCalled();
        } finally {
          warn.mockRestore();
        }
      });
    });

    it('tokens already streamed by an earlier step are preserved with the failure appended', async () => {
      let call = 0;
      const model = new MastraLanguageModelV2Mock({
        provider: 'ollama',
        modelId: 'flaky-model',
        doStream: async () => {
          call += 1;
          if (call === 1) {
            return {
              stream: new ReadableStream({
                start(controller) {
                  controller.enqueue({ type: 'stream-start', warnings: [] });
                  controller.enqueue({ type: 'text-start', id: 't1' });
                  controller.enqueue({ type: 'text-delta', id: 't1', delta: 'partial answer' });
                  controller.enqueue({ type: 'text-end', id: 't1' });
                  controller.enqueue({
                    type: 'finish',
                    finishReason: 'error',
                    usage: { inputTokens: 2, outputTokens: 3, totalTokens: 5 },
                  });
                  controller.close();
                },
              }),
            };
          }
          throw new Error('unexpected extra call');
        },
      });
      modelsByModelId.set('flaky-model', model);
      await setLocalChain(settings, 'flaky-model');
      const adapter = buildAdapter();

      const events = await collect(adapter.ask(baseRequest));

      const tokens = events.filter((event) => event.kind === 'token');
      expect(tokens.map((t) => (t.kind === 'token' ? t.text : ''))).toEqual(['partial answer']);
      const terminal = events.at(-1);
      expect(terminal?.kind).toBe('failed');
    });
  });
});
