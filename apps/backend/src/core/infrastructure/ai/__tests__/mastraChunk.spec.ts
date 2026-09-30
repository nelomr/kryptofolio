import { describe, it, expect } from 'vitest';
import { applyChunk, freezeReceipt, type ApplyChunkContext, type StreamChunkLike } from '../mastraChunk.js';
import type { AdvisorRunReceiptDraft } from '../../../domain/models/AdvisorRunReceipt.js';
import type { ResolvedChainEntry } from '../models/resolvedChainEntry.js';
import { createDisclaimerProcessor } from '../guardrails/disclaimerProcessor.js';

const primaryEntry: ResolvedChainEntry = { providerId: 'anthropic', modelId: 'claude-sonnet-5', apiKey: 'sk-test' };
const FIXED_NOW = '2026-01-01T00:00:05.000Z';

function freshDraft(): AdvisorRunReceiptDraft {
  return { runId: 'run-1', threadId: 'thread-1', startedAt: '2026-01-01T00:00:00.000Z', toolsCalled: [] };
}

function resolvedDraft(): AdvisorRunReceiptDraft {
  return { ...freshDraft(), executionProfile: 'metered', maxSteps: 5 };
}

function context(draft: AdvisorRunReceiptDraft, resolvedChain: ResolvedChainEntry[] = [primaryEntry]): ApplyChunkContext {
  const [entry] = resolvedChain;
  return { draft, resolvedChain, primaryEntry: entry ?? primaryEntry, now: () => FIXED_NOW };
}

/**
 * `applyChunk` is `MastraAdvisorAdapter`'s per-chunk reducer (`mastraChunk.ts`), factored out of the
 * generator so the accumulating draft is directly inspectable without ever needing a terminal chunk
 * — a run that never terminates still has something to audit.
 */
