import { describe, it, expect } from 'vitest';
import { FIFO_QUALITY_FLAGS, FLAG_SEVERITY } from '@kryptofolio/shared-types';
import {
  buildFiscalIntegrityToolResult,
  fiscalIntegrityToolOutputSchema,
} from '../fiscalIntegrityTool.js';
import { buildFiscalIntegrityFixture } from './fixtures/fiscalIntegrityFixture.js';
import type { FiscalIntegrityReport } from '../../../../application/use-cases/GetFiscalIntegrityUseCase.js';

const CONFIG = { maxChars: 6000 };

/**
 * The real `GetFiscalIntegrityUseCase` groups strictly by `quality_flag` (one group per flag, at
 * most `FIFO_QUALITY_FLAGS.length` — 9 today), so it can never itself produce more than 10 groups —
 * a real 9-group report can never actually exercise the top-10 cap. This
 * synthetic 15-"group" report — a hand-built shape the tool's pure projection function accepts
 * regardless of where it came from — exists only to prove the cap genuinely truncates rather than
 * happening to already be under the limit, which a hand-written fixture will always fit.
 */
function buildOversizedFiscalIntegrityFixture(): FiscalIntegrityReport {
  const groups = Array.from({ length: 15 }, (_, i) => {
    const flag = FIFO_QUALITY_FLAGS[i % FIFO_QUALITY_FLAGS.length]!;
    const count = 100 - i; // strictly descending, so the top-10 slice is unambiguous
    return {
      quality_flag: flag,
      severity: FLAG_SEVERITY[flag],
      count,
      pendingReview: 0,
      rows: [],
    };
  });

  return {
    groups,
    totalDefects: groups.reduce((sum, g) => sum + g.count, 0),
    pendingReview: 0,
    needsRecalculation: false,
  };
}

describe('fiscal_integrity tool', () => {
  it('groups by every FIFO_QUALITY_FLAG and ranks the top 10 groups by count', () => {
    const report = buildFiscalIntegrityFixture();

    const result = buildFiscalIntegrityToolResult(report, CONFIG);

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') throw new Error('expected ok');
    expect(report.groups).toHaveLength(FIFO_QUALITY_FLAGS.length);
    expect(result.payload.groups.length).toBeLessThanOrEqual(10);
    expect(result.payload.groups[0]!.count).toBeGreaterThanOrEqual(result.payload.groups.at(-1)!.count);
    expect(result.payload.totalDefects).toBe(report.totalDefects);

    expect(() => fiscalIntegrityToolOutputSchema.parse(result)).not.toThrow();
  });

  it('never carries a per-transaction row', () => {
    const report = buildFiscalIntegrityFixture();

    const result = buildFiscalIntegrityToolResult(report, CONFIG);

    if (result.kind !== 'ok') throw new Error('expected ok');
    for (const group of result.payload.groups) {
      expect(group).not.toHaveProperty('rows');
      expect(JSON.stringify(group)).not.toContain('tx_id');
    }
  });

  it('rejects an outputSchema payload carrying a field not declared in the schema', () => {
    const report = buildFiscalIntegrityFixture();
    const result = buildFiscalIntegrityToolResult(report, CONFIG);
    if (result.kind !== 'ok') throw new Error('expected ok');

    const withExtraField = { ...result, payload: { ...result.payload, unexpectedField: 'nope' } };

    expect(() => fiscalIntegrityToolOutputSchema.parse(withExtraField)).toThrow();
  });

  it('genuinely truncates to the top 10 groups by count when more than 10 exist, dropping the lowest-count groups', () => {
    const report = buildOversizedFiscalIntegrityFixture();

    const result = buildFiscalIntegrityToolResult(report, CONFIG);

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') throw new Error('expected ok');
    expect(report.groups.length).toBe(15);
    expect(result.payload.groups).toHaveLength(10);
    // Strictly descending counts 100..86 in the fixture — the kept groups must be exactly 100..91.
    expect(result.payload.groups.map((g) => g.count)).toEqual([100, 99, 98, 97, 96, 95, 94, 93, 92, 91]);
  });

  it('never carries a rows field even on the oversized synthetic report', () => {
    const report = buildOversizedFiscalIntegrityFixture();

    const result = buildFiscalIntegrityToolResult(report, CONFIG);

    if (result.kind !== 'ok') throw new Error('expected ok');
    for (const group of result.payload.groups) {
      expect(group).not.toHaveProperty('rows');
    }
  });
});
