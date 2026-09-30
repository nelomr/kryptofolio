import { describe, it, expect } from 'vitest';
import { resolveExecutionProfile } from '../../models/resolveExecutionProfile.js';
import {
  buildFiscalIntegrityRowsToolResult,
  fiscalIntegrityRowsToolInputSchema,
  fiscalIntegrityRowsToolOutputSchema,
} from '../fiscalIntegrityRowsTool.js';
import { buildFiscalIntegrityFixture } from './fixtures/fiscalIntegrityFixture.js';

// Large enough that the budget gate never trips here — this file tests pagination in isolation.
const CONFIG = { rowsPageSize: 25, maxChars: 20000 };

describe('fiscal_integrity_rows tool', () => {
  it('paginates the matching group\'s own rows field, with page/pageSize/totalPages/totalCount over the full set', () => {
    const report = buildFiscalIntegrityFixture();
    const targetGroup = report.groups[0]!;

    const result = buildFiscalIntegrityRowsToolResult(report, targetGroup.quality_flag, 0, CONFIG);

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') throw new Error('expected ok');
    expect(result.payload.totalCount).toBe(targetGroup.rows.length);
    expect(result.payload.pageSize).toBe(25);
    expect(result.payload.page).toBe(0);
    expect(result.payload.totalPages).toBe(Math.ceil(targetGroup.rows.length / 25));
    expect(result.payload.rows.length).toBeLessThanOrEqual(25);
    expect(() => fiscalIntegrityRowsToolOutputSchema.parse(result)).not.toThrow();
  });

  it('a later page returns the remaining rows, not the first page again', () => {
    const report = buildFiscalIntegrityFixture();
    const targetGroup = report.groups[0]!;

    const page0 = buildFiscalIntegrityRowsToolResult(report, targetGroup.quality_flag, 0, CONFIG);
    const page1 = buildFiscalIntegrityRowsToolResult(report, targetGroup.quality_flag, 1, CONFIG);

    if (page0.kind !== 'ok' || page1.kind !== 'ok') throw new Error('expected ok');
    expect(page1.payload.rows[0]?.tx_id).not.toBe(page0.payload.rows[0]?.tx_id);
  });

  it('inputSchema requires qualityFlag, defaults page to 0', () => {
    expect(() => fiscalIntegrityRowsToolInputSchema.parse({})).toThrow();
    const parsed = fiscalIntegrityRowsToolInputSchema.parse({ qualityFlag: 'MISSING_PRICE' });
    expect(parsed.page).toBe(0);
    expect(() =>
      fiscalIntegrityRowsToolInputSchema.parse({ qualityFlag: 'MISSING_PRICE', page: 1 }),
    ).not.toThrow();
  });

  describe('page size follows the execution profile the run resolved', () => {
    const local = [{ providerId: 'ollama' as const, modelId: 'llama', contextWindow: 8192 }];
    const metered = [{ providerId: 'openai' as const, modelId: 'gpt', apiKey: 'sk-x' }];
    const mixed = [...local, ...metered];

    it.each([
      ['a metered chain', metered, 25],
      ['a mixed chain', mixed, 25],
      ['a local chain', local, 100],
    ])('%s pages at its profile row size', (_label, chain, expectedPageSize) => {
      const report = buildFiscalIntegrityFixture();
      const config = { maxChars: 1_000_000, rowsPageSize: resolveExecutionProfile(chain).settings.rowsPageSize };

      const result = buildFiscalIntegrityRowsToolResult(report, report.groups[0]!.quality_flag, 0, config);

      if (result.kind !== 'ok') throw new Error('expected ok');
      expect(result.payload.pageSize).toBe(expectedPageSize);
      expect(result.payload.rows.length).toBeLessThanOrEqual(expectedPageSize);
    });
  });
});
