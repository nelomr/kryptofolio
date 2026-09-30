import { describe, it, expect } from 'vitest';
import {
  advisorStreamEventSchema,
  ADVISOR_TOOL_NAMES,
  ADVISOR_FAILURE_CODES,
  ADVISOR_TOOL_ERROR_CODES,
  ADVISOR_PROVIDER_FAILURE_KINDS,
  type AdvisorStreamEvent,
} from '../../src/advisor-stream';

const SAMPLE_EVENTS: AdvisorStreamEvent[] = [
  { kind: 'token', runId: 'run-1', text: 'hello' },
  { kind: 'tool-start', runId: 'run-1', callId: 'call-1', tool: 'portfolio_summary' },
  { kind: 'tool-result', runId: 'run-1', callId: 'call-1', tool: 'portfolio_summary' },
  { kind: 'tool-error', runId: 'run-1', callId: 'call-1', tool: 'portfolio_summary', code: 'INVALID_TOOL_INPUT' },
  {
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
    disclaimer: true,
    figuresIncomplete: false,
  },
  { kind: 'refused', runId: 'run-1', threadId: 'thread-1', reason: 'tax evasion request', processorId: 'guardrail' },
  {
    kind: 'failed',
    runId: 'run-1',
    threadId: 'thread-1',
    code: 'ALL_PROVIDERS_FAILED',
    cause: { kind: 'auth-rejected', providerId: 'ollama-cloud', modelId: 'gpt-oss:120b' },
  },
  { kind: 'failed', runId: 'run-1', threadId: 'thread-1', code: 'VAULT_LOCKED' },
];

describe('advisorStreamEventSchema round-trip', () => {
  for (const event of SAMPLE_EVENTS) {
    it(`survives serialize -> parse unchanged for kind "${event.kind}"`, () => {
      const serialized = JSON.parse(JSON.stringify(event));
      const parsed = advisorStreamEventSchema.parse(serialized);
      expect(parsed).toEqual(event);
    });
  }
});

describe('advisorStreamEventSchema closed vocabularies', () => {
  it('rejects a tool name outside ADVISOR_TOOL_NAMES', () => {
    const frame = { kind: 'tool-start', runId: 'run-1', callId: 'call-1', tool: 'not_a_real_tool' };
    expect(() => advisorStreamEventSchema.parse(frame)).toThrow();
  });

  it('rejects a failure code outside ADVISOR_FAILURE_CODES', () => {
    const frame = { kind: 'failed', runId: 'run-1', code: 'SOMETHING_ELSE' };
    expect(() => advisorStreamEventSchema.parse(frame)).toThrow();
  });

  it('rejects a tool-error code outside ADVISOR_TOOL_ERROR_CODES', () => {
    const frame = { kind: 'tool-error', runId: 'run-1', callId: 'call-1', tool: 'portfolio_summary', code: 'WHATEVER' };
    expect(() => advisorStreamEventSchema.parse(frame)).toThrow();
  });

  it('declares no transport-lost member — unrepresentable on the wire', () => {
    const frame = { kind: 'transport-lost' };
    expect(() => advisorStreamEventSchema.parse(frame)).toThrow();
  });

  it('exposes the full closed vocabularies', () => {
    expect(ADVISOR_TOOL_NAMES).toContain('portfolio_summary');
    expect(ADVISOR_TOOL_NAMES).toHaveLength(13);
    expect(ADVISOR_FAILURE_CODES).toEqual([
      'NO_MODEL_AVAILABLE',
      'VAULT_LOCKED',
      'ALL_PROVIDERS_FAILED',
      'INTERNAL_ERROR',
    ]);
    expect(ADVISOR_TOOL_ERROR_CODES).toEqual(['INVALID_TOOL_INPUT', 'USE_CASE_FAILED']);
  });
});

