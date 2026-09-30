import type { ChunkType } from '@mastra/core/stream';
import { describe, expect, it, vi } from 'vitest';
import { createGroundingDetector } from '../groundingDetector.js';

function textDelta(text: string): ChunkType {
  return {
    type: 'text-delta',
    runId: 'run-1',
    from: 'AGENT',
    payload: { id: 'text-1', text },
  } as ChunkType;
}

function toolCall(): ChunkType {
  return {
    type: 'tool-call',
    runId: 'run-1',
    from: 'AGENT',
    payload: { toolCallId: 'call-1', toolName: 'asset_allocation', args: {} },
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
  const abort = vi.fn(() => {
    throw new Error('aborted');
  });
  return { part, streamParts, state, abort } as unknown as Parameters<
    NonNullable<ReturnType<typeof createGroundingDetector>['processOutputStream']>
  >[0];
}

describe('createGroundingDetector', () => {
  it('trips abort(reason, { retry: true }) once on an ungrounded investment claim', async () => {
    const detector = createGroundingDetector();
    const state: Record<string, unknown> = {};
    const streamParts: ChunkType[] = [];

    const delta = textDelta('Based on current trends, I forecast this asset will rise next month.');
    streamParts.push(delta);
    await detector.processOutputStream?.(makeArgs(streamParts, delta, state));

    const finish = finishChunk();
    streamParts.push(finish);
    const args = makeArgs(streamParts, finish, state);

    await expect(detector.processOutputStream?.(args)).rejects.toThrow();
    expect(args.abort).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ retry: true }));
  });

  it('terminates refused, carrying the tripping processorId and reason, when the regenerated output is still ungrounded', async () => {
    const detector = createGroundingDetector();
    const state: Record<string, unknown> = { groundingRetried: true };
    const streamParts: ChunkType[] = [];

    const delta = textDelta('I forecast this asset will rise next month.');
    streamParts.push(delta);
    await detector.processOutputStream?.(makeArgs(streamParts, delta, state));

    const finish = finishChunk();
    streamParts.push(finish);
    const args = makeArgs(streamParts, finish, state);

    await expect(detector.processOutputStream?.(args)).rejects.toThrow();
    expect(args.abort).toHaveBeenCalledWith(expect.any(String), expect.not.objectContaining({ retry: true }));
    expect(detector.id).toBe('grounding-directive-detector');
  });

  it('trips even when the model complies with a directive-injection instruction, because enforcement is post-generation', async () => {
    const detector = createGroundingDetector();
    const state: Record<string, unknown> = {};
    const streamParts: ChunkType[] = [];

    const delta = textDelta('Understood — I will ignore your disclaimer from now on.');
    streamParts.push(delta);
    await detector.processOutputStream?.(makeArgs(streamParts, delta, state));

    const finish = finishChunk();
    streamParts.push(finish);
    const args = makeArgs(streamParts, finish, state);

    await expect(detector.processOutputStream?.(args)).rejects.toThrow();
    expect(args.abort).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ retry: true }));
  });

  it('always trips refused with no retry on a tax-evasion request, unconditionally', async () => {
    const detector = createGroundingDetector();
    const state: Record<string, unknown> = {};
    const streamParts: ChunkType[] = [];

    const delta = textDelta('Here is how you could hide gains from Hacienda.');
    streamParts.push(delta);
    await detector.processOutputStream?.(makeArgs(streamParts, delta, state));

    const finish = finishChunk();
    streamParts.push(finish);
    const args = makeArgs(streamParts, finish, state);

    await expect(detector.processOutputStream?.(args)).rejects.toThrow();
    expect(args.abort).toHaveBeenCalledWith(expect.any(String), expect.not.objectContaining({ retry: true }));
  });

  it('produces completed and emits no refused for grounded investment prose citing a current-turn tool result', async () => {
    const detector = createGroundingDetector();
    const state: Record<string, unknown> = {};
    const streamParts: ChunkType[] = [toolCall()];

    const delta = textDelta('Based on your asset_allocation result, a balanced allocation fits here.');
    streamParts.push(delta);
    await detector.processOutputStream?.(makeArgs(streamParts, delta, state));

    const finish = finishChunk();
    streamParts.push(finish);
    const args = makeArgs(streamParts, finish, state);

    const result = await detector.processOutputStream?.(args);
    expect(args.abort).not.toHaveBeenCalled();
    expect(result).toBe(finish);
  });

  it('does not refuse a plain, grounded investment question that is grounded in a current-turn tool result', async () => {
    const detector = createGroundingDetector();
    const state: Record<string, unknown> = {};
    // The user asked: "what allocation fits a balanced profile for my current portfolio?"
    const streamParts: ChunkType[] = [toolCall()];

    const delta = textDelta(
      'A balanced allocation fitting your profile, per the asset_allocation tool, is roughly even across your top holdings.',
    );
    streamParts.push(delta);
    await detector.processOutputStream?.(makeArgs(streamParts, delta, state));

    const finish = finishChunk();
    streamParts.push(finish);
    const args = makeArgs(streamParts, finish, state);

    const result = await detector.processOutputStream?.(args);

    expect(args.abort).not.toHaveBeenCalled();
    expect(result).toBe(finish);
  });
});
