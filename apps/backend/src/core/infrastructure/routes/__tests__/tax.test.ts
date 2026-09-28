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

  describe('GET /tax/transactions/spot — override read model', () => {
    beforeEach(() => {
      sqliteDb.prepare("INSERT INTO assets (id, symbol) VALUES ('BTC', 'BTC')").run();
      sqliteDb.prepare("INSERT INTO accounts (id, name, type) VALUES ('acc-1', 'Kraken', 'exchange')").run();
      sqliteDb
        .prepare(
          `INSERT INTO spot_transactions
             (id, id_hash, account_id, tx_type, asset_in_id, amount_in, total_fiat, price_fiat, fiat_currency, timestamp, status)
           VALUES ('tx-plain', 'hash-plain', 'acc-1', 'BUY', 'BTC', '1.0', '40000', '40000', 'EUR', '2026-01-01T00:00:00Z', 'COMPLETED')`,
        )
        .run();
      sqliteDb
        .prepare(
          `INSERT INTO spot_transactions
             (id, id_hash, account_id, tx_type, asset_in_id, amount_in, total_fiat, price_fiat, fiat_currency, timestamp, status)
           VALUES ('tx-edited', 'hash-edited', 'acc-1', 'BUY', 'BTC', '1.0', '40000', '40000', 'EUR', '2026-01-02T00:00:00Z', 'COMPLETED')`,
        )
        .run();
      sqliteDb
        .prepare(
          `INSERT INTO spot_transaction_overrides (id_hash, price_edited, price_fiat, fiat_currency)
           VALUES ('hash-edited', 1, '42000', 'EUR')`,
        )
        .run();
      sqliteDb
        .prepare(
          `INSERT INTO spot_transactions
             (id, id_hash, account_id, tx_type, asset_in_id, amount_in, total_fiat, price_fiat, fiat_currency, timestamp, status)
           VALUES ('tx-usd', 'hash-usd', 'acc-1', 'BUY', 'BTC', '1.0', '43000', '43000', 'USD', '2026-01-03T00:00:00Z', 'COMPLETED')`,
        )
        .run();
    });

    it("carries the row's own native fiat_currency, not a hard-coded display currency", async () => {
      const res = await app.request('/tax/transactions/spot');
      const body = (await res.json()) as { id_hash: string; fiat_currency: string }[];
      expect(body.find((r) => r.id_hash === 'hash-plain')?.fiat_currency).toBe('EUR');
      expect(body.find((r) => r.id_hash === 'hash-usd')?.fiat_currency).toBe('USD');
    });

    it('marks a row with no override as { kind: "NONE" }', async () => {
      const res = await app.request('/tax/transactions/spot');
      const body = (await res.json()) as { id_hash: string; override: { kind: string } }[];
      const row = body.find((r) => r.id_hash === 'hash-plain');
      expect(row?.override).toEqual({ kind: 'NONE' });
    });

    it('marks an edited row as { kind: "ACTIVE" } with its edited fields listed', async () => {
      const res = await app.request('/tax/transactions/spot');
      const body = (await res.json()) as {
        id_hash: string;
        override: { kind: string; editedFields?: string[]; original?: unknown };
      }[];
      const row = body.find((r) => r.id_hash === 'hash-edited');
      expect(row?.override.kind).toBe('ACTIVE');
      expect(row?.override.editedFields).toEqual(['price_fiat']);
      expect(row?.override.original).toBeDefined();
    });

    it('shows the EDITED price on the row itself, not the original — real defect found in production: the badge appeared but the figure never changed, on first load or on reload', async () => {
      const res = await app.request('/tax/transactions/spot');
      const body = (await res.json()) as { id_hash: string; price_fiat: string; override: { original?: { price_fiat: string } } }[];
      const row = body.find((r) => r.id_hash === 'hash-edited');
      expect(row?.price_fiat).toBe('42000');
      // The pre-edit figure must still be reachable, just not as the row's own displayed value.
      expect(row?.override.original?.price_fiat).toBe('40000');
    });
  });

  // The stub PUT/DELETE /tax/transactions/:id routes (design.md's Context: they returned
  // `{ success: true }` and never touched the ledger) are removed. Their replacement is
  // PUT/DELETE /fiscal/overrides/transactions/:idHash (group 7), a different route family
  // entirely, not a rename — see fiscal.test.ts.
  it('DELETE /tax/transactions/:id no longer exists', async () => {
    const res = await app.request('/tax/transactions/hash-a', { method: 'DELETE' });
    expect(res.status).toBe(404);
  });

  it('PUT /tax/transactions/:id no longer exists', async () => {
    const res = await app.request('/tax/transactions/hash-a', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(404);
  });
});
