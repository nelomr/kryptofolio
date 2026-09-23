/**
 * The analytical database is a file that outlives the process. `initialize()` resets every
 * `m_<name>` to an empty placeholder on boot, so a build stamp surviving from the previous
 * process would describe tables that no longer hold what it stamped — the chain would report
 * `fresh` while serving zero rows. A restart must never be observable as an empty chain.
 */

import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { DuckDbAdapter } from '../../src/adapters/DuckDbAdapter.js';
import { applyMigrations } from '../helpers/migrations.js';

const ACCOUNT = 'acc-restart';

function seedLedger(sqliteDb: DatabaseSync): void {
  const asset = sqliteDb.prepare('INSERT INTO assets (id, symbol, is_fiat) VALUES (?, ?, ?)');
  asset.run('BTC', 'BTC', 0);
  asset.run('EUR', 'EUR', 1);
  sqliteDb
    .prepare('INSERT INTO accounts (id, name, type) VALUES (?, ?, ?)')
    .run(ACCOUNT, 'Kraken', 'exchange');
  sqliteDb
    .prepare(
      `INSERT INTO spot_transactions (
         id, id_hash, account_id, tx_type, asset_in_id, amount_in, asset_out_id, amount_out,
         fee_asset_id, fee_amount, total_fiat, price_fiat, fiat_currency, timestamp, status
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'COMPLETED')`,
    )
    .run(
      'tx-buy-1',
      'h-buy-1',
      ACCOUNT,
      'BUY',
      'BTC',
      '1.0',
      'EUR',
      '20000.00',
      'EUR',
      '10.00',
      '20000.00',
      '20000.00',
      'EUR',
      '2023-01-01T10:00:00Z',
    );
}

describe('derived FIFO chain across a process restart', () => {
  const created: string[] = [];
  let sqliteDb: DatabaseSync | null = null;

  afterEach(() => {
    sqliteDb?.close();
    for (const p of created) {
      for (const f of [p, `${p}.wal`]) if (fs.existsSync(f)) fs.unlinkSync(f);
    }
    created.length = 0;
    delete process.env.DUCKDB_PATH;
  });

  it('does not report a fresh chain after a restart emptied the materialized tables', async () => {
    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const sqliteDbPath = path.join(os.tmpdir(), `test_ledger_restart_${suffix}.db`);
    const duckDbPath = path.join(os.tmpdir(), `test_analytical_restart_${suffix}.duckdb`);
    created.push(sqliteDbPath, duckDbPath);

    sqliteDb = new DatabaseSync(sqliteDbPath);
    sqliteDb.exec('PRAGMA foreign_keys = ON;');
    applyMigrations(sqliteDb);
    seedLedger(sqliteDb);

    process.env.MOCK_MODE = 'false';
    process.env.DUCKDB_PATH = duckDbPath;

    const first = new DuckDbAdapter();
    await first.initialize(sqliteDbPath);
    await first.rebuildDerivedChain();
    const built = await first.queryMany<{ n: bigint }>(
      'SELECT COUNT(*) AS n FROM v_calculated_tax_lots',
    );
    expect(Number(built[0]!.n)).toBe(1);
    first.getInstance().closeSync();

    const second = new DuckDbAdapter();
    await second.initialize(sqliteDbPath);

    const stamp = await second.describeDerivedChain();
    const rows = await second.queryMany<{ n: bigint }>(
      'SELECT COUNT(*) AS n FROM v_calculated_tax_lots',
    );
    // Either the chain survived the restart intact, or it reports itself as never built so the
    // freshness service rebuilds it. A stamp over empty tables is the one forbidden combination.
    expect(stamp === null || Number(rows[0]!.n) === 1).toBe(true);
  });
});
