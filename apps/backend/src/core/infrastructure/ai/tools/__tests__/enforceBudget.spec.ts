import { describe, it, expect } from 'vitest';
import { enforceBudget, createRunBudgetTracker } from '../enforceBudget.js';

describe('enforceBudget', () => {
  it('passes an under-budget payload through unchanged', () => {
    const payload = { a: 1, b: 'short' };
    const result = enforceBudget(payload, 1000);

    expect(result).toEqual({ kind: 'ok', payload });
  });

  it('returns a payload exactly at the budget as ok (boundary is inclusive)', () => {
    const payload = { x: 'y' };
    const maxChars = JSON.stringify(payload).length;

    expect(enforceBudget(payload, maxChars)).toEqual({ kind: 'ok', payload });
  });

  it('returns a truncated result naming what was dropped, never the oversized payload, when over budget', () => {
    const payload = { holdings: Array.from({ length: 50 }, (_, i) => ({ id: `asset-${i}`, value: '123.45' })) };
    const actualChars = JSON.stringify(payload).length;

    const result = enforceBudget(payload, 100);

    expect(result.kind).toBe('truncated');
    expect(result).toEqual({ kind: 'truncated', maxChars: 100, actualChars });
    expect(JSON.stringify(result)).not.toContain('asset-0');
    expect('payload' in result).toBe(false);
  });

  it('measures via JSON.stringify(payload).length, not a token count', () => {
    // A payload whose JSON encoding is under budget in characters but would tokenize very
    // differently — proves the gate is character-based, deterministic, and tokenizer-free.
    const payload = { emoji: '🚀🚀🚀🚀🚀' };
    const maxChars = JSON.stringify(payload).length;

    expect(enforceBudget(payload, maxChars).kind).toBe('ok');
    expect(enforceBudget(payload, maxChars - 1).kind).toBe('truncated');
  });
});

describe('createRunBudgetTracker (run-wide cap)', () => {
  it('an unbounded tracker (metered/mixed profile) never truncates, however many calls accumulate', () => {
    const tracker = createRunBudgetTracker({ kind: 'unbounded' });

    for (let i = 0; i < 20; i++) {
      expect(tracker.consume(10_000)).toBe(true);
    }
  });

  it('a bounded tracker (local profile) stays ok while the running total is within the cap', () => {
    const tracker = createRunBudgetTracker({ kind: 'bounded', maxChars: 100 });

    expect(tracker.consume(40)).toBe(true);
    expect(tracker.consume(40)).toBe(true);
  });

  it('a bounded tracker flips to over-budget once the running total exceeds the cap, independent of any single call size', () => {
    const tracker = createRunBudgetTracker({ kind: 'bounded', maxChars: 100 });

    expect(tracker.consume(40)).toBe(true);
    expect(tracker.consume(40)).toBe(true);
    expect(tracker.consume(40)).toBe(false);
  });

  it('enforceBudget truncates once the run-wide tracker is exceeded, even when the call itself is under its own per-tool maxChars', () => {
    const smallPayload = { a: 1 }; // JSON.stringify(...) is 7 chars
    const perToolMaxChars = 1000;
    const tracker = createRunBudgetTracker({ kind: 'bounded', maxChars: 15 });

    const first = enforceBudget(smallPayload, perToolMaxChars, tracker); // running total 7
    expect(first.kind).toBe('ok');

    const second = enforceBudget(smallPayload, perToolMaxChars, tracker); // running total 14
    expect(second.kind).toBe('ok');

    const third = enforceBudget(smallPayload, perToolMaxChars, tracker); // running total 21 > 15
    expect(third.kind).toBe('truncated');
  });

  it('with no tracker passed at all, only the per-tool maxChars applies (metered call sites unaffected)', () => {
    const payload = { a: 1 };
    expect(enforceBudget(payload, 1000).kind).toBe('ok');
  });
});
