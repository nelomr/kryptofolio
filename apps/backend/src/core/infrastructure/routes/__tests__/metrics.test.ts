import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DuckDbAdapter, getLedgerDb, closeLedgerDb, applyMigrations } from '@kryptofolio/database';
import { DIContainer } from '../../di/container.js';
import { createMetricsApi } from '../metrics.js';


describe('Metrics Route API', () => {
  let sqlitePath: string;
  let sqliteDb: DatabaseSync;
  let duckDb: DuckDbAdapter;
  let container: DIContainer;
  let app: Hono;

  beforeEach(async () => {
    sqlitePath = path.join(os.tmpdir(), `test_route_metrics_${Date.now()}.db`);
    closeLedgerDb();
    sqliteDb = getLedgerDb(sqlitePath);
    sqliteDb.exec('PRAGMA foreign_keys = ON;');
    // The full migration set, not a hand-picked prefix: the FIFO views bind against the current
    // ledger schema, and a partially-migrated ledger is not a schema the adapters support. Three
    // fixtures had to be converted mid-change after queries reached a column that arrives in 006.
    applyMigrations(sqliteDb);

    process.env.MOCK_MODE = 'false';
    process.env.VAULT_DB_PATH = sqlitePath;
    process.env.LEDGER_DB_PATH = sqlitePath;
    process.env.DUCKDB_PATH = ':memory:';
    duckDb = new DuckDbAdapter();
    await duckDb.initialize(sqlitePath);

    container = new DIContainer();
    container.setDuckDbAdapter(duckDb);

    app = new Hono().route('/metrics', createMetricsApi(container));
  });

  afterEach(() => {
    closeLedgerDb();
    if (fs.existsSync(sqlitePath)) fs.unlinkSync(sqlitePath);
  });

  it('GET /metrics/kpis returns KPI metrics object from DuckDbMetricsAdapter', async () => {
    const res = await app.request('/metrics/kpis');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('totalEquity');
    expect(body).toHaveProperty('currency');
  });

  it('GET /metrics/risk returns risk metrics from DuckDbMetricsAdapter', async () => {
    const res = await app.request('/metrics/risk');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('alpha');
    expect(body).toHaveProperty('beta');
  });

  it('GET /metrics/performance returns performance history array', async () => {
    const res = await app.request('/metrics/performance?days=7');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });
});
