/**
 * The SQLite reconciliation is a full set difference, so running it against a chain not rebuilt
 * in the same run retires valid rows — on one boot it soft-deleted every derived row of the real
 * ledger. The pipeline therefore has one owner (design D4a): nothing but FifoChainFreshnessService
 * may call the reconciliation, and the reconciler itself may not decide whether work is pending.
 * Structural, because the defect was a call site, and a call site is what must stay impossible.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC_ROOT = path.resolve(import.meta.dirname, '../../../..');
const OWNER = path.join(SRC_ROOT, 'core/application/services/FifoChainFreshnessService.ts');
const RECONCILER = path.join(SRC_ROOT, 'core/application/services/FifoMaterializerService.ts');

function productionFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : productionFiles(full);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts') ? [full] : [];
  });
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

describe('derived-state pipeline ownership', () => {
  it('no production file other than the freshness service invokes the reconciliation', () => {
    const offenders = productionFiles(SRC_ROOT)
      .filter((file) => file !== OWNER && file !== RECONCILER)
      .filter((file) => /\.recalculate\s*\(/.test(stripComments(fs.readFileSync(file, 'utf8'))))
      .map((file) => path.relative(SRC_ROOT, file));

    expect(offenders).toEqual([]);
  });

  it('the reconciler neither reads nor writes the pending-work flag', () => {
    const source = stripComments(fs.readFileSync(RECONCILER, 'utf8'));
    expect(source).not.toMatch(/needs_recalculation/);
    expect(source).not.toMatch(/getSetting|setSetting/);
  });

  it('only the freshness service clears the pending-work flag', () => {
    const clearing = /setSetting\(\s*['"A-Z_a-z.]*(?:needs_recalculation|NEEDS_RECALCULATION[A-Z_]*)['"]?\s*,\s*['"]false['"]/;
    const offenders = productionFiles(SRC_ROOT)
      .filter((file) => file !== OWNER)
      .filter((file) => clearing.test(stripComments(fs.readFileSync(file, 'utf8'))))
      .map((file) => path.relative(SRC_ROOT, file));

    expect(offenders).toEqual([]);
  });
});
