/**
 * The terminal `AdvisorEvent` members (`completed`, `refused`, `failed`) each carry an
 * `AdvisorRunReceipt` — provider used, model used, ordered tool names, token counts, the resolved
 * `executionProfile`, and `stepsUsed`/`maxSteps` — with no second metadata channel.
 */
import { describe, it, expect } from 'vitest';
import type { AdvisorEvent } from '../AdvisorEvent.js';
import type { PreRunAdvisorRunReceipt, ProfiledAdvisorRunReceipt } from '../AdvisorRunReceipt.js';

const receipt: ProfiledAdvisorRunReceipt = {
  kind: 'profiled',
  runId: 'run-1',
  threadId: 'thread-1',
  startedAt: '2026-09-28T10:00:00.000Z',
  finishedAt: '2026-09-28T10:00:05.000Z',
  providerId: 'anthropic',
  modelId: 'claude-sonnet-5',
  toolsCalled: ['portfolio_summary', 'fiscal_integrity'],
  usage: { inputTokens: 120, outputTokens: 340 },
  executionProfile: 'metered',
  stepsUsed: 3,
  maxSteps: 5,
};

describe('AdvisorEvent terminal members carry the full receipt', () => {
  it('completed carries provider, model, ordered tools, usage, execution profile, and step counts', () => {
    const event: AdvisorEvent = { kind: 'completed', runId: 'run-1', receipt, disclaimer: false, figuresIncomplete: false };
    expect(event.receipt.providerId).toBe('anthropic');
    expect(event.receipt.modelId).toBe('claude-sonnet-5');
    expect(event.receipt.toolsCalled).toEqual(['portfolio_summary', 'fiscal_integrity']);
    expect(event.receipt.usage).toEqual({ inputTokens: 120, outputTokens: 340 });
    expect(event.receipt.executionProfile).toBe('metered');
    expect(event.receipt.stepsUsed).toBe(3);
    expect(event.receipt.maxSteps).toBe(5);
  });

  it('refused carries the same receipt alongside its reason and processor id', () => {
    const event: AdvisorEvent = {
      kind: 'refused',
      runId: 'run-1',
      reason: 'guardrail triggered',
      processorId: 'financial-advice-guard',
      receipt,
    };
    expect(event.receipt).toBe(receipt);
    expect(event.reason).toBe('guardrail triggered');
  });

  it('failed carries the same receipt alongside its failure code', () => {
    const event: AdvisorEvent = { kind: 'failed', runId: 'run-1', code: 'VAULT_LOCKED', receipt };
    expect(event.receipt).toBe(receipt);
    expect(event.code).toBe('VAULT_LOCKED');
  });

  it('an exhausted provider chain names the provider that failed last and why', () => {
    const event: AdvisorEvent = {
      kind: 'failed',
      runId: 'run-1',
      code: 'ALL_PROVIDERS_FAILED',
      cause: { kind: 'rate-limited', providerId: 'openai', modelId: 'gpt-5' },
      receipt,
    };
    expect(event.cause.kind).toBe('rate-limited');
  });

  it('a failure code with no provider involved has no cause field to read', () => {
    const event: AdvisorEvent = { kind: 'failed', runId: 'run-1', code: 'NO_MODEL_AVAILABLE', receipt };
    // @ts-expect-error a cause exists only on ALL_PROVIDERS_FAILED
    void event.cause;
  });

  it('non-terminal members carry no receipt field at all', () => {
    const event: AdvisorEvent = { kind: 'token', text: 'hello', runId: 'run-1' };
    expect('receipt' in event).toBe(false);
  });
});

describe('every AdvisorEvent member carries the run it belongs to', () => {
  it('a non-terminal event carries runId, so a consumer can correlate it to a run before any terminal event arrives', () => {
    const token: AdvisorEvent = { kind: 'token', text: 'hello', runId: 'run-1' };
    const toolStart: AdvisorEvent = { kind: 'tool-start', callId: 'call-1', tool: 'portfolio_summary', runId: 'run-1' };
    const toolResult: AdvisorEvent = { kind: 'tool-result', callId: 'call-1', tool: 'portfolio_summary', runId: 'run-1' };
    const toolError: AdvisorEvent = {
      kind: 'tool-error',
      callId: 'call-1',
      tool: 'portfolio_summary',
      code: 'USE_CASE_FAILED',
      runId: 'run-1',
    };

    expect(token.runId).toBe('run-1');
    expect(toolStart.runId).toBe('run-1');
    expect(toolResult.runId).toBe('run-1');
    expect(toolError.runId).toBe('run-1');
  });

  it('completed requires a profiled receipt, while failed and refused also accept a pre-run one', () => {
    const preRun: PreRunAdvisorRunReceipt = {
      kind: 'pre-run',
      runId: 'run-2',
      threadId: 'thread-1',
      startedAt: '2026-09-28T10:00:00.000Z',
      finishedAt: '2026-09-28T10:00:00.100Z',
      toolsCalled: [],
      usage: { inputTokens: 0, outputTokens: 0 },
    };

    const failed: AdvisorEvent = { kind: 'failed', runId: 'run-2', code: 'NO_MODEL_AVAILABLE', receipt: preRun };
    // @ts-expect-error a completed run always resolved a profile, so a pre-run receipt is rejected
    const completed: AdvisorEvent = { kind: 'completed', runId: 'run-2', receipt: preRun, disclaimer: false, figuresIncomplete: false };

    expect(failed.kind).toBe('failed');
    expect(completed.kind).toBe('completed');
  });
});