describe('applyChunk — chunk-to-AdvisorEvent mapping', () => {
  it('text-delta yields a token event', () => {
    const chunk: StreamChunkLike = { type: 'text-delta', payload: { text: 'hello' } };
    const result = applyChunk(chunk, context(freshDraft()));

    expect(result).toEqual({ events: [{ kind: 'token', text: 'hello', runId: 'run-1' }], terminal: false });
  });

  it('tool-call for a real tool yields tool-start', () => {
    const chunk: StreamChunkLike = { type: 'tool-call', payload: { toolCallId: 'call-1', toolName: 'portfolio_summary' } };
    const result = applyChunk(chunk, context(freshDraft()));

    expect(result.events).toEqual([{ kind: 'tool-start', callId: 'call-1', tool: 'portfolio_summary', runId: 'run-1' }]);
    expect(result.terminal).toBe(false);
  });

  it('tool-call for the sub-agent delegation call itself (not a real tool) yields nothing', () => {
    const chunk: StreamChunkLike = { type: 'tool-call', payload: { toolCallId: 'call-1', toolName: 'agent-taxAnalyst' } };
    const result = applyChunk(chunk, context(freshDraft()));

    expect(result).toEqual({ events: [], terminal: false });
  });

  it('tool-result for a real tool yields tool-result and records it in the draft as called', () => {
    const draft = freshDraft();
    const chunk: StreamChunkLike = {
      type: 'tool-result',
      payload: { toolCallId: 'call-1', toolName: 'portfolio_summary', result: { ranked: [] } },
    };

    const result = applyChunk(chunk, context(draft));

    expect(result.events).toEqual([{ kind: 'tool-result', callId: 'call-1', tool: 'portfolio_summary', runId: 'run-1' }]);
    expect(draft.toolsCalled).toEqual(['portfolio_summary']);
  });

  it('a tool-result whose result is Mastra\'s own ValidationError shape yields tool-error INVALID_TOOL_INPUT', () => {
    const chunk: StreamChunkLike = {
      type: 'tool-result',
      payload: {
        toolCallId: 'call-1',
        toolName: 'token_history',
        result: { error: true, message: 'bad input', validationErrors: { errors: [], fields: {} } },
      },
    };

    const result = applyChunk(chunk, context(freshDraft()));

    expect(result.events).toEqual([
      { kind: 'tool-error', callId: 'call-1', tool: 'token_history', code: 'INVALID_TOOL_INPUT', runId: 'run-1' },
    ]);
  });

  it('a tool-error chunk (the use case itself threw) yields tool-error USE_CASE_FAILED', () => {
    const chunk: StreamChunkLike = {
      type: 'tool-error',
      payload: { toolCallId: 'call-1', toolName: 'token_history', error: new Error('boom') },
    };

    const result = applyChunk(chunk, context(freshDraft()));

    expect(result.events).toEqual([
      { kind: 'tool-error', callId: 'call-1', tool: 'token_history', code: 'USE_CASE_FAILED', runId: 'run-1' },
    ]);
  });

  it('a tool-output wrapper unwraps a sub-agent delegate\'s real tool activity', () => {
    const draft = freshDraft();
    const chunk: StreamChunkLike = {
      type: 'tool-output',
      payload: {
        toolCallId: 'outer-call-1',
        toolName: 'agent-taxAnalyst',
        output: { type: 'tool-result', payload: { toolCallId: 'inner-1', toolName: 'portfolio_summary', result: {} } },
      },
    };

    const result = applyChunk(chunk, context(draft));

    expect(result.events).toEqual([{ kind: 'tool-result', callId: 'inner-1', tool: 'portfolio_summary', runId: 'run-1' }]);
    expect(draft.toolsCalled).toEqual(['portfolio_summary']);
  });

  it('tripwire yields refused, terminal, carrying a populated receipt', () => {
    const draft = freshDraft();
    draft.executionProfile = 'metered';
    draft.maxSteps = 5;
    const chunk: StreamChunkLike = {
      type: 'tripwire',
      payload: { reason: 'not grounded', processorId: 'grounding-directive-detector' },
    };

    const result = applyChunk(chunk, context(draft));

    expect(result.terminal).toBe(true);
    expect(result.events).toHaveLength(1);
    const [event] = result.events;
    if (event?.kind !== 'refused') throw new Error('expected a refused event');
    expect(event.reason).toBe('not grounded');
    expect(event.processorId).toBe('grounding-directive-detector');
    expect(event.receipt.runId).toBe('run-1');
    expect(event.receipt.providerId).toBe('anthropic');
    expect(event.receipt.finishedAt).toBe(FIXED_NOW);
  });

  it('error yields failed ALL_PROVIDERS_FAILED, terminal, carrying a populated receipt', () => {
    const chunk: StreamChunkLike = { type: 'error', payload: { error: new Error('all providers exhausted') } };

    const result = applyChunk(chunk, context(freshDraft()));

    expect(result.terminal).toBe(true);
    const [event] = result.events;
    if (event?.kind !== 'failed') throw new Error('expected a failed event');
    expect(event.code).toBe('ALL_PROVIDERS_FAILED');
    expect(event.receipt.runId).toBe('run-1');
  });

  describe('failure cause', () => {
    const rejected = Object.assign(new Error('Unauthorized'), { name: 'AI_APICallError', statusCode: 401 });
    const fallbackEntry: ResolvedChainEntry = { providerId: 'ollama-cloud', modelId: 'gpt-oss:120b', apiKey: 'k-second' };

    it('classifies the error chunk payload and names the provider and model that failed', () => {
      const chunk: StreamChunkLike = { type: 'error', payload: { error: rejected } };

      const result = applyChunk(chunk, context(freshDraft(), [primaryEntry]));

      const [event] = result.events;
      if (event?.kind !== 'failed' || event.code !== 'ALL_PROVIDERS_FAILED') throw new Error('expected ALL_PROVIDERS_FAILED');
      expect(event.cause).toEqual({ kind: 'auth-rejected', providerId: 'anthropic', modelId: 'claude-sonnet-5' });
    });

    it('reports the last chain entry, since only the final failure of an exhausted chain surfaces', () => {
      const chunk: StreamChunkLike = { type: 'error', payload: { error: rejected } };

      const result = applyChunk(chunk, context(freshDraft(), [primaryEntry, fallbackEntry]));

      const [event] = result.events;
      if (event?.kind !== 'failed' || event.code !== 'ALL_PROVIDERS_FAILED') throw new Error('expected ALL_PROVIDERS_FAILED');
      expect(event.cause).toMatchObject({ providerId: 'ollama-cloud', modelId: 'gpt-oss:120b' });
    });

    it('reports the entry that already answered when the run fails after a step', () => {
      const draft: AdvisorRunReceiptDraft = { ...resolvedDraft(), providerId: 'anthropic', modelId: 'claude-sonnet-5' };
      const chunk: StreamChunkLike = { type: 'error', payload: { error: rejected } };

      const result = applyChunk(chunk, context(draft, [primaryEntry, fallbackEntry]));

      const [event] = result.events;
      if (event?.kind !== 'failed' || event.code !== 'ALL_PROVIDERS_FAILED') throw new Error('expected ALL_PROVIDERS_FAILED');
      expect(event.cause).toMatchObject({ providerId: 'anthropic', modelId: 'claude-sonnet-5' });
    });

    it('is unknown when the payload carries no error object', () => {
      const result = applyChunk({ type: 'error', payload: {} }, context(freshDraft()));

      const [event] = result.events;
      if (event?.kind !== 'failed' || event.code !== 'ALL_PROVIDERS_FAILED') throw new Error('expected ALL_PROVIDERS_FAILED');
      expect(event.cause.kind).toBe('unknown');
    });

    it('is unknown for a finish with reason error, which carries no error to read', () => {
      const chunk: StreamChunkLike = { type: 'finish', payload: { stepResult: { reason: 'error' }, output: { usage: {} } } };

      const [event] = applyChunk(chunk, context(resolvedDraft())).events;

      if (event?.kind !== 'failed' || event.code !== 'ALL_PROVIDERS_FAILED') throw new Error('expected ALL_PROVIDERS_FAILED');
      expect(event.cause).toEqual({ kind: 'unknown', providerId: 'anthropic', modelId: 'claude-sonnet-5' });
    });

    it('exposes a diagnostic with the classified kind and status, and a message free of known secrets', () => {
      const leaky = Object.assign(new Error('bad key sk-test rejected at https://api.example.com/v1'), {
        statusCode: 401,
      });

      const result = applyChunk({ type: 'error', payload: { error: leaky } }, context(freshDraft()));

      expect(result.diagnostic).toEqual({
        kind: 'auth-rejected',
        statusCode: 401,
        providerId: 'anthropic',
        modelId: 'claude-sonnet-5',
        message: 'bad key [redacted] rejected at [url]',
      });
    });

    it('carries no diagnostic on a non-failing chunk', () => {
      expect(applyChunk({ type: 'text-delta', payload: { text: 'x' } }, context(freshDraft())).diagnostic).toBeUndefined();
    });
  });

  it('a failure before any execution profile was resolved freezes a pre-run receipt with no profile and no step counts', () => {
    const receipt = freezeReceipt(freshDraft(), undefined, FIXED_NOW);

    expect(receipt.kind).toBe('pre-run');
    expect(receipt).not.toHaveProperty('executionProfile');
    expect(receipt).not.toHaveProperty('stepsUsed');
    expect(receipt).not.toHaveProperty('maxSteps');
  });

  it('a draft whose profile was resolved freezes a profiled receipt carrying the profile and both step counts', () => {
    const draft = freshDraft();
    draft.executionProfile = 'local';
    draft.maxSteps = 15;
    draft.stepsUsed = 4;

    const receipt = freezeReceipt(draft, primaryEntry, FIXED_NOW);

    expect(receipt).toMatchObject({ kind: 'profiled', executionProfile: 'local', stepsUsed: 4, maxSteps: 15 });
  });

  it('a profiled receipt with no step-finish chunk seen reports zero steps rather than none', () => {
    const draft = freshDraft();
    draft.executionProfile = 'metered';
    draft.maxSteps = 5;

    expect(freezeReceipt(draft, primaryEntry, FIXED_NOW)).toMatchObject({ kind: 'profiled', stepsUsed: 0 });
  });

  it('a finish chunk on a run that never resolved a profile cannot be reported as completed', () => {
    const chunk: StreamChunkLike = {
      type: 'finish',
      payload: { stepResult: { reason: 'stop' }, output: { usage: { inputTokens: 1, outputTokens: 2 } } },
    };

    const [event] = applyChunk(chunk, context(freshDraft())).events;

    expect(event?.kind).toBe('failed');
    expect(event && 'receipt' in event ? event.receipt.kind : undefined).toBe('pre-run');
  });

  it('finish with a non-error reason yields completed, terminal, carrying a populated receipt', () => {
    const draft = freshDraft();
    draft.executionProfile = 'metered';
    draft.maxSteps = 5;
    const chunk: StreamChunkLike = {
      type: 'finish',
      payload: {
        stepResult: { reason: 'stop' },
        output: { usage: { inputTokens: 10, outputTokens: 20 } },
        metadata: { modelMetadata: { modelId: 'claude-sonnet-5' } },
      },
    };

    const result = applyChunk(chunk, context(draft));

    expect(result.terminal).toBe(true);
    const [event] = result.events;
    if (event?.kind !== 'completed') throw new Error('expected a completed event');
    expect(event.receipt.usage).toEqual({ inputTokens: 10, outputTokens: 20 });
    expect(event.receipt.providerId).toBe('anthropic');
    expect(event.receipt.modelId).toBe('claude-sonnet-5');
    expect(event.receipt.executionProfile).toBe('metered');
    expect(event.receipt.maxSteps).toBe(5);
  });

  it('finish with reason "error" yields failed ALL_PROVIDERS_FAILED, never completed', () => {
    const chunk: StreamChunkLike = {
      type: 'finish',
      payload: { stepResult: { reason: 'error' }, output: { usage: {} } },
    };

    const result = applyChunk(chunk, context(freshDraft()));

    const [event] = result.events;
    expect(event?.kind).toBe('failed');
    if (event?.kind === 'failed') expect(event.code).toBe('ALL_PROVIDERS_FAILED');
  });

  it('abort ends the run with no event at all — cancellation has no terminal event', () => {
    const chunk: StreamChunkLike = { type: 'abort', payload: {} };

    const result = applyChunk(chunk, context(freshDraft()));

    expect(result).toEqual({ events: [], terminal: true });
  });
});

