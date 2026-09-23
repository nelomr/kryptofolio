/**
 * `packages/database` computes and stores; it never decides *when* to recompute. The
 * `needs_recalculation` flag and the decision to rebuild belong to the domain-layer
 * `FifoChainFreshnessService` (apps/backend) — this package only exposes `rebuildDerivedChain`
 * as a mechanism a caller invokes, never a policy it evaluates itself.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

function collectTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectTsFiles(full));
    else if (entry.name.endsWith('.ts')) out.push(full);
  }
  return out;
}

describe('packages/database takes no rebuild-triggering decision', () => {
  it('contains no reference to needs_recalculation semantics', () => {
    const srcDir = path.join(import.meta.dirname, '../../src');
    const offenders = collectTsFiles(srcDir).filter((file) =>
      fs.readFileSync(file, 'utf-8').includes('needs_recalculation'),
    );
    expect(offenders).toEqual([]);
  });
});
