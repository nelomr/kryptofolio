import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DuckDbAdapter } from '@kryptofolio/database';
import { DuckDbMetricsAdapter } from '../DuckDbMetricsAdapter.js';

const MIGRATION_001_SQL = fs.readFileSync(
  path.resolve(__dirname, '../../../../../../../packages/database/migrations/sqlite/001_vault_schema.sql'),
  'utf-8',
);
const MIGRATION_SQL = fs.readFileSync(
  path.resolve(__dirname, '../../../../../../../packages/database/migrations/sqlite/002_ledger_schema.sql'),
  'utf-8',
);
const MIGRATION_003_SQL = fs.readFileSync(
  path.resolve(__dirname, '../../../../../../../packages/database/migrations/sqlite/003_currency_schema.sql'),
  'utf-8',
);

describe('DuckDbMetricsAdapter', () => {
  let sqlitePath: string;
  let sqliteDb: DatabaseSync;
  let duckDb: DuckDbAdapter;
  let adapter: DuckDbMetricsAdapter;

  beforeEach(async () => {
    sqlitePath = path.join(os.tmpdir(), `test_metrics_${Date.now()}.db`);
    sqliteDb = new DatabaseSync(sqlitePath);
    sqliteDb.exec('PRAGMA foreign_keys = ON;');
    sqliteDb.exec(MIGRATION_001_SQL);
    sqliteDb.exec(MIGRATION_SQL);
    sqliteDb.exec(MIGRATION_003_SQL);

    process.env.MOCK_MODE = 'false';
    process.env.DUCKDB_PATH = ':memory:';
    duckDb = new DuckDbAdapter();
    await duckDb.initialize(sqlitePath);

    adapter = new DuckDbMetricsAdapter(duckDb);
  });

  afterEach(() => {
    sqliteDb.close();
    if (fs.existsSync(sqlitePath)) fs.unlinkSync(sqlitePath);
  });

  it('should return default zero KPIs when portfolio has no transactions', async () => {
    const kpis = await adapter.getKpis('USD');
    expect(kpis.currency).toBe('USD');
    expect(Number(kpis.totalEquity)).toBe(0);
    expect(Number(kpis.maxDrawdownPct)).toBe(0);
    expect(kpis.delta24hFiat).toBe('0.00');
    expect(kpis.maxDrawdownFiat).toBe('0.00');
    expect(kpis.recoveredFiat).toBe('0.00');
    expect(kpis.winRatePercent).toBe(0);
    expect(kpis.totalTrades).toBe(0);
    expect(kpis.winningTrades).toBe(0);
    expect(kpis.losingTrades).toBe(0);
    expect(kpis.averageR).toBe(0);
    expect(kpis.bestAsset).toBeNull();
    expect(kpis.worstAsset).toBeNull();
    expect(kpis.totalRoiPercent).toBe(0);
    expect(kpis.totalRoiFiat).toBe('0.00');
  });

  it('should return drawdown curve and performance history from DuckDB views', async () => {
    const drawdown = await adapter.getDrawdownCurve(30, 'USD');
    expect(Array.isArray(drawdown)).toBe(true);

    const history = await adapter.getPerformanceHistory(30, 'USD');
    expect(Array.isArray(history)).toBe(true);
  });

  it('should return risk metrics including alpha and beta', async () => {
    const risk = await adapter.getRiskMetrics('USD');
    expect(risk.currency).toBe('USD');
    expect(risk).toHaveProperty('alpha');
    expect(risk).toHaveProperty('beta');
  });
});
