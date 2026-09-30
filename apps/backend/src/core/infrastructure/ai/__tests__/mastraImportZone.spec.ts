import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const backendSrcDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const MASTRA_IMPORT_PATTERN = /from\s+['"]@mastra\//;

function listTsFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : listTsFiles(full);
    return entry.name.endsWith('.ts') ? [full] : [];
  });
}

/**
 * The Mastra import zone, superseding the original "only `MastraAdvisorAdapter.ts`" statement:
 * `@mastra/*` may be imported only from `core/infrastructure/ai/**` or `MastraAdvisorAdapter.ts` —
 * never from a domain, application, or route file. Scans every `.ts` file under `apps/backend/src`
 * (this file's own zone-compliant imports included), not just the AI subtree, so a stray import
 * landing anywhere else in the backend is caught.
 */
describe('Mastra import zone', () => {
  it('every @mastra/ import in the backend resolves to core/infrastructure/ai/** or MastraAdvisorAdapter.ts', () => {
    const files = listTsFiles(backendSrcDir);
    expect(files.length).toBeGreaterThan(0);

    const offenders: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, 'utf-8');
      if (!MASTRA_IMPORT_PATTERN.test(source)) continue;

      const relativePath = relative(backendSrcDir, file).split(sep).join('/');
      const inZone = relativePath.startsWith('core/infrastructure/ai/') || relativePath === 'core/infrastructure/ai/MastraAdvisorAdapter.ts';
      if (!inZone) offenders.push(relativePath);
    }

    expect(offenders, `files outside the Mastra import zone importing @mastra/*: ${offenders.join(', ')}`).toEqual([]);
  });
});
