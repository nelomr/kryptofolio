/**
 * `portfolioLocations` ordering (design section 10, task 10.1).
 *
 * `getHoldingsSnapshot()` was measured to return a stable order across repeated calls against
 * the real ledger (5 consecutive calls, 16 holdings, no reordering observed) — the design's
 * original observation of instability did not reproduce. That does not make the current SQL
 * safe: `ARRAY_AGG(DISTINCT ...)` with no `ORDER BY` carries no ordering guarantee at all: SQL
 * gives none, and DuckDB is free to change its aggregation plan (parallelism, a different
 * source order) between versions or query plans without that being a bug on DuckDB's part.
 * This is a test of the missing guarantee, not a reproduced flake.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('getHoldingsSnapshot portfolio_locations has a guaranteed order', () => {
  it('ARRAY_AGG for portfolio_locations declares an explicit ORDER BY', () => {
    const source = fs.readFileSync(
      path.join(import.meta.dirname, '../DuckDbPortfolioAnalyticsAdapter.ts'),
      'utf-8',
    );

    const line = source.split('\n').find((l) => l.includes('AS portfolio_locations'));
    expect(line, 'could not find the portfolio_locations ARRAY_AGG expression').toBeDefined();
    expect(
      line,
      'ARRAY_AGG for portfolio_locations must declare its own ORDER BY — SQL gives no ordering guarantee otherwise',
    ).toMatch(/ARRAY_AGG\(DISTINCT.*ORDER BY.*\).*AS portfolio_locations/);
  });
});
