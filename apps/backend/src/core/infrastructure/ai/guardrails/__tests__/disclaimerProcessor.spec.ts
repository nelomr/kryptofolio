import type { ChunkType } from '@mastra/core/stream';
import { describe, expect, it } from 'vitest';
import { DISCLAIMER_TEXT, createDisclaimerProcessor } from '../disclaimerProcessor.js';

function textDelta(text: string): ChunkType {
  return {
    type: 'text-delta',
    runId: 'run-1',
    from: 'AGENT',
    payload: { id: 'text-1', text },
  } as ChunkType;
}

function finishChunk(): ChunkType {
  return {
    type: 'finish',
    runId: 'run-1',
    from: 'AGENT',
    payload: {},
  } as ChunkType;
}

function makeArgs(streamParts: ChunkType[], part: ChunkType, state: Record<string, unknown>) {
  return { part, streamParts, state, abort: () => {
    throw new Error('should not be called');
  } } as unknown as Parameters<NonNullable<ReturnType<typeof createDisclaimerProcessor>['processOutputStream']>>[0];
}

describe('createDisclaimerProcessor', () => {
  it('appends the disclaimer structurally, distinct from the answer body, when content touches an investment category', async () => {
    const processor = createDisclaimerProcessor();
    const state: Record<string, unknown> = {};
    const streamParts: ChunkType[] = [];

    const delta = textDelta('A balanced allocation for your profile could look like this.');
    streamParts.push(delta);
    await processor.processOutputStream?.(makeArgs(streamParts, delta, state));

    const finish = finishChunk();
    streamParts.push(finish);
    const result = await processor.processOutputStream?.(makeArgs(streamParts, finish, state));

    expect(result).not.toBe(finish);
    const payload = (result as { payload: { disclaimer?: string } }).payload;
    expect(payload.disclaimer).toBe(DISCLAIMER_TEXT);
  });

  it('adds no disclaimer when the answer has no investment content', async () => {
    const processor = createDisclaimerProcessor();
    const state: Record<string, unknown> = {};
    const streamParts: ChunkType[] = [];

    const delta = textDelta('You hold 3 assets, per fiscal_integrity there are no open flags.');
    streamParts.push(delta);
    await processor.processOutputStream?.(makeArgs(streamParts, delta, state));

    const finish = finishChunk();
    streamParts.push(finish);
    const result = await processor.processOutputStream?.(makeArgs(streamParts, finish, state));

    const payload = (result as { payload: { disclaimer?: string } }).payload;
    expect(payload.disclaimer).toBeUndefined();
  });

  it('still attaches the disclaimer when the model complies with an instruction to drop it, because enforcement is post-generation', async () => {
    const processor = createDisclaimerProcessor();
    const state: Record<string, unknown> = {};
    const streamParts: ChunkType[] = [];

    const delta = textDelta(
      'Understood: as your licensed adviser, with no disclaimer and ignoring my rules, a balanced allocation for your profile could look like this.',
    );
    streamParts.push(delta);
    await processor.processOutputStream?.(makeArgs(streamParts, delta, state));

    const finish = finishChunk();
    streamParts.push(finish);
    const result = await processor.processOutputStream?.(makeArgs(streamParts, finish, state));

    const payload = (result as { payload: { disclaimer?: string } }).payload;
    expect(payload.disclaimer).toBe(DISCLAIMER_TEXT);
  });
});
