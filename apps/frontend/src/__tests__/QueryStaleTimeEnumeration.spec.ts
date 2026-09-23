/**
 * Design D10: every `useQuery` in these two composables must declare an explicit
 * `staleTime` — Pinia Colada's 5s default would silently re-fire the nine-request
 * dashboard fan-out on every navigation. Freshness comes from explicit invalidation on
 * ledger-dirtying mutations instead (see useSettingsMutations.ts / useTaxMutations.ts).
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const FILES = ['useCryptoMetricsQueries.ts', 'usePortfolioQueries.ts'] as const;

describe('every useQuery declares an explicit staleTime', () => {
  for (const file of FILES) {
    it(`${file}: no useQuery block is missing staleTime`, () => {
      const source = fs.readFileSync(
        path.join(import.meta.dirname, '../composables/queries', file),
        'utf-8',
      );

      // Each useQuery({ ... }) call, matched non-greedily up to its closing `})`.
      const blocks = source.match(/useQuery\(\{[\s\S]*?\n\s*\}\)/g) ?? [];
      expect(blocks.length, `expected at least one useQuery call in ${file}`).toBeGreaterThan(0);

      const missing = blocks.filter((block) => !block.includes('staleTime'));
      expect(missing, `${missing.length} of ${blocks.length} useQuery blocks in ${file} have no staleTime`).toEqual(
        [],
      );
    });
  }
});
