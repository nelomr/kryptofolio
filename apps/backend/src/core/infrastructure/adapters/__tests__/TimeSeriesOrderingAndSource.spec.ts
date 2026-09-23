/**
 * Design section 10, task 10.5: risk/drawdown/volatility/performance read the public
 * materialized relations directly and never re-execute the FIFO matching window
 * computation — and, having no incidental order to rely on, two consecutive calls must
 * return each sequence in identical order.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { DuckDbAdapter, applyMigrations } from '@kryptofolio/database';
import { DuckDbMetricsAdapter } from '../DuckDbMetricsAdapter.js';

describe('DuckDbMetricsAdapter time-series methods read public relations, never FIFO matching', () => {
  const source = fs.readFileSync(
    path.join(import.meta.dirname, '../DuckDbMetricsAdapter.ts'),
    'utf-8',
  );

  it('references no FIFO matching window computation anywhere in the file', () => {
    expect(source).not.toMatch(/FROM v_fifo_matches/);
    expect(source).not.toMatch(/PARTITION BY asset_id ORDER BY timestamp/);
  });

  it('getPerformanceHistory, getDrawdownCurve, getRiskMetrics, getVolatilityHeatmap read the public time-series relations', () => {
    for (const relation of [
      'v_portfolio_daily_valuation',
      'v_portfolio_ath_drawdown',
      'v_portfolio_returns_volatility',
      'v_portfolio_alpha_beta',
    ]) {
      expect(source, `expected a reference to ${relation}`).toMatch(new RegExp(`FROM ${relation}\\b`));
    }
  });
});

describe('two consecutive calls return each sequence in identical order', () => {
  let sqlitePath: string;
  let sqliteDb: DatabaseSync;
  let duckDb: DuckDbAdapter;
  let metrics: DuckDbMetricsAdapter;

  beforeAll(async () => {
    sqlitePath = path.join(os.tmpdir(), `test_ts_order_${Date.now()}.db`);
    sqliteDb = new DatabaseSync(sqlitePath);
    sqliteDb.exec('PRAGMA foreign_keys = ON;');
    applyMigrations(sqliteDb);

    process.env.MOCK_MODE = 'false';
    process.env.DUCKDB_PATH = ':memory:';
    duckDb = new DuckDbAdapter();
    await duckDb.initialize(sqlitePath);
    await duckDb.rebuildDerivedChain();
    metrics = new DuckDbMetricsAdapter(duckDb);
  });

  afterAll(() => {
    sqliteDb.close();
    if (fs.existsSync(sqlitePath)) fs.unlinkSync(sqlitePath);
  });

  it('getPerformanceHistory is stable across two calls', async () => {
    const a = await metrics.getPerformanceHistory(30, 'EUR');
    const b = await metrics.getPerformanceHistory(30, 'EUR');
    expect(b.map((p) => p.date)).toEqual(a.map((p) => p.date));
  });

  it('getDrawdownCurve is stable across two calls', async () => {
    const a = await metrics.getDrawdownCurve(30, 'EUR');
    const b = await metrics.getDrawdownCurve(30, 'EUR');
    expect(b.map((p) => p.date)).toEqual(a.map((p) => p.date));
  });

  it('getVolatilityHeatmap is stable across two calls', async () => {
    const a = await metrics.getVolatilityHeatmap(new Date().getFullYear(), 'EUR');
    const b = await metrics.getVolatilityHeatmap(new Date().getFullYear(), 'EUR');
    expect(b.map((p) => p.date)).toEqual(a.map((p) => p.date));
  });

  it('getAssetAllocation is stable across two calls', async () => {
    const a = await metrics.getAssetAllocation('EUR');
    const b = await metrics.getAssetAllocation('EUR');
    expect(b.map((p) => p.assetId)).toEqual(a.map((p) => p.assetId));
  });
});
