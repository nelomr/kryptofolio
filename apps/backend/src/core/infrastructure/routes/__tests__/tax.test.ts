import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DuckDbAdapter, getLedgerDb, closeLedgerDb, applyMigrations } from '@kryptofolio/database';
import { DIContainer } from '../../di/container.js';
import { createTaxApi } from '../tax.js';

describe('Tax Route API', () => {
  let sqlitePath: string;
  let sqliteDb: DatabaseSync;
  let duckDb: DuckDbAdapter;
  let container: DIContainer;
  let app: Hono;

  beforeEach(async () => {
    sqlitePath = path.join(os.tmpdir(), `test_route_tax_${Date.now()}.db`);
    closeLedgerDb();
    sqliteDb = getLedgerDb(sqlitePath);
    sqliteDb.exec('PRAGMA foreign_keys = ON;');
    // The full migration set: the report reads `fx_rate`, which arrives in 006, and the FIFO views
    // bind against the current schema — a partially-migrated ledger is not a schema the adapter
    // supports.
    applyMigrations(sqliteDb);

    process.env.MOCK_MODE = 'false';
    process.env.VAULT_DB_PATH = sqlitePath;
    process.env.LEDGER_DB_PATH = sqlitePath;
    process.env.DUCKDB_PATH = ':memory:';
    duckDb = new DuckDbAdapter();
    await duckDb.initialize(sqlitePath);

    container = new DIContainer();
    container.setDuckDbAdapter(duckDb);

    app = new Hono().route('/tax', createTaxApi(container));
  });

  afterEach(() => {
    closeLedgerDb();
    if (fs.existsSync(sqlitePath)) fs.unlinkSync(sqlitePath);
  });

  it('GET /tax/report returns Spanish tax report for default current year', async () => {
    const res = await app.request('/tax/report');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('year');
    expect(body).toHaveProperty('spotCapitalGains');
  });

  it('GET /tax/report/:year returns Spanish tax report for specified year', async () => {
    const res = await app.request('/tax/report/2023');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.year).toBe(2023);
  });

  it('GET /tax/transactions/spot returns spot transactions from ledger', async () => {
    const res = await app.request('/tax/transactions/spot');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });
});
