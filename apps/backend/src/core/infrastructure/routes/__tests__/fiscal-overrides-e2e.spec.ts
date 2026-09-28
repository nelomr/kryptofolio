/**
 * Group 12 cross-package regression: the full route → use case → domain policy path, exercised
 * against the real engine (no mocked container), not the doubled-container tests in
 * `fiscal.test.ts`. Groups 3 (canRetype), 5 (SetSpotTransactionOverrideUseCase) and 7 (the route
 * itself) only ever had unit-level coverage of this rejection individually — this is the first
 * test that proves they compose correctly end to end.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DuckDbAdapter, getLedgerDb, closeLedgerDb, applyMigrations } from '@kryptofolio/database';
import { DIContainer } from '../../di/container.js';
import { createFiscalApi } from '../fiscal.js';

describe('fiscal override routes — real-engine end-to-end (group 12)', () => {
  let sqlitePath: string;
  let sqliteDb: DatabaseSync;
  let duckDb: DuckDbAdapter;
  let container: DIContainer;
  let app: Hono;

  beforeEach(async () => {
    sqlitePath = path.join(os.tmpdir(), `test_route_fiscal_e2e_${Date.now()}.db`);
    closeLedgerDb();
    sqliteDb = getLedgerDb(sqlitePath);
    sqliteDb.exec('PRAGMA foreign_keys = ON;');
    applyMigrations(sqliteDb);

    sqliteDb.prepare("INSERT INTO assets (id, symbol) VALUES ('BTC', 'BTC')").run();
    sqliteDb.prepare("INSERT INTO accounts (id, name, type) VALUES ('acc-1', 'Kraken', 'exchange')").run();
    // A TRANSFER_OUT row with a transfer_group_id: canRetype rejects retyping this (D4)
    // regardless of target type, because its original type is a custody movement.
    sqliteDb
      .prepare(
        `INSERT INTO spot_transactions
           (id, id_hash, account_id, tx_type, asset_out_id, amount_out, total_fiat, price_fiat,
            fiat_currency, transfer_group_id, timestamp, status)
         VALUES ('tx-transfer', 'hash-transfer', 'acc-1', 'TRANSFER_OUT', 'BTC', '0.1', '0', '0',
                 'EUR', 'tg-1', '2026-01-10T00:00:00.000Z', 'COMPLETED')`,
      )
      .run();

    process.env.MOCK_MODE = 'false';
    process.env.VAULT_DB_PATH = sqlitePath;
    process.env.LEDGER_DB_PATH = sqlitePath;
    process.env.DUCKDB_PATH = ':memory:';
    duckDb = new DuckDbAdapter();
    await duckDb.initialize(sqlitePath);

    container = new DIContainer();
    container.setDuckDbAdapter(duckDb);

    app = new Hono().route('/fiscal', createFiscalApi(container));
  });

  afterEach(() => {
    closeLedgerDb();
    if (fs.existsSync(sqlitePath)) fs.unlinkSync(sqlitePath);
  });

  it('rejects a tx_type edit crossing the custody boundary with 422, end to end', async () => {
    const unchanged = { kind: 'UNCHANGED' };
    const res = await app.request('/fiscal/overrides/transactions/hash-transfer', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount_in: unchanged,
        amount_out: unchanged,
        price_fiat: unchanged,
        total_fiat: unchanged,
        fee: unchanged,
        timestamp: unchanged,
        tx_type: { kind: 'SET', value: 'SELL' },
      }),
    });

    expect(res.status).toBe(422);
    const body = (await res.json()) as { status: string; message: string };
    expect(body.status).toBe('error');
    expect(body.message.toLowerCase()).toContain('custody');

    // The rejection happened before any write: no override row exists.
    const row = sqliteDb
      .prepare('SELECT COUNT(*) AS count FROM spot_transaction_overrides WHERE id_hash = ?')
      .get('hash-transfer') as { count: number };
    expect(row.count).toBe(0);
  });
});
