/**
 * Materializing the FIFO chain moves rows from a view to a table entirely on the SQL side
 * (design D3, rule 4 boundary note) — it must introduce no new place where money crosses
 * into TypeScript. The domain never imports `decimal.js`, and money stays `PreciseAmount`
 * (a branded string), not a JS `number`, anywhere under `core/domain`.
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

describe('core/domain has no new money boundary after materialization', () => {
  it('imports no decimal arithmetic library', () => {
    const domainDir = path.join(import.meta.dirname, '..');
    const offenders = collectTsFiles(domainDir).filter((file) =>
      /from\s+['"]decimal\.js['"]|require\(\s*['"]decimal\.js['"]\s*\)/.test(
        fs.readFileSync(file, 'utf-8'),
      ),
    );
    expect(offenders).toEqual([]);
  });
});
