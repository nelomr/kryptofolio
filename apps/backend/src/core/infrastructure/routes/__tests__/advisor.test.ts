import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { defaultExecutionProfiles } from '@kryptofolio/shared-types';
import { createAdvisorApi, type AdvisorRouteDeps } from '../advisor.js';
import { bffLogger } from '../../../utils/logger.js';
import type { AdvisorEvent } from '../../../domain/models/AdvisorEvent.js';
import type { ProfiledAdvisorRunReceipt } from '../../../domain/models/AdvisorRunReceipt.js';
import type { IUserSettingsPort } from '../../../domain/ports/IUserSettingsPort.js';
import type { IVaultCredentialsPort } from '../../../domain/ports/IVaultCredentialsPort.js';
import type { ICryptographyPort } from '../../../domain/ports/ICryptographyPort.js';

const RECEIPT: ProfiledAdvisorRunReceipt = {
  kind: 'profiled',
  runId: 'run-1',
  threadId: 'thread-1',
  startedAt: '2026-01-01T00:00:00.000Z',
  finishedAt: '2026-01-01T00:00:05.000Z',
  providerId: 'openai',
  modelId: 'gpt-5',
  toolsCalled: ['portfolio_summary'],
  usage: { inputTokens: 10, outputTokens: 20 },
  executionProfile: 'metered',
  stepsUsed: 2,
  maxSteps: 5,
};

class SettingsStub implements IUserSettingsPort {
  private readonly values = new Map<string, string>();
  async getSetting(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }
  async setSetting(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }
}

function fakeVaultPort(configured: string[]): IVaultCredentialsPort {
  return {
    getConfiguredServices: async () => configured,
    getEnabledServices: async () => configured,
    setServiceEnabled: async () => undefined,
    saveCredential: async () => undefined,
    getCredential: async () => null,
    getMetadata: async () => null,
    setMetadata: async () => undefined,
  };
}

function fakeCryptoPort(unlocked: boolean): ICryptographyPort {
  return {
    initialize: async () => undefined,
    isUnlocked: () => unlocked,
    lock: () => undefined,
    encrypt: async () => ({ ciphertext: Buffer.alloc(0), iv: Buffer.alloc(0), authTag: Buffer.alloc(0) }),
    decrypt: async () => Buffer.alloc(0),
  };
}

function makeDeps(events: AdvisorEvent[] | (() => AsyncIterable<AdvisorEvent>), overrides?: Partial<AdvisorRouteDeps>) {
  const askAdvisorUC = {
    execute: vi.fn(() => {
      if (typeof events === 'function') return events();
      return (async function* () {
        for (const event of events) yield event;
      })();
    }),
  };
  const deps: AdvisorRouteDeps = {
    askAdvisorUC,
    userSettingsPort: new SettingsStub(),
    vaultCredentialsPort: fakeVaultPort([]),
    cryptographyPort: fakeCryptoPort(true),
    ...overrides,
  };
  return { deps, askAdvisorUC };
}

