import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DuckDbAdapter, getLedgerDb, closeLedgerDb } from '@kryptofolio/database';
import { DIContainer } from '../../di/container.js';
import { createPortfolioApi } from '../portfolio.js';

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
const MIGRATION_004_SQL = fs.readFileSync(
  path.resolve(__dirname, '../../../../../../../packages/database/migrations/sqlite/004_fifo_traceability.sql'),
  'utf-8',
);

describe('Portfolio Route API', () => {
  let sqlitePath: string;
  let sqliteDb: DatabaseSync;
  let duckDb: DuckDbAdapter;
  let container: DIContainer;
  let app: Hono;

  beforeEach(async () => {
    sqlitePath = path.join(os.tmpdir(), `test_route_portfolio_${Date.now()}.db`);
    closeLedgerDb();
    sqliteDb = getLedgerDb(sqlitePath);
    sqliteDb.exec('PRAGMA foreign_keys = ON;');
    sqliteDb.exec(MIGRATION_001_SQL);
    sqliteDb.exec(MIGRATION_SQL);
    sqliteDb.exec(MIGRATION_003_SQL);
    sqliteDb.exec(MIGRATION_004_SQL);

    process.env.MOCK_MODE = 'false';
    process.env.VAULT_DB_PATH = sqlitePath;
    process.env.LEDGER_DB_PATH = sqlitePath;
    process.env.DUCKDB_PATH = ':memory:';
    duckDb = new DuckDbAdapter();
    await duckDb.initialize(sqlitePath);

    container = new DIContainer();
    container.setDuckDbAdapter(duckDb);

    app = new Hono().route('/portfolio', createPortfolioApi(container));
  });

  afterEach(() => {
    closeLedgerDb();
    if (fs.existsSync(sqlitePath)) fs.unlinkSync(sqlitePath);
  });

  it('GET /portfolio/summary returns portfolio summary object with metrics and holdings', async () => {
    const res = await app.request('/portfolio/summary');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { metrics: unknown; holdings: unknown[] };
    expect(body).toHaveProperty('metrics');
    expect(body).toHaveProperty('holdings');
    expect(Array.isArray(body.holdings)).toBe(true);
  });

  it('GET /portfolio/holdings returns holdings summary array', async () => {
    const res = await app.request('/portfolio/holdings');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it('GET /portfolio/derivatives/pnl returns derivatives pnl array', async () => {
    const res = await app.request('/portfolio/derivatives/pnl');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });
});
