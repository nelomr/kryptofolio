/**
 * The dual-source lag hedge (design section 6/rule 8): `DuckDbMetricsAdapter` used to union
 * `ledger.tax_lots`/`ledger.lot_history_events` alongside the DuckDB-computed relations,
 * predicated on an emptiness test, to paper over the DuckDB chain lagging behind SQLite.
 * With the chain now materialized and kept fresh before every read, the hedge is a shim this
 * change exists to remove (rule 8: no flag-shaped shim, no build-stamp predicate at query
 * time) — `m_fifo_build` serves observability and freshness state only.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('DuckDbMetricsAdapter has no dual-source lag hedge', () => {
  const source = fs.readFileSync(
    path.join(import.meta.dirname, '../DuckDbMetricsAdapter.ts'),
    'utf-8',
  );

  it('contains no emptiness-predicated branch over ledger.lot_history_events', () => {
    expect(source).not.toMatch(/\(SELECT COUNT\(\*\) FROM ledger\.lot_history_events\)/);
  });

  it('contains no per-query union with ledger.tax_lots for open lots', () => {
    expect(source).not.toMatch(/FROM ledger\.tax_lots/);
  });

  it('contains no per-query union with ledger.lot_history_events for realized events', () => {
    expect(source).not.toMatch(/FROM ledger\.lot_history_events/);
  });

  it('reads open lots and realized events directly from the materialized relations', () => {
    expect(source).toMatch(/FROM v_calculated_tax_lots/);
    expect(source).toMatch(/FROM v_calculated_lot_history_events/);
  });
});