function readSseFrames(text: string) {
  return text
    .split('\n\n')
    .filter((chunk) => chunk.trim().length > 0)
    .map((chunk) => {
      const isComment = chunk.startsWith(': ');
      const dataLine = chunk.split('\n').find((line) => line.startsWith('data: '));
      return {
        isComment,
        data: dataLine ? JSON.parse(dataLine.slice('data: '.length)) : undefined,
      };
    });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('advisor routes — non-streaming ask', () => {
  it('returns { outcome: completed, text, receipt } for a completed run', async () => {
    const { deps } = makeDeps([
      { kind: 'token', runId: 'run-1', text: 'hello ' },
      { kind: 'token', runId: 'run-1', text: 'world' },
      { kind: 'completed', runId: 'run-1', receipt: RECEIPT, disclaimer: false, figuresIncomplete: false },
    ]);
    const app = new Hono().route('/api/advisor', createAdvisorApi(deps));

    const res = await app.request('/api/advisor/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'hi' }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { outcome: string; text: string; receipt: unknown };
    const { kind: _kind, ...wireReceipt } = RECEIPT;
    expect(body).toEqual({ outcome: 'completed', text: 'hello world', receipt: wireReceipt });
  });

  it('returns { outcome: refused, reason, processorId } with no text on a guardrail trip', async () => {
    const { deps } = makeDeps([
      { kind: 'token', runId: 'run-1', text: 'partial' },
      {
        kind: 'refused',
        runId: 'run-1',
        reason: 'tax evasion request',
        processorId: 'guardrail',
        receipt: RECEIPT,
      },
    ]);
    const app = new Hono().route('/api/advisor', createAdvisorApi(deps));

    const res = await app.request('/api/advisor/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'hi' }),
    });

    const body = await res.json();
    expect(body).toEqual({ outcome: 'refused', reason: 'tax evasion request', processorId: 'guardrail' });
  });

  it('returns { outcome: failed, code: NO_MODEL_AVAILABLE } with no text for an empty chain', async () => {
    const { deps } = makeDeps([{ kind: 'failed', runId: 'run-1', code: 'NO_MODEL_AVAILABLE', receipt: RECEIPT }]);
    const app = new Hono().route('/api/advisor', createAdvisorApi(deps));

    const res = await app.request('/api/advisor/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'hi' }),
    });

    expect(await res.json()).toEqual({ outcome: 'failed', code: 'NO_MODEL_AVAILABLE' });
  });

  it('rejects an empty message before any run starts', async () => {
    const { deps, askAdvisorUC } = makeDeps([]);
    const app = new Hono().route('/api/advisor', createAdvisorApi(deps));

    const res = await app.request('/api/advisor/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: '' }),
    });

    expect(res.status).toBe(400);
    expect(askAdvisorUC.execute).not.toHaveBeenCalled();
  });

  it('rejects a non-UUID threadId before any run starts', async () => {
    const { deps, askAdvisorUC } = makeDeps([]);
    const app = new Hono().route('/api/advisor', createAdvisorApi(deps));

    const res = await app.request('/api/advisor/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'hi', threadId: 'not-a-uuid' }),
    });

    expect(res.status).toBe(400);
    expect(askAdvisorUC.execute).not.toHaveBeenCalled();
  });

  it('rejects a message over 4000 characters before any run starts', async () => {
    const { deps, askAdvisorUC } = makeDeps([]);
    const app = new Hono().route('/api/advisor', createAdvisorApi(deps));

    const res = await app.request('/api/advisor/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'a'.repeat(4001) }),
    });

    expect(res.status).toBe(400);
    expect(askAdvisorUC.execute).not.toHaveBeenCalled();
  });

  it('wraps an unanticipated throw as outcome: failed / INTERNAL_ERROR', async () => {
    const errorLog = vi.spyOn(bffLogger, 'error').mockImplementation(() => undefined);
    const { deps } = makeDeps(async function* () {
      yield { kind: 'token', runId: 'run-1', text: 'x' } as AdvisorEvent;
      throw new Error('boom');
    });
    const app = new Hono().route('/api/advisor', createAdvisorApi(deps));

    const res = await app.request('/api/advisor/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'hi' }),
    });

    expect(await res.json()).toEqual({ outcome: 'failed', code: 'INTERNAL_ERROR' });
    expect(errorLog).toHaveBeenCalledWith(expect.objectContaining({ err: expect.anything() }), 'Advisor ask route failed unexpectedly');
  });
});