describe('applyChunk — receipt accumulation before any terminal event', () => {
  it('names the provider, model, and tool, and already carries the resolved execution profile, before any terminal chunk arrives', () => {
    const draft = resolvedDraft();
    draft.executionProfile = 'metered';
    draft.maxSteps = 5;
    const ctx = context(draft);

    applyChunk({ type: 'tool-call', payload: { toolCallId: 'call-1', toolName: 'portfolio_summary' } }, ctx);
    applyChunk(
      { type: 'tool-result', payload: { toolCallId: 'call-1', toolName: 'portfolio_summary', result: {} } },
      ctx,
    );
    applyChunk({ type: 'text-delta', payload: { text: 'partial answer' } }, ctx);
    applyChunk(
      {
        type: 'step-finish',
        payload: {
          stepResult: { reason: 'tool-calls' },
          output: {},
          metadata: { modelMetadata: { modelId: 'claude-sonnet-5' } },
        },
      },
      ctx,
    );

    // No terminal chunk was ever fed in — this is exactly the "run that never terminates" case.
    expect(draft.providerId).toBe('anthropic');
    expect(draft.modelId).toBe('claude-sonnet-5');
    expect(draft.toolsCalled).toEqual(['portfolio_summary']);
    expect(draft.executionProfile).toBe('metered');
  });

  it("increments the draft's stepsUsed once per step-finish chunk", () => {
    const draft = resolvedDraft();
    const ctx = context(draft);
    const stepFinish: StreamChunkLike = { type: 'step-finish', payload: { stepResult: { reason: 'tool-calls' }, output: {} } };

    applyChunk(stepFinish, ctx);
    expect(draft.stepsUsed).toBe(1);

    applyChunk(stepFinish, ctx);
    expect(draft.stepsUsed).toBe(2);
  });

  it("the terminal receipt's maxSteps equals the resolved profile's maxSteps set on the draft", () => {
    const draft = resolvedDraft();
    draft.maxSteps = 15;
    const result = applyChunk(
      { type: 'finish', payload: { stepResult: { reason: 'stop' }, output: { usage: {} } } },
      context(draft),
    );

    const [event] = result.events;
    if (event?.kind !== 'completed') throw new Error('expected a completed event');
    expect(event.receipt.maxSteps).toBe(15);
  });
});

