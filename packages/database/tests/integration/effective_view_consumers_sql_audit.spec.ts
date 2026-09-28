/**
 * SQL-text audit (design.md D5, task 6.7): no consumer of `ledger.spot_transactions` remains
 * outside `v_effective_spot_transactions`'s own definition, except one deliberate, documented
 * exception. A regression here means a new or edited view started reading the raw table again,
 * silently losing override-awareness.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

const ADAPTER_PATH = path.resolve(
  import.meta.dirname,
  '../../src/adapters/DuckDbAdapter.ts',
);

describe('ledger.spot_transactions has exactly one non-view, documented direct reader', () => {
  it('every "ledger.spot_transactions" occurrence is the view definition, a comment, or the documented exception', () => {
    const source = fs.readFileSync(ADAPTER_PATH, 'utf-8');
    const lines = source.split('\n');
    const offenders: { line: number; text: string }[] = [];

    lines.forEach((text, index) => {
      if (!text.includes('ledger.spot_transactions')) return;
      const trimmed = text.trim();
      const isComment = trimmed.startsWith('--') || trimmed.startsWith('//') || trimmed.startsWith('*');
      const isViewsOwnDefinition = text.includes('FROM ledger.spot_transactions st');
      const isDocumentedExternalLotsException = text.includes(
        'LEFT JOIN ledger.spot_transactions st ON tl.spot_transaction_id = st.id',
      );
      if (isComment || isViewsOwnDefinition || isDocumentedExternalLotsException) return;
      offenders.push({ line: index + 1, text: trimmed });
    });

    expect(offenders).toEqual([]);
  });

  it('the one documented exception carries its own explanatory comment immediately above it', () => {
    const source = fs.readFileSync(ADAPTER_PATH, 'utf-8');
    const marker = 'LEFT JOIN ledger.spot_transactions st ON tl.spot_transaction_id = st.id';
    const idx = source.indexOf(marker);
    expect(idx).toBeGreaterThan(-1);
    const before = source.slice(Math.max(0, idx - 700), idx);
    expect(before).toMatch(/Deliberately NOT re-pointed/);
  });
});
