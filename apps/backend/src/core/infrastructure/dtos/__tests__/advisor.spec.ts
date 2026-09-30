import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { advisorStreamEventSchema } from '@kryptofolio/shared-types';
import type { AdvisorEvent } from '../../../domain/models/AdvisorEvent.js';
import type { ProfiledAdvisorRunReceipt } from '../../../domain/models/AdvisorRunReceipt.js';
import {
  toWireEvent,
  askAdvisorRequestSchema,
  advisorConfigSchema,
  advisorAnswerSchema,
} from '../advisor.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

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

describe('toWireEvent', () => {
  it('maps every domain event kind to its wire counterpart, parsing through advisorStreamEventSchema', () => {
    const events: AdvisorEvent[] = [
      { kind: 'token', text: 'hello', runId: 'run-1' },
      { kind: 'tool-start', callId: 'call-1', tool: 'portfolio_summary', runId: 'run-1' },
      { kind: 'tool-result', callId: 'call-1', tool: 'portfolio_summary', runId: 'run-1' },
      {
        kind: 'tool-error',
        callId: 'call-1',
        tool: 'portfolio_summary',
        code: 'INVALID_TOOL_INPUT',
        runId: 'run-1',
      },
      { kind: 'completed', runId: 'run-1', receipt: RECEIPT, disclaimer: false, figuresIncomplete: false },
      {
        kind: 'refused',
        runId: 'run-1',
        reason: 'tax evasion request',
        processorId: 'guardrail',
        receipt: RECEIPT,
      },
      { kind: 'failed', runId: 'run-1', code: 'ALL_PROVIDERS_FAILED', cause: { kind: 'auth-rejected', providerId: 'ollama-cloud', modelId: 'gpt-oss:120b' }, receipt: RECEIPT },
      { kind: 'failed', runId: 'run-1', code: 'VAULT_LOCKED', receipt: RECEIPT },
    ];

    for (const event of events) {
      const wire = toWireEvent(event);
      expect(() => advisorStreamEventSchema.parse(wire)).not.toThrow();
    }
  });

  it('maps a completed event to done, carrying executionProfile/stepsUsed/maxSteps from the receipt', () => {
    const wire = toWireEvent({ kind: 'completed', runId: 'run-1', receipt: RECEIPT, disclaimer: false, figuresIncomplete: false });
    expect(wire).toEqual({
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

  it('carries the disclaimer and incomplete-figures flags of a completed event onto the done frame', () => {
    const both = toWireEvent({ kind: 'completed', runId: 'run-1', receipt: RECEIPT, disclaimer: true, figuresIncomplete: true });
    const neither = toWireEvent({ kind: 'completed', runId: 'run-1', receipt: RECEIPT, disclaimer: false, figuresIncomplete: false });
    const onlyDisclaimer = toWireEvent({ kind: 'completed', runId: 'run-1', receipt: RECEIPT, disclaimer: true, figuresIncomplete: false });

    expect(both).toMatchObject({ kind: 'done', disclaimer: true, figuresIncomplete: true });
    expect(neither).toMatchObject({ kind: 'done', disclaimer: false, figuresIncomplete: false });
    expect(onlyDisclaimer).toMatchObject({ kind: 'done', disclaimer: true, figuresIncomplete: false });
  });

  it('puts no presentation flag on a refused or failed frame, which has no answer to disclaim', () => {
    const refused = toWireEvent({ kind: 'refused', runId: 'run-1', reason: 'r', processorId: 'p', receipt: RECEIPT });
    const failed = toWireEvent({ kind: 'failed', runId: 'run-1', code: 'VAULT_LOCKED', receipt: RECEIPT });

    expect(refused).not.toHaveProperty('disclaimer');
    expect(refused).not.toHaveProperty('figuresIncomplete');
    expect(failed).not.toHaveProperty('disclaimer');
    expect(failed).not.toHaveProperty('figuresIncomplete');
  });

  it('carries the receipt thread id on every terminal frame, so a client can continue the conversation after any outcome', () => {
    const completed = toWireEvent({ kind: 'completed', runId: 'run-1', receipt: RECEIPT, disclaimer: false, figuresIncomplete: false });
    const refused = toWireEvent({
      kind: 'refused',
      runId: 'run-1',
      reason: 'r',
      processorId: 'p',
      receipt: RECEIPT,
    });
    const failed = toWireEvent({ kind: 'failed', runId: 'run-1', code: 'VAULT_LOCKED', receipt: RECEIPT });

    expect(completed).toMatchObject({ kind: 'done', threadId: 'thread-1' });
    expect(refused).toMatchObject({ kind: 'refused', threadId: 'thread-1' });
    expect(failed).toMatchObject({ kind: 'failed', threadId: 'thread-1' });
  });

  it('puts the closed cause, provider and model on an ALL_PROVIDERS_FAILED frame and nothing else about the error', () => {
    const wire = toWireEvent({
      kind: 'failed',
      runId: 'run-1',
      code: 'ALL_PROVIDERS_FAILED',
      cause: { kind: 'auth-rejected', providerId: 'ollama-cloud', modelId: 'gpt-oss:120b' },
      receipt: RECEIPT,
    });

    expect(wire).toEqual({
      kind: 'failed',
      runId: 'run-1',
      threadId: 'thread-1',
      code: 'ALL_PROVIDERS_FAILED',
      cause: { kind: 'auth-rejected', providerId: 'ollama-cloud', modelId: 'gpt-oss:120b' },
    });
  });

  it('puts no cause on a failure that happened before any provider was tried', () => {
    const wire = toWireEvent({ kind: 'failed', runId: 'run-1', code: 'NO_MODEL_AVAILABLE', receipt: RECEIPT });

    expect(wire).not.toHaveProperty('cause');
  });

  it('carries runId on every non-terminal wire frame, mirroring the domain event', () => {
    const wire = toWireEvent({ kind: 'token', text: 'hi', runId: 'run-42' });
    expect(wire).toEqual({ kind: 'token', runId: 'run-42', text: 'hi' });
  });

  it('is the single conversion site from AdvisorEvent to AdvisorStreamEvent', () => {
    const infraDir = join(__dirname, '..', '..');
    const aiDir = join(infraDir, 'ai');
    const routesDir = join(infraDir, 'routes');
    const offenders: string[] = [];

    function scan(dir: string) {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          scan(full);
          continue;
        }
        if (!entry.name.endsWith('.ts') || entry.name.endsWith('.spec.ts') || full.endsWith('advisor.ts')) {
          continue;
        }
        const text = readFileSync(full, 'utf8');
        if (text.includes('AdvisorStreamEvent') || text.includes('advisorStreamEventSchema')) {
          offenders.push(full);
        }
      }
    }

    scan(aiDir);
    scan(routesDir);
    expect(offenders).toEqual([]);
  });
});

describe('askAdvisorRequestSchema', () => {
  it('accepts a valid message with no threadId', () => {
    expect(askAdvisorRequestSchema.safeParse({ message: 'hello' }).success).toBe(true);
  });

  it('rejects an empty message', () => {
    expect(askAdvisorRequestSchema.safeParse({ message: '' }).success).toBe(false);
  });

  it('rejects a message over 4000 characters', () => {
    expect(askAdvisorRequestSchema.safeParse({ message: 'a'.repeat(4001) }).success).toBe(false);
  });

  it('rejects a non-UUID threadId', () => {
    expect(askAdvisorRequestSchema.safeParse({ message: 'hi', threadId: 'not-a-uuid' }).success).toBe(false);
  });

  it('accepts a UUID threadId', () => {
    expect(
      askAdvisorRequestSchema.safeParse({ message: 'hi', threadId: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
        .success,
    ).toBe(true);
  });
});

describe('advisorConfigSchema', () => {
  it('accepts a credential state discriminated union, never hasKey: boolean', () => {
    const parsed = advisorConfigSchema.safeParse({
      chain: [{ providerId: 'ollama', modelId: 'llama3', contextWindow: 8192 }],
      providers: [
        { id: 'openai', category: { kind: 'ai-model' }, credential: { kind: 'absent' } },
        { id: 'anthropic', category: { kind: 'ai-model' }, credential: { kind: 'locked' } },
        { id: 'ollama', category: { kind: 'ai-model' }, credential: { kind: 'present' } },
      ],
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects a hasKey boolean shape', () => {
    const parsed = advisorConfigSchema.safeParse({
      chain: [],
      providers: [{ id: 'openai', category: { kind: 'ai-model' }, hasKey: true }],
    });
    expect(parsed.success).toBe(false);
  });

  it('never carries an apiKey, prefix, or ciphertext field on a provider entry', () => {
    const text = JSON.stringify(
      advisorConfigSchema.parse({
        chain: [],
        providers: [{ id: 'openai', category: { kind: 'ai-model' }, credential: { kind: 'present' } }],
      }),
    );
    expect(text).not.toMatch(/apiKey|prefix|cipher/i);
  });
});

describe('advisorAnswerSchema', () => {
  it('accepts a completed answer with text and receipt', () => {
    expect(
      advisorAnswerSchema.safeParse({ outcome: 'completed', text: 'the answer', receipt: RECEIPT }).success,
    ).toBe(true);
  });

  it('accepts a refused answer with reason/processorId and no text', () => {
    expect(
      advisorAnswerSchema.safeParse({
        outcome: 'refused',
        reason: 'tax evasion request',
        processorId: 'guardrail',
      }).success,
    ).toBe(true);
  });

  it('accepts a failed answer with a code and no text', () => {
    expect(advisorAnswerSchema.safeParse({ outcome: 'failed', code: 'NO_MODEL_AVAILABLE' }).success).toBe(true);
  });
});