describe('applyChunk — an unmapped chunk type is dropped silently', () => {
  it('a real but unmapped chunk type produces no event and does not end the run', () => {
    const result = applyChunk({ type: 'reasoning-delta', payload: { text: 'thinking...' } }, context(resolvedDraft()));

    expect(result).toEqual({ events: [], terminal: false });
  });

  it('a chunk type Mastra does not even document yet is also dropped, never thrown', () => {
    const chunk: StreamChunkLike = { type: 'some-future-mastra-chunk-kind', payload: { anything: true } };

    expect(() => applyChunk(chunk, context(resolvedDraft()))).not.toThrow();
    expect(applyChunk(chunk, context(resolvedDraft()))).toEqual({ events: [], terminal: false });
  });
});

function finishChunk(extra: Record<string, unknown> = {}): StreamChunkLike {
  return {
    type: 'finish',
    payload: { stepResult: { reason: 'stop' }, output: { usage: { inputTokens: 1, outputTokens: 2 } }, ...extra },
  };
}

function completedOf(result: ReturnType<typeof applyChunk>) {
  const [event] = result.events;
  if (event?.kind !== 'completed') throw new Error('expected a completed event');
  return event;
}

describe('applyChunk — disclaimer flag on the completed event', () => {
  it('is true when the finish payload carries the disclaimer the output processor attached', () => {
    const event = completedOf(applyChunk(finishChunk({ disclaimer: 'Not financial advice.' }), context(resolvedDraft())));

    expect(event.disclaimer).toBe(true);
  });

  it('is false when the finish payload has no disclaimer field', () => {
    const event = completedOf(applyChunk(finishChunk(), context(resolvedDraft())));

    expect(event.disclaimer).toBe(false);
  });

  it('is false when the field is present but is not a non-empty string', () => {
    expect(completedOf(applyChunk(finishChunk({ disclaimer: '' }), context(resolvedDraft()))).disclaimer).toBe(false);
    expect(completedOf(applyChunk(finishChunk({ disclaimer: true }), context(resolvedDraft()))).disclaimer).toBe(false);
    expect(completedOf(applyChunk(finishChunk({ disclaimer: null }), context(resolvedDraft()))).disclaimer).toBe(false);
  });
});

