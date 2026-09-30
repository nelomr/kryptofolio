import type { ChunkType } from '@mastra/core/stream';
import type { OutputProcessor, ProcessOutputStreamArgs } from '@mastra/core/processors';
import {
  mentionsDirectiveInjection,
  mentionsInvestmentClaim,
  mentionsTaxEvasion,
} from './investmentContentPatterns.js';
import { appendToBuffer, readBuffer } from './outputBuffer.js';

export interface GroundingTripwireMetadata {
  readonly category: 'ungrounded-investment-claim' | 'directive-injection' | 'tax-evasion';
}

function textOf(chunk: ChunkType): string | undefined {
  if (chunk.type !== 'text-delta') return undefined;
  const payload: unknown = (chunk as { payload?: unknown }).payload;
  if (typeof payload !== 'object' || payload === null) return undefined;
  const text = (payload as { text?: unknown }).text;
  return typeof text === 'string' ? text : undefined;
}

function hasCurrentTurnToolActivity(streamParts: readonly ChunkType[]): boolean {
  return streamParts.some((part) => part.type === 'tool-call' || part.type === 'tool-result');
}

/**
 * A deterministic guardrail for Phase 0: a `Processor` that scans the accumulated output text
 * on the terminal `finish` chunk. Ungrounded investment claims and directive-injection attempts share
 * one retry-then-refuse budget, tracked in `args.state` (which Mastra persists across chunks within
 * one run, per the installed `.d.ts`); a tax-evasion request always trips unconditionally, with no
 * retry, regardless of that budget.
 */
export function createGroundingDetector(): OutputProcessor {
  return {
    id: 'grounding-directive-detector',
    async processOutputStream(args: ProcessOutputStreamArgs<GroundingTripwireMetadata>) {
      const { part, state, abort, streamParts } = args;

      const delta = textOf(part);
      if (delta !== undefined) {
        appendToBuffer(state, delta);
      }

      if (part.type !== 'finish') {
        return part;
      }

      const buffer = readBuffer(state);

      if (mentionsTaxEvasion(buffer)) {
        return abort('This request asks how to evade or hide taxable gains, which this advisor never assists with.', {
          retry: false,
          metadata: { category: 'tax-evasion' },
        });
      }

      const groundable = mentionsInvestmentClaim(buffer) || mentionsDirectiveInjection(buffer);
      if (!groundable) {
        return part;
      }

      const grounded = mentionsInvestmentClaim(buffer) && hasCurrentTurnToolActivity(streamParts);
      if (grounded && !mentionsDirectiveInjection(buffer)) {
        return part;
      }

      const category: GroundingTripwireMetadata['category'] = mentionsDirectiveInjection(buffer)
        ? 'directive-injection'
        : 'ungrounded-investment-claim';
      const reason =
        category === 'directive-injection'
          ? 'The output attempted to override the guardrail or disclaimer instructions.'
          : 'This investment claim is not grounded in a tool result produced in the current turn.';

      const alreadyRetried = state.groundingRetried === true;
      if (alreadyRetried) {
        return abort(reason, { retry: false, metadata: { category } });
      }

      state.groundingRetried = true;
      return abort(reason, { retry: true, metadata: { category } });
    },
  };
}
