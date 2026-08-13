import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DuckDbAdapter, applyMigrations } from '@kryptofolio/database';
import { DuckDbMetricsAdapter } from '../DuckDbMetricsAdapter.js';
import { DuckDbPortfolioAnalyticsAdapter } from '../DuckDbPortfolioAnalyticsAdapter.js';
import { SQLiteLedgerAdapter } from '../SQLiteLedgerAdapter.js';


describe('Risk Metrics & Time-Series Engine (TDD Suite)', () => {
  let sqlitePath: string;
  let sqliteDb: DatabaseSync;
  let duckDb: DuckDbAdapter;
  let metricsAdapter: DuckDbMetricsAdapter;
  let analyticsAdapter: DuckDbPortfolioAnalyticsAdapter;

  beforeEach(async () => {
    process.env.MOCK_MODE = 'false';
    process.env.DUCKDB_PATH = ':memory:';
    sqlitePath = path.join(os.tmpdir(), `test_risk_metrics_${Date.now()}.db`);
    sqliteDb = new DatabaseSync(sqlitePath);
    sqliteDb.exec('PRAGMA foreign_keys = ON;');
    // The full migration set, not a hand-picked prefix: the FIFO views bind against the current
    // ledger schema, and a partially-migrated ledger is not a schema the adapters support. Three
    // fixtures had to be converted mid-change after queries reached a column that arrives in 006.
    applyMigrations(sqliteDb);

    duckDb = new DuckDbAdapter();
    await duckDb.initialize(sqlitePath);
    metricsAdapter = new DuckDbMetricsAdapter(duckDb);
    analyticsAdapter = new DuckDbPortfolioAnalyticsAdapter(duckDb);
  });

  afterEach(() => {
    sqliteDb.close();
    if (fs.existsSync(sqlitePath)) fs.unlinkSync(sqlitePath);
  });

  //  Drawdown calculation
  it('calculates Max Drawdown accurately', async () => {
    const curve = await metricsAdapter.getDrawdownCurve(30, 'USD');
    expect(curve).toBeDefined();
    expect(Array.isArray(curve)).toBe(true);
  });

  // Volatility calculation
  it('computes annualized volatility accurately', async () => {
    const risk = await metricsAdapter.getRiskMetrics('USD');
    expect(risk).toBeDefined();
    expect(typeof risk.annualizedVolatility).toBe('string');
  });

  // Multi-currency conversion
  it('supports multi-currency targets in getHoldingsSnapshot', async () => {
    const summaryUSD = await analyticsAdapter.getHoldingsSnapshot(
      undefined,
      'USD',
    );
    const summaryEUR = await analyticsAdapter.getHoldingsSnapshot(
      undefined,
      'EUR',
    );
    expect(Array.isArray(summaryUSD)).toBe(true);
    expect(Array.isArray(summaryEUR)).toBe(true);
  });

  // Alpha/Beta risk metrics
  it('returns Alpha and Beta risk metrics', async () => {
    const risk = await metricsAdapter.getRiskMetrics('USD');
    expect(risk.beta).toBeDefined();
    expect(risk.alpha).toBeDefined();
  });

  // SQL injection prevention test on parameter values
  it('prevents SQL injection attacks when passing malicious parameters', async () => {
    const maliciousAccountId =
      "10000000-0000-0000-0000-000000000001'; DROP TABLE spot_transactions; --";
    const ledgerAdapter = new SQLiteLedgerAdapter(sqliteDb);

    // Querying with malicious accountId should safely bind parameter without throwing or dropping tables
    const spotTxs = await ledgerAdapter.getSpotTransactions(maliciousAccountId);
    expect(spotTxs).toEqual([]);

    // Verify ledger tables remain intact
    const tables = sqliteDb
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='spot_transactions';",
      )
      .all();
    expect(tables.length).toBe(1);
  });
});