describe('applyChunk — disclaimer produced by the real output processor', () => {
  async function finishThroughProcessor(answer: string): Promise<StreamChunkLike> {
    const processor = createDisclaimerProcessor();
    const state: Record<string, unknown> = {};
    const delta = { type: 'text-delta', runId: 'run-1', from: 'AGENT', payload: { id: 't', text: answer } };
    const finish = {
      type: 'finish',
      runId: 'run-1',
      from: 'AGENT',
      payload: { stepResult: { reason: 'stop' }, output: { usage: { inputTokens: 1, outputTokens: 2 } } },
    };
    type ProcessorArgs = Parameters<NonNullable<typeof processor.processOutputStream>>[0];
    const run = async (part: typeof delta | typeof finish) =>
      processor.processOutputStream?.({ part, streamParts: [], state, abort: () => undefined } as unknown as ProcessorArgs);
    await run(delta);
    const out = await run(finish);
    if (!out || typeof out !== 'object' || !('type' in out)) throw new Error('processor returned no chunk');
    return { type: String(out.type), payload: 'payload' in out ? out.payload : undefined };
  }

  it('reaches the completed event for an investment answer and not for a plain one', async () => {
    const investment = await finishThroughProcessor('A balanced allocation could look like this.');
    const plain = await finishThroughProcessor('You hold three assets and no fiscal flags are open.');

    expect(completedOf(applyChunk(investment, context(resolvedDraft()))).disclaimer).toBe(true);
    expect(completedOf(applyChunk(plain, context(resolvedDraft()))).disclaimer).toBe(false);
  });
});

