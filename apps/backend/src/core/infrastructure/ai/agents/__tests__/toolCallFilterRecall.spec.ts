import { describe, it, expect } from 'vitest';
import { Memory } from '@mastra/memory';
import { LibSQLStore } from '@mastra/libsql';
import { MastraLanguageModelV2Mock } from '@mastra/core/test-utils/llm-mock';
import { RequestContext } from '@mastra/core/request-context';
import { buildAdvisorAgent } from '../advisor.js';
import { buildTaxAnalystAgent } from '../taxAnalyst.js';
import type { AdvisorRequestContextValues } from '../../advisorRequestContext.js';

/**
 * `ToolCallFilter` recall boundary: the current run's own delegate tool-call/tool-result
 * must stay visible to a later step of that same run, while a later turn on the same thread must not
 * be handed that raw pair again — only the delegate's own preserved textual conclusion.
 */
describe('ToolCallFilter preserves current-turn tool results and filters recalled ones', () => {
  it("keeps the current run's own tool-call/tool-result visible to the step that uses it, and hides that raw pair (while keeping the assistant's own prior text) from a follow-up turn on the same thread", async () => {
    const taxAnalystAnswer = 'Your biggest position is `BTC` at `10000.00 EUR`.';

    const taxAnalystModel = new MastraLanguageModelV2Mock({
      doGenerate: async () => ({
        content: [{ type: 'text', text: taxAnalystAnswer }],
        finishReason: 'stop',
        usage: { inputTokens: 10, outputTokens: 10, totalTokens: 20 },
        warnings: [],
      }),
    });

    let advisorCallCount = 0;
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
          content: [{ type: 'text' as const, text: taxAnalystAnswer }],
          finishReason: 'stop' as const,
          usage: { inputTokens: 20, outputTokens: 10, totalTokens: 30 },
          warnings: [],
        };
      },
    });

    const taxAnalyst = buildTaxAnalystAgent({}, taxAnalystModel, 'metered');
    const memory = new Memory({ storage: new LibSQLStore({ id: 'test-advisor-recall', url: ':memory:' }) });
    const advisor = buildAdvisorAgent({ model: advisorModel, memory, taxAnalyst });

    const requestContext = new RequestContext<AdvisorRequestContextValues>([
      ['locale', 'en'],
      ['baseCurrency', 'EUR'],
    ]);

    const threadMemory = { thread: 'advisor-thread-recall-1', resource: 'local' };

    const storedMessages = async () => {
      const { messages } = await memory.getContext({ threadId: threadMemory.thread, resourceId: threadMemory.resource });
      return messages;
    };
    const storedToolInvocations = async () =>
      (await storedMessages()).flatMap((message) =>
        typeof message.content === 'string'
          ? []
          : message.content.parts.flatMap((part) => (part.type === 'tool-invocation' ? [part.toolInvocation] : [])),
      );
    const storedAssistantTexts = async () =>
      (await storedMessages()).flatMap((message) =>
        message.role === 'assistant' && typeof message.content !== 'string'
          ? message.content.parts.flatMap((part) => (part.type === 'text' ? [part.text] : []))
          : [],
      );

    const turn1 = await advisor.generate("what's my biggest position?", {
      requestContext,
      maxSteps: 5,
      memory: threadMemory,
    });
    expect(turn1.text).toContain('BTC');
    expect(advisorModel.doGenerateCalls.length).toBe(2);

    const storedAfterTurn1 = await storedToolInvocations();
    // Storage is content storage, not a figures-free channel: the pair and the figure it carries persist in full.
    expect(storedAfterTurn1).toHaveLength(1);
    expect(storedAfterTurn1[0]).toMatchObject({
      toolCallId: 'call-1',
      state: 'result',
      args: { prompt: "what's my biggest position?" },
      result: { text: taxAnalystAnswer },
    });
    expect(await storedAssistantTexts()).toContain(taxAnalystAnswer);

    const sameRunFinalizeCall = advisorModel.doGenerateCalls[1];
    const sameRunPromptText = JSON.stringify(sameRunFinalizeCall?.prompt);
    // The tool call/result this exact run just produced must still reach the step that uses it.
    expect(sameRunPromptText).toContain('call-1');

    const turn2 = await advisor.generate('did anything change since then?', {
      requestContext,
      maxSteps: 5,
      memory: threadMemory,
    });
    expect(turn2.text).toBeTruthy();
    expect(advisorModel.doGenerateCalls.length).toBe(3);

    const followUpCall = advisorModel.doGenerateCalls[2];
    // The filter only shapes what is replayed; the record itself is unchanged by the follow-up turn.
    expect(await storedToolInvocations()).toEqual(storedAfterTurn1);
    const followUpPromptText = JSON.stringify(followUpCall?.prompt);
    // The raw prior-turn tool-call/tool-result pair must not be replayed into a later turn.
    expect(followUpPromptText).not.toContain('call-1');
    // The delegate's own prior textual conclusion must still survive, per `preserveModelOutput: true`.
    expect(followUpPromptText).toContain(taxAnalystAnswer);
  });
});