describe('advisor routes — SSE stream', () => {
  it('responds with text/event-stream content type', async () => {
    const { deps } = makeDeps([{ kind: 'completed', runId: 'run-1', receipt: RECEIPT, disclaimer: false, figuresIncomplete: false }]);
    const app = new Hono().route('/api/advisor', createAdvisorApi(deps));

    const res = await app.request('/api/advisor/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'hi' }),
    });

    expect(res.headers.get('content-type')).toContain('text/event-stream');
  });

  it('writes a token frame as event: token with a data line parsing to { kind, runId, text }', async () => {
    const { deps } = makeDeps([
      { kind: 'token', runId: 'run-1', text: 'hi' },
      { kind: 'completed', runId: 'run-1', receipt: RECEIPT, disclaimer: false, figuresIncomplete: false },
    ]);
    const app = new Hono().route('/api/advisor', createAdvisorApi(deps));

    const res = await app.request('/api/advisor/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'hi' }),
    });
    const text = await res.text();

    expect(text).toContain('event: token');
    const frames = readSseFrames(text);
    expect(frames[0]?.data).toEqual({ kind: 'token', runId: 'run-1', text: 'hi' });
  });

  it('delivers frames incrementally rather than as one buffered body', async () => {
    let resolveSecond: () => void = () => undefined;
    const secondReady = new Promise<void>((resolve) => {
      resolveSecond = resolve;
    });

    const { deps } = makeDeps(async function* () {
      yield { kind: 'token', runId: 'run-1', text: 'first' } as AdvisorEvent;
      await secondReady;
      yield { kind: 'completed', runId: 'run-1', receipt: RECEIPT, disclaimer: false, figuresIncomplete: false } as AdvisorEvent;
    });
    const app = new Hono().route('/api/advisor', createAdvisorApi(deps));

    const res = await app.request('/api/advisor/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'hi' }),
    });

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let firstChunk = '';
    while (!firstChunk.includes('\n\n')) {
      const { value, done } = await reader.read();
      if (done) break;
      firstChunk += decoder.decode(value, { stream: true });
    }
    expect(firstChunk).toContain('token');
    expect(firstChunk).not.toContain('done');

    resolveSecond();
    await reader.cancel().catch(() => undefined);
  });

  it('emits exactly one terminal frame, last, carrying the full done payload', async () => {
    const { deps } = makeDeps([
      { kind: 'tool-start', runId: 'run-1', callId: 'c1', tool: 'portfolio_summary' },
      { kind: 'tool-result', runId: 'run-1', callId: 'c1', tool: 'portfolio_summary' },
      { kind: 'token', runId: 'run-1', text: 'hi' },
      { kind: 'completed', runId: 'run-1', receipt: RECEIPT, disclaimer: false, figuresIncomplete: false },
    ]);
    const app = new Hono().route('/api/advisor', createAdvisorApi(deps));

    const res = await app.request('/api/advisor/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'hi' }),
    });
    const frames = readSseFrames(await res.text()).filter((f) => !f.isComment);
    const terminalIndexes = frames
      .map((f, i) => ({ i, kind: (f.data as { kind: string }).kind }))
      .filter((f) => ['done', 'refused', 'failed'].includes(f.kind));

    expect(terminalIndexes).toHaveLength(1);
    expect(terminalIndexes[0]?.i).toBe(frames.length - 1);
    expect(frames.at(-1)?.data).toEqual({
      kind: 'done',
      runId: 'run-1',
      threadId: 'thread-1',
      providerId: 'openai',
      modelId: 'gpt-5',
      usage: { inputTokens: 10, outputTokens: 20 },
      toolsCalled: ['portfolio_summary'],
      executionProfile: 'metered',
      stepsUsed: 2,
      maxSteps: 5,
      disclaimer: false,
      figuresIncomplete: false,
    });
  });

  it('streams the disclaimer and incomplete-figures flags of a completed run on the done frame', async () => {
    const { deps } = makeDeps([
      { kind: 'completed', runId: 'run-1', receipt: RECEIPT, disclaimer: true, figuresIncomplete: true },
    ]);
    const app = new Hono().route('/api/advisor', createAdvisorApi(deps));

    const res = await app.request('/api/advisor/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'hi' }),
    });
    const frames = readSseFrames(await res.text()).filter((f) => !f.isComment);

    expect(frames.at(-1)?.data).toMatchObject({ kind: 'done', disclaimer: true, figuresIncomplete: true });
  });

  it('emits refused with no done frame on a guardrail trip', async () => {
    const { deps } = makeDeps([
      {
        kind: 'refused',
        runId: 'run-1',
        reason: 'tax evasion request',
        processorId: 'guardrail',
        receipt: RECEIPT,
      },
    ]);
    const app = new Hono().route('/api/advisor', createAdvisorApi(deps));

    const res = await app.request('/api/advisor/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'hi' }),
    });
    const frames = readSseFrames(await res.text()).filter((f) => !f.isComment);

    expect(frames).toHaveLength(1);
    expect(frames[0]?.data).toMatchObject({ kind: 'refused' });
  });

  it('writes failed/INTERNAL_ERROR before closing on an unanticipated adapter throw', async () => {
    const errorLog = vi.spyOn(bffLogger, 'error').mockImplementation(() => undefined);
    const { deps } = makeDeps(async function* () {
      yield { kind: 'token', runId: 'run-1', text: 'x' } as AdvisorEvent;
      throw new Error('boom');
    });
    const app = new Hono().route('/api/advisor', createAdvisorApi(deps));

    const res = await app.request('/api/advisor/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'hi' }),
    });
    const frames = readSseFrames(await res.text()).filter((f) => !f.isComment);

    expect(frames.at(-1)?.data).toEqual({ kind: 'failed', runId: 'unknown', code: 'INTERNAL_ERROR' });
    expect(errorLog).toHaveBeenCalledWith(expect.objectContaining({ err: expect.anything() }), 'Advisor stream route failed unexpectedly');
  });

  it('does not treat a tool-error frame as terminal — the run continues to done', async () => {
    const { deps } = makeDeps([
      { kind: 'tool-error', runId: 'run-1', callId: 'c1', tool: 'portfolio_summary', code: 'USE_CASE_FAILED' },
      { kind: 'completed', runId: 'run-1', receipt: RECEIPT, disclaimer: false, figuresIncomplete: false },
    ]);
    const app = new Hono().route('/api/advisor', createAdvisorApi(deps));

    const res = await app.request('/api/advisor/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'hi' }),
    });
    const frames = readSseFrames(await res.text()).filter((f) => !f.isComment);

    expect(frames.map((f) => (f.data as { kind: string }).kind)).toEqual(['tool-error', 'done']);
  });

  it('every outbound frame is schema-validated before writeSSE — a malformed event surfaces as failed, not a thrown response', async () => {
    const errorLog = vi.spyOn(bffLogger, 'error').mockImplementation(() => undefined);
    const { deps } = makeDeps(async function* () {
      yield { kind: 'token', runId: 'run-1' } as unknown as AdvisorEvent; // missing `text`
    });
    const app = new Hono().route('/api/advisor', createAdvisorApi(deps));

    const res = await app.request('/api/advisor/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'hi' }),
    });
    const frames = readSseFrames(await res.text()).filter((f) => !f.isComment);

    expect(frames.at(-1)?.data).toEqual({ kind: 'failed', runId: 'unknown', code: 'INTERNAL_ERROR' });
    expect(errorLog).toHaveBeenCalledWith(expect.objectContaining({ err: expect.anything() }), 'Advisor stream route failed unexpectedly');
  });
});

