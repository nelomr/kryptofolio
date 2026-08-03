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

  it('POST /portfolio/rebuild returns the same summary shape as the automatic path', async () => {
    const res = await app.request('/portfolio/rebuild', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      materialized: boolean;
      materializationError: string | null;
      materialization: {
        taxLots: Record<string, number>;
        lotHistoryEvents: Record<string, number>;
        custodyEntries: Record<string, number>;
        flagged: number;
        pendingReview: number;
      } | null;
    };

    expect(body.materialized).toBe(true);
    expect(body.materializationError).toBeNull();
    expect(Object.keys(body.materialization?.taxLots ?? {}).sort()).toEqual([
      'inserted',
      'reactivated',
      'retired',
      'updated',
    ]);
    expect(body.materialization).toHaveProperty('lotHistoryEvents');
    expect(body.materialization).toHaveProperty('custodyEntries');
    expect(typeof body.materialization?.pendingReview).toBe('number');
  });

  it('POST /portfolio/rebuild runs regardless of the pending flag', async () => {
    // The manual endpoint is the retry, so it must not consult the marker that the automatic path
    // uses to decide whether a rebuild is owed.
    await container.userSettingsPort.setSetting('needs_recalculation', 'false');

    const res = await app.request('/portfolio/rebuild', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { materialized: boolean };
    expect(body.materialized).toBe(true);
    expect(await container.userSettingsPort.getSetting('needs_recalculation')).toBe('false');
  });

  it('GET /portfolio/derivatives/pnl returns derivatives pnl array', async () => {
    const res = await app.request('/portfolio/derivatives/pnl');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });
});