describe('applyChunk — incomplete-figures flag on the completed event', () => {
  const incompleteSummary = {
    kind: 'ok',
    payload: { metrics: { ratesIncomplete: true, pricesIncomplete: false } },
  };
  const completeSummary = {
    kind: 'ok',
    payload: { metrics: { ratesIncomplete: false, pricesIncomplete: false } },
  };

  function toolResult(toolName: string, result: unknown): StreamChunkLike {
    return { type: 'tool-result', payload: { toolCallId: `call-${toolName}`, toolName, result } };
  }

  it('is true once a real tool result reported incomplete figures', () => {
    const ctx = context(resolvedDraft());
    applyChunk(toolResult('portfolio_summary', incompleteSummary), ctx);

    expect(completedOf(applyChunk(finishChunk(), ctx)).figuresIncomplete).toBe(true);
  });

  it('is true when the incomplete result arrives wrapped in a sub-agent tool-output chunk', () => {
    const ctx = context(resolvedDraft());
    applyChunk(
      {
        type: 'tool-output',
        payload: { toolCallId: 'outer', toolName: 'agent-taxAnalyst', output: toolResult('kpis', { kind: 'ok', payload: { pricesIncomplete: true } }) },
      },
      ctx,
    );

    expect(completedOf(applyChunk(finishChunk(), ctx)).figuresIncomplete).toBe(true);
  });

  it('is false when every tool result was complete, or no tool ran', () => {
    const ctx = context(resolvedDraft());
    applyChunk(toolResult('portfolio_summary', completeSummary), ctx);
    expect(completedOf(applyChunk(finishChunk(), ctx)).figuresIncomplete).toBe(false);

    expect(completedOf(applyChunk(finishChunk(), context(resolvedDraft()))).figuresIncomplete).toBe(false);
  });

  it('stays true for the rest of the run after a later complete result', () => {
    const ctx = context(resolvedDraft());
    applyChunk(toolResult('portfolio_summary', incompleteSummary), ctx);
    applyChunk(toolResult('kpis', { kind: 'ok', payload: { ratesIncomplete: false, pricesIncomplete: false } }), ctx);

    expect(completedOf(applyChunk(finishChunk(), ctx)).figuresIncomplete).toBe(true);
  });

  it('ignores a result that belongs to no real tool (the delegation call itself)', () => {
    const ctx = context(resolvedDraft());
    applyChunk(toolResult('agent-taxAnalyst', incompleteSummary), ctx);

    expect(completedOf(applyChunk(finishChunk(), ctx)).figuresIncomplete).toBe(false);
  });

  it('never reaches the audit receipt', () => {
    const ctx = context(resolvedDraft());
    applyChunk(toolResult('portfolio_summary', incompleteSummary), ctx);

    const event = completedOf(applyChunk(finishChunk({ disclaimer: 'x' }), ctx));

    expect(Object.keys(event.receipt)).not.toContain('figuresIncomplete');
    expect(Object.keys(event.receipt)).not.toContain('disclaimer');
  });
});