describe('advisorStreamEventSchema thread continuity', () => {
  it('rejects a done frame that does not say which thread the run belongs to', () => {
    const withoutThread = {
      kind: 'done',
      runId: 'run-1',
      providerId: 'openai',
      modelId: 'gpt-5',
      usage: { inputTokens: 1, outputTokens: 1 },
      toolsCalled: [],
      executionProfile: 'metered',
      stepsUsed: 1,
      maxSteps: 5,
    };

    expect(advisorStreamEventSchema.safeParse(withoutThread).success).toBe(false);
  });

  it('rejects a refused frame that does not say which thread the run belongs to', () => {
    const frame = { kind: 'refused', runId: 'run-1', reason: 'r', processorId: 'p' };

    expect(advisorStreamEventSchema.safeParse(frame).success).toBe(false);
  });

  it('accepts a failed frame with no thread, for a failure that happened before any receipt existed', () => {
    const frame = { kind: 'failed', runId: 'unknown', code: 'INTERNAL_ERROR' };

    expect(advisorStreamEventSchema.safeParse(frame).success).toBe(true);
  });
});

describe('advisorStreamEventSchema presentation flags on done', () => {
  const base = {
    kind: 'done',
    runId: 'run-1',
    threadId: 'thread-1',
    providerId: 'openai',
    modelId: 'gpt-5',
    usage: { inputTokens: 1, outputTokens: 1 },
    toolsCalled: [],
    executionProfile: 'metered',
    stepsUsed: 1,
    maxSteps: 5,
  };

  it('rejects a done frame that omits the disclaimer flag', () => {
    expect(advisorStreamEventSchema.safeParse({ ...base, figuresIncomplete: false }).success).toBe(false);
  });

  it('rejects a done frame that omits the incomplete-figures flag', () => {
    expect(advisorStreamEventSchema.safeParse({ ...base, disclaimer: false }).success).toBe(false);
  });

  it('rejects flags that are not booleans', () => {
    expect(
      advisorStreamEventSchema.safeParse({ ...base, disclaimer: 'yes', figuresIncomplete: false }).success,
    ).toBe(false);
    expect(
      advisorStreamEventSchema.safeParse({ ...base, disclaimer: false, figuresIncomplete: 0 }).success,
    ).toBe(false);
  });

  it('keeps both flags when parsing', () => {
    const parsed = advisorStreamEventSchema.parse({ ...base, disclaimer: true, figuresIncomplete: true });
    expect(parsed).toMatchObject({ disclaimer: true, figuresIncomplete: true });
  });
});

describe('advisorStreamEventSchema provider failure cause', () => {
  const cause = { kind: 'rate-limited', providerId: 'openai', modelId: 'gpt-5' };

  it('declares the closed failure-kind vocabulary', () => {
    expect([...ADVISOR_PROVIDER_FAILURE_KINDS]).toEqual([
      'auth-rejected',
      'model-not-found',
      'rate-limited',
      'provider-unavailable',
      'network',
      'unknown',
    ]);
  });

  it('requires a cause on ALL_PROVIDERS_FAILED', () => {
    const frame = { kind: 'failed', runId: 'run-1', threadId: 't', code: 'ALL_PROVIDERS_FAILED' };
    expect(advisorStreamEventSchema.safeParse(frame).success).toBe(false);
  });

  it.each(['NO_MODEL_AVAILABLE', 'VAULT_LOCKED', 'INTERNAL_ERROR'] as const)(
    'rejects a cause on %s, where it has no meaning',
    (code) => {
      const frame = { kind: 'failed', runId: 'run-1', threadId: 't', code, cause };
      expect(advisorStreamEventSchema.safeParse(frame).success).toBe(false);
    },
  );

  it('rejects a cause kind outside the vocabulary', () => {
    const frame = {
      kind: 'failed',
      runId: 'run-1',
      code: 'ALL_PROVIDERS_FAILED',
      cause: { ...cause, kind: 'teapot' },
    };
    expect(advisorStreamEventSchema.safeParse(frame).success).toBe(false);
  });

  it('rejects any free-text field smuggled onto the cause', () => {
    const frame = {
      kind: 'failed',
      runId: 'run-1',
      code: 'ALL_PROVIDERS_FAILED',
      cause: { ...cause, message: 'Unauthorized' },
    };
    expect(advisorStreamEventSchema.safeParse(frame).success).toBe(false);
  });
});
