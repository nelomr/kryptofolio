import { describe, it, expect } from 'vitest';
import { Memory } from '@mastra/memory';
import { LibSQLStore } from '@mastra/libsql';
import { MastraLanguageModelV2Mock } from '@mastra/core/test-utils/llm-mock';
import { RequestContext } from '@mastra/core/request-context';
import { buildAdvisorAgent } from '../advisor.js';
import { buildTaxAnalystAgent } from '../taxAnalyst.js';
import type { AdvisorRequestContextValues } from '../../advisorRequestContext.js';

/**
 * Deterministic delegation with one active sub-agent: with only `taxAnalyst` registered,
 * `advisor` must resolve a request answerable through its tools without an *additional* model call
 * dedicated to choosing among sub-agents. Asserted on the model provider double's own call count —
 * never wall-clock timing, which proves nothing about whether an extra hop happened.
 */
describe('deterministic delegation with one active sub-agent', () => {
  it("resolves through taxAnalyst's tools with exactly the two model calls a normal tool-call loop needs — decide, then finalize — never a third call spent choosing among sub-agents", async () => {
    let advisorCallCount = 0;

    const taxAnalystModel = new MastraLanguageModelV2Mock({
      doGenerate: async () => ({
        content: [{ type: 'text', text: 'Your biggest position is `BTC` at `10000.00 EUR`.' }],
        finishReason: 'stop',
        usage: { inputTokens: 10, outputTokens: 10, totalTokens: 20 },
        warnings: [],
      }),
    });

    const advisorModel = new MastraLanguageModelV2Mock({
      doGenerate: async (options) => {
        advisorCallCount += 1;
        if (advisorCallCount === 1) {
          const delegateTool = options.tools?.[0];
          if (!delegateTool) throw new Error('no delegate tool offered to the supervisor');
          return {
            content: [
              {
                type: 'tool-call' as const,
                toolCallId: 'call-1',
                toolName: delegateTool.name,
                input: JSON.stringify({ prompt: "what's my biggest position?" }),
              },
            ],
            finishReason: 'tool-calls' as const,
            usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
            warnings: [],
          };
        }
        return {
          content: [{ type: 'text' as const, text: 'Your biggest position is `BTC` at `10000.00 EUR`.' }],
          finishReason: 'stop' as const,
          usage: { inputTokens: 20, outputTokens: 10, totalTokens: 30 },
          warnings: [],
        };
      },
    });

    const taxAnalyst = buildTaxAnalystAgent({}, taxAnalystModel);
    const memory = new Memory({ storage: new LibSQLStore({ id: 'test-advisor-memory', url: ':memory:' }) });
    const advisor = buildAdvisorAgent({ model: advisorModel, memory, taxAnalyst });

    const requestContext = new RequestContext<AdvisorRequestContextValues>([
      ['locale', 'en'],
      ['baseCurrency', 'EUR'],
    ]);

    const result = await advisor.generate("what's my biggest position?", {
      requestContext,
      maxSteps: 5,
      memory: { thread: 'thread-1', resource: 'local' },
    });

    expect(result.text).toContain('BTC');
    // Only one candidate is registered — the first call's own offered tool set already proves
    // there was nothing to choose among.
    expect(advisorModel.doGenerateCalls[0]?.tools).toHaveLength(1);
    // Exactly two: the delegation decision, then relaying taxAnalyst's answer. A third call here
    // would mean an extra hop was spent deciding *which* sub-agent to use — exactly the overhead
    // a second LLM-mediated routing call would add.
    expect(advisorModel.doGenerateCalls.length).toBe(2);
    expect(taxAnalystModel.doGenerateCalls.length).toBe(1);
  });
});
