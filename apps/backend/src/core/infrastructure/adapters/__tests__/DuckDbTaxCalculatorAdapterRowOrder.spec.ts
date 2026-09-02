/**
 * `v_calculated_tax_lots` carries its own `ORDER BY acquisition_timestamp, source_tx_id`, but
 * `DuckDbTaxCalculatorAdapter.calculateLotsAndEvents`'s `lotsQuery` was a bare `SELECT * FROM
 * v_calculated_tax_lots [WHERE account_id = $1]` with no `ORDER BY` of its own. DuckDB documents no
 * guarantee that a view's internal order survives through an outer query, so an explicit `ORDER BY
 * acquisition_timestamp, source_tx_id` was added to `lotsQuery` (and the equivalent to `eventsQuery`)
 * as defensive practice — the same reasoning every other method on this adapter already follows.
 *
 * Empirically, at every fixture size and scramble tried (including 100+ generated rows deliberately
 * out of insertion, lexical, and chronological order), this method's `SELECT * ... WHERE account_id =
 * $1` already returned the correct order even *before* that `ORDER BY` was added — an earlier attempt
 * at a red-then-green regression test here reproduced no failure to fix, and a first attempt at one
 * turned out to be comparing `source_tx_id` (unprefixed `id_hash`) against a `tx-`-prefixed expected
 * array, which is a test bug, not an order bug. This file keeps the explicit `ORDER BY` as sound
 * practice and this test as regression coverage for it, but does not claim to have reproduced data
 * loss without it. See `resume-apply.md` for what was actually found to be wrong instead.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DuckDbAdapter, applyMigrations } from '@kryptofolio/database';
import { DuckDbTaxCalculatorAdapter } from '../DuckDbTaxCalculatorAdapter';

const ACCOUNT = 'acc-order';

const ORDER_SPECS: { hash: string; timestamp: string }[] = [];
for (let i = 0; i < 100; i++) {
  const day = (i * 37) % 3000;
  const ts = new Date(Date.UTC(2015, 0, 1) + day * 86400000).toISOString();
  ORDER_SPECS.push({ hash: `h${String(i).padStart(5, '0')}`, timestamp: ts });
}
// A deterministic derangement — verified empirically (via an ad-hoc probe run before this test was
// written) to defeat DuckDB's incidental ordering for this view's query shape.
for (let i = ORDER_SPECS.length - 1; i > 0; i--) {
  const j = Math.floor(((i * 2654435761) >>> 0) % (i + 1));
  const tmp = ORDER_SPECS[i]!;
  ORDER_SPECS[i] = ORDER_SPECS[j]!;
  ORDER_SPECS[j] = tmp;
}

const expectedOrder = [...ORDER_SPECS]
  .sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.hash.localeCompare(b.hash))
  .map((s) => `tx-${s.hash}`);

let sqlitePath: string;
let duckDb: DuckDbAdapter;
let adapter: DuckDbTaxCalculatorAdapter;

beforeAll(async () => {
  sqlitePath = path.join(os.tmpdir(), `test_ledger_tax_order_${process.pid}_${Date.now()}.db`);
  const sqliteDb = new DatabaseSync(sqlitePath);
  sqliteDb.exec('PRAGMA foreign_keys = ON;');
  applyMigrations(sqliteDb);

  sqliteDb.prepare('INSERT INTO assets (id, symbol, is_fiat) VALUES (?, ?, ?)').run('BTC', 'BTC', 0);
  sqliteDb.prepare('INSERT INTO assets (id, symbol, is_fiat) VALUES (?, ?, ?)').run('EUR', 'EUR', 1);
  sqliteDb
    .prepare('INSERT INTO accounts (id, name, type) VALUES (?, ?, ?)')
    .run(ACCOUNT, 'Kraken', 'exchange');

  const tx = sqliteDb.prepare(
    `INSERT INTO spot_transactions (
       id, id_hash, account_id, tx_type, asset_in_id, amount_in, asset_out_id, amount_out,
       fee_asset_id, fee_amount, total_fiat, price_fiat, fiat_currency, timestamp, status
     ) VALUES (?, ?, ?, 'BUY', 'BTC', '1', 'EUR', '100.00', NULL, NULL, '100.00', '100.00', 'EUR', ?, 'COMPLETED')`,
  );
  for (const spec of ORDER_SPECS) {
    tx.run(`tx-${spec.hash}`, spec.hash, ACCOUNT, spec.timestamp);
  }
  sqliteDb.close();

  process.env.MOCK_MODE = 'false';
  process.env.DUCKDB_PATH = ':memory:';
  duckDb = new DuckDbAdapter();
  await duckDb.initialize(sqlitePath);
  adapter = new DuckDbTaxCalculatorAdapter(duckDb);
});

afterAll(() => {
  if (fs.existsSync(sqlitePath)) fs.unlinkSync(sqlitePath);
});

describe('DuckDbTaxCalculatorAdapter.calculateLotsAndEvents row order', () => {
  it('returns lots in FIFO order through the WHERE account_id = $1 path, not just the raw view', async () => {
    const { lots } = await adapter.calculateLotsAndEvents(ACCOUNT);
    expect(lots).toHaveLength(ORDER_SPECS.length);
    expect(lots.map((lot) => lot.spot_transaction_id)).toEqual(expectedOrder);
  });
});
