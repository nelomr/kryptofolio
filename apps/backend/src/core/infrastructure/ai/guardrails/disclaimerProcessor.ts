import type { ChunkType } from '@mastra/core/stream';
import type { OutputProcessor, ProcessOutputStreamArgs } from '@mastra/core/processors';
import { mentionsInvestmentClaim } from './investmentContentPatterns.js';
import { appendToBuffer, readBuffer } from './outputBuffer.js';

/**
 * The one disclaimer string, appended structurally rather than left for the model to remember to
 * write. The UI renders it as a distinct footer — never inline in the answer text — so
 * this processor's job is only to carry it on the terminal chunk's payload, not to weave it into the
 * streamed prose.
 */
export const DISCLAIMER_TEXT =
  'This is not financial advice. It is a grounded projection from your own portfolio data, not a recommendation.';

function textOf(chunk: ChunkType): string | undefined {
  if (chunk.type !== 'text-delta') return undefined;
  const payload: unknown = (chunk as { payload?: unknown }).payload;
  if (typeof payload !== 'object' || payload === null) return undefined;
  const text = (payload as { text?: unknown }).text;
  return typeof text === 'string' ? text : undefined;
}

/**
 * The disclaimer output processor: structurally appends `DISCLAIMER_TEXT` to the terminal `finish`
 * chunk's payload whenever the run's accumulated output text touches an investment category, and
 * leaves the payload untouched otherwise. It never mutates a `text-delta` chunk, so the disclaimer
 * can never be mistaken for the model's own words.
 */
export function createDisclaimerProcessor(): OutputProcessor {
  return {
    id: 'investment-disclaimer',
    async processOutputStream(args: ProcessOutputStreamArgs) {
      const { part, state } = args;

      const delta = textOf(part);
      if (delta !== undefined) {
        appendToBuffer(state, delta);
      }

      if (part.type !== 'finish') {
        return part;
      }

      const buffer = readBuffer(state);
      if (!mentionsInvestmentClaim(buffer)) {
        return part;
      }

      return { ...part, payload: { ...part.payload, disclaimer: DISCLAIMER_TEXT } };
    },
  };
}
