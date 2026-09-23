/**
 * `getKpis` used to pin four shared sources into session-scoped TEMP TABLEs — safe over a
 * single shared connection, but a currency-mixing race the moment two calls run over a pool
 * (design section 9/D7): one call's `CREATE OR REPLACE TEMP TABLE kpi_valuation` for USD could
 * be read by another call's EUR query mid-flight. Structural, not behavioural, so it can't
 * flake the way a timing-dependent currency-race reproduction would.
 */
import { describe, it, expect } from 'vitest';
import type { IAnalyticalDatabasePort } from '@kryptofolio/database';
import { DuckDbMetricsAdapter } from '../DuckDbMetricsAdapter.js';

function spyingPort(): IAnalyticalDatabasePort & { readonly executedSql: string[] } {
  const executedSql: string[] = [];
  return {
    executedSql,
    async initialize() {},
    async execute(sql: string) {
      executedSql.push(sql);
    },
    async queryOne() {
      return null;
    },
    async queryMany() {
      return [];
    },
    async bulkInsert() {},
    async rebuildDerivedChain() {
      return { buildId: 'test-build', builtAt: '2026-01-01T00:00:00Z' };
    },
    async describeDerivedChain() {
      return null;
    },
  };
}

describe('DuckDbMetricsAdapter.getKpis emits no TEMP TABLE pinning', () => {
  it('never calls execute() with a CREATE ... TEMP TABLE statement', async () => {
    const port = spyingPort();
    const adapter = new DuckDbMetricsAdapter(port);

    await adapter.getKpis('EUR');

    const tempTableStatements = port.executedSql.filter((sql) =>
      /CREATE\s+(OR\s+REPLACE\s+)?TEMP(ORARY)?\s+TABLE/i.test(sql),
    );
    expect(tempTableStatements).toEqual([]);
  });
});