describe('advisor routes — SSE keep-alive', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('writes a `: keep-alive` comment line every 15s during a long pause, with no token appended', async () => {
    let releaseGate: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      releaseGate = resolve;
    });

    const { deps } = makeDeps(async function* () {
      yield { kind: 'token', runId: 'run-1', text: 'first' } as AdvisorEvent;
      await gate;
      yield { kind: 'completed', runId: 'run-1', receipt: RECEIPT, disclaimer: false, figuresIncomplete: false } as AdvisorEvent;
    });
    const app = new Hono().route('/api/advisor', createAdvisorApi(deps));

    const resPromise = app.request('/api/advisor/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'hi' }),
    });

    await vi.advanceTimersByTimeAsync(15_000);
    releaseGate();
    const res = await resPromise;
    const text = await res.text();
    const frames = readSseFrames(text);

    expect(frames.some((f) => f.isComment)).toBe(true);
    const tokenFrames = frames.filter((f) => !f.isComment && (f.data as { kind: string })?.kind === 'token');
    expect(tokenFrames).toHaveLength(1);
    expect(tokenFrames[0]?.data).toEqual({ kind: 'token', runId: 'run-1', text: 'first' });
  });
});

describe('advisor routes — disconnect propagation', () => {
  it('stops iterating the port when the request is aborted', async () => {
    const returnSpy = vi.fn(async () => ({ value: undefined, done: true as const }));
    let neverResolve: () => void = () => undefined;
    const never = new Promise<void>((resolve) => {
      neverResolve = resolve;
    });
    void neverResolve;

    const iterable: AsyncIterable<AdvisorEvent> = {
      [Symbol.asyncIterator]() {
        return {
          next: async () => {
            await never;
            return { value: undefined, done: true };
          },
          return: returnSpy,
        };
      },
    };
    const { deps } = makeDeps(() => iterable);
    const app = new Hono().route('/api/advisor', createAdvisorApi(deps));

    const res = await app.request('/api/advisor/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'hi' }),
    });

    // Simulates the real disconnect path: the client's reader is cancelled (an aborted fetch),
    // which is exactly what `stream.responseReadable`'s own `cancel` hook wires to `stream.abort()`.
    await res.body!.cancel();
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(returnSpy).toHaveBeenCalled();
  });
});

