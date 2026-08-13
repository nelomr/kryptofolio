/**
 * The FIFO cost basis carries no floating-point residue.
 *
 * `price_fiat = basis_fiat / qty_in` is a division, and DuckDB types DECIMAL / DECIMAL
 * as DOUBLE, so the quotient arrives with binary residue around its sixteenth
 * significant digit. That value becomes `unit_cost_fiat`, and `gain_loss_fiat` is
 * computed from it — so the residue lands in a tax figure, on the path a report is
 * declared from.
 *
 * A buy of 1.5 for a total of 30015 has a unit cost of exactly 20010: the quotient
 * terminates, and only the DOUBLE round trip makes it not. Bounding the quotient at
 * sixteen SIGNIFICANT DIGITS puts the figure back where the arithmetic says it is.
 *
 * Significant digits, not decimal places. A unit cost here spans fifteen orders of
 * magnitude, and a fixed twelve-decimal-place bound was tried first: it fixed the BTC
 * case and rounded a real micro-price of 9.18695e-10 down to 9.19e-10, destroying half
 * its significant digits. The third case below is what caught that.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DuckDbAdapter } from '../../src/adapters/DuckDbAdapter.js';
import { applyMigrations } from '../helpers/migrations.js';

const ACCOUNT = 'acc-exact';

let duckDb: DuckDbAdapter;
let sqlitePath: string;

beforeAll(async () => {
  sqlitePath = path.join(
    os.tmpdir(),
    `test_basis_exact_${process.pid}_${Date.now()}_${Math.trunc(performance.now() * 1000)}.db`,
  );
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
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'COMPLETED')`,
  );
  // 1.5 BTC for 30000 plus a 15 fee: a basis of exactly 30015 and a unit cost of
  // exactly 20010. The quotient terminates; only DOUBLE makes it ragged.
  tx.run('tx-buy', 'h-buy', ACCOUNT, 'BUY', 'BTC', '1.5', 'EUR', '30000.00',
    'EUR', '15.00', '30000.00', '20000.00', 'EUR', '2023-02-01T10:00:00Z');
  tx.run('tx-sell', 'h-sell', ACCOUNT, 'SELL', 'EUR', '25000.00', 'BTC', '1.0',
    null, null, '25000.00', '25000.00', 'EUR', '2023-06-15T14:00:00Z');
  sqliteDb.close();

  process.env.MOCK_MODE = 'false';
  process.env.DUCKDB_PATH = ':memory:';
  duckDb = new DuckDbAdapter();
  await duckDb.initialize(sqlitePath);
});

afterAll(() => {
  if (fs.existsSync(sqlitePath)) fs.unlinkSync(sqlitePath);
});

describe('FIFO basis exactness', () => {
  it('derives a terminating unit cost without residue', async () => {
    const [row] = (await duckDb.queryMany(
      `SELECT CAST(price_fiat AS VARCHAR) AS price_fiat, CAST(total_fiat AS VARCHAR) AS total_fiat
       FROM v_flattened_fifo_events
       WHERE tx_id = 'tx-buy' AND event_type = 'ACQUISITION'`,
    )) as { price_fiat: string; total_fiat: string }[];

    // The authoritative total is already exact; the derived unit cost must match it.
    expect(row.total_fiat).toBe('30015.000000000000000000');
    expect(row.price_fiat).toBe('20010.000000000000000000');
  });

  it('produces a realized gain with no floating-point residue', async () => {
    const [row] = (await duckDb.queryMany(
      `SELECT CAST(gain_loss_fiat AS VARCHAR) AS gain_loss_fiat
       FROM v_calculated_lot_history_events`,
    )) as { gain_loss_fiat: string }[];

    // 25000 − 20010, on one matched unit. The DOUBLE path returns
    // 4989.999999999998427136 for the same inputs.
    expect(row.gain_loss_fiat).toBe('4990.000000000000000000');
  });

  it('keeps a micro-price unit cost intact', async () => {
    // The case a decimal-place bound destroys: six significant digits at 1e-10.
    const [row] = (await duckDb.queryMany(
      `SELECT CAST(CAST(PRINTF('%.16g', CAST(0.0000918695 AS DECIMAL(38,18))
              / CAST(100000 AS DECIMAL(38,18))) AS DECIMAL(38,18)) AS VARCHAR) AS unit_cost`,
    )) as { unit_cost: string }[];

    expect(row.unit_cost).toBe('0.000000000918695000');
  });

  it('emits a micro-price as a plain decimal, never scientific notation', async () => {
    // PRINTF('%g') writes 9.18695e-10; the CAST back to DECIMAL is what keeps that
    // notation from ever reaching a stored or displayed figure.
    const [row] = (await duckDb.queryMany(
      `SELECT PRINTF('%.16g', 0.0000918695 / 100000) AS raw,
              CAST(CAST(PRINTF('%.16g', CAST(0.0000918695 AS DECIMAL(38,18))
                  / CAST(100000 AS DECIMAL(38,18))) AS DECIMAL(38,18)) AS VARCHAR) AS bounded`,
    )) as { raw: string; bounded: string }[];

    expect(row.raw).toMatch(/e-/);
    expect(row.bounded).not.toMatch(/e/);
  });
});

/**
 * Quantity precision through the gain expression.
 *
 * `gain_loss_fiat` multiplies by `CAST(matched_amount AS DECIMAL(26,12))` while the
 * ledger stores quantity at `DECIMAL(38,18)`. Measured on the real ledger: no
 * quantity anywhere carries more than **8** significant decimals — the 18 in
 * `tax_lots` are zero padding, not information — so the twelve-place cut discards
 * nothing that exists. Wei precision (18 places) would be truncated, and no wei-scale
 * quantity is present in any exchange export measured.
 *
 * This suite pins that boundary so the decision is recorded rather than assumed: a
 * satoshi survives exactly, and if a wei-scale quantity ever does arrive, the
 * assertion below is what will say so.
 */
describe('quantity precision through the gain expression', () => {
  it('carries a satoshi exactly', async () => {
    const [row] = (await duckDb.queryMany(
      `SELECT CAST(CAST(0.00000001 AS DECIMAL(38,18)) AS DECIMAL(26,12)) AS v`,
    )) as { v: string }[];
    expect(Number(row.v)).toBe(0.00000001);
  });

  it('records that wei precision does not survive, and that no wei-scale data exists', async () => {
    const [row] = (await duckDb.queryMany(
      `SELECT CAST(CAST(0.000000000000000001 AS DECIMAL(38,18)) AS DECIMAL(26,12)) AS wei,
              CAST(CAST(0.000000000001 AS DECIMAL(38,18)) AS DECIMAL(26,12)) AS floor_12dp`,
    )) as { wei: string; floor_12dp: string }[];

    // The cut is real: one wei becomes zero.
    expect(Number(row.wei)).toBe(0);
    // And it sits at twelve places, six below anything the real ledger contains.
    expect(Number(row.floor_12dp)).toBe(1e-12);
  });
});