describe('advisor routes — config', () => {
  it('returns a credential state discriminated union, never hasKey: boolean, no key material', async () => {
    const { deps } = makeDeps([], {
      vaultCredentialsPort: fakeVaultPort(['openai']),
      cryptographyPort: fakeCryptoPort(true),
    });
    const app = new Hono().route('/api/advisor', createAdvisorApi(deps));

    const res = await app.request('/api/advisor/config');
    const body = (await res.json()) as { providers: Array<{ id: string; credential: { kind: string } }> };

    const openai = body.providers.find((p) => p.id === 'openai');
    expect(openai?.credential).toEqual({ kind: 'present' });
    const anthropic = body.providers.find((p) => p.id === 'anthropic');
    expect(anthropic?.credential).toEqual({ kind: 'absent' });
    expect(JSON.stringify(body)).not.toMatch(/apiKey|cipher|prefix/i);
  });

  it('reports a configured provider as locked when the vault is locked', async () => {
    const { deps } = makeDeps([], {
      vaultCredentialsPort: fakeVaultPort(['openai']),
      cryptographyPort: fakeCryptoPort(false),
    });
    const app = new Hono().route('/api/advisor', createAdvisorApi(deps));

    const res = await app.request('/api/advisor/config');
    const body = (await res.json()) as { providers: Array<{ id: string; credential: { kind: string } }> };

    expect(body.providers.find((p) => p.id === 'openai')?.credential).toEqual({ kind: 'locked' });
  });

  it('round-trips the model chain through the config route', async () => {
    const { deps } = makeDeps([]);
    const app = new Hono().route('/api/advisor', createAdvisorApi(deps));

    const putRes = await app.request('/api/advisor/config/model-chain', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([{ providerId: 'ollama', modelId: 'llama3', contextWindow: 8192 }]),
    });
    expect(putRes.status).toBe(200);

    const getRes = await app.request('/api/advisor/config');
    const body = (await getRes.json()) as { chain: unknown[] };
    expect(body.chain).toEqual([{ providerId: 'ollama', modelId: 'llama3', contextWindow: 8192 }]);
  });
});

describe('advisor routes — execution profiles round trip', () => {
  it('writes { metered, local } and reads back the persisted, validated values', async () => {
    const { deps } = makeDeps([]);
    const app = new Hono().route('/api/advisor', createAdvisorApi(deps));

    const edited = { ...defaultExecutionProfiles(), metered: { ...defaultExecutionProfiles().metered, maxSteps: 8 } };
    const putRes = await app.request('/api/advisor/config/execution-profiles', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(edited),
    });
    expect(putRes.status).toBe(200);

    const getRes = await app.request('/api/advisor/config/execution-profiles');
    expect(await getRes.json()).toEqual(edited);
  });

  it('rejects maxSteps > 30 with the stored value unchanged', async () => {
    const { deps } = makeDeps([]);
    const app = new Hono().route('/api/advisor', createAdvisorApi(deps));

    const invalid = { ...defaultExecutionProfiles(), metered: { ...defaultExecutionProfiles().metered, maxSteps: 31 } };
    const putRes = await app.request('/api/advisor/config/execution-profiles', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(invalid),
    });
    expect(putRes.status).toBe(400);

    const getRes = await app.request('/api/advisor/config/execution-profiles');
    expect(await getRes.json()).toEqual(defaultExecutionProfiles());
  });

  it('rejects lastMessages > 200 with the stored value unchanged', async () => {
    const { deps } = makeDeps([]);
    const app = new Hono().route('/api/advisor', createAdvisorApi(deps));

    const invalid = { ...defaultExecutionProfiles(), local: { ...defaultExecutionProfiles().local, lastMessages: 201 } };
    const putRes = await app.request('/api/advisor/config/execution-profiles', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(invalid),
    });
    expect(putRes.status).toBe(400);

    const getRes = await app.request('/api/advisor/config/execution-profiles');
    expect(await getRes.json()).toEqual(defaultExecutionProfiles());
  });
});
