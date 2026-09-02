/**
 * v_collateral_balances — the per-account, per-currency collateral balance, derived from the signed
 * `collateral_movements.amount`.
 *
 * A conversion pair must net to zero across currencies (EUR down, USD up by the paired amount) while
 * never cancelling within one currency, and no collateral row may feed the tax/FIFO chain — verified
 * here against `v_flattened_fifo_events`, `v_calculated_tax_lots` and `v_futures_realized_pnl`
 * directly, since those are the three consumers named in the spec.
 */

import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DuckDbAdapter } from '../../src/adapters/DuckDbAdapter.js';
import { applyMigrations } from '../helpers/migrations.js';

const ACC = 'acc-futures';

interface MovementSpec {
  id: string;
  movementType: string;
  currency: string;
  amount: string;
  spreadPct?: string | null;
  pairId?: string | null;
  occurredAt: string;
}

function seedBase(db: DatabaseSync): void {
  db.prepare("INSERT INTO accounts (id, name, type) VALUES (?, ?, ?)").run(ACC, 'Kraken Futures', 'exchange');
  db.prepare('INSERT INTO assets (id, symbol, is_fiat) VALUES (?, ?, ?)').run('BTC', 'BTC', 0);
  db.prepare('INSERT INTO assets (id, symbol, is_fiat) VALUES (?, ?, ?)').run('EUR', 'EUR', 1);
}

/**
 * A spot BUY/SELL pair plus one futures TRADE with a realized PnL — position events that DO reach
 * `v_flattened_fifo_events`, `v_calculated_tax_lots` and `v_futures_realized_pnl`, seeded alongside
 * the collateral movements so the isolation assertion has something to fail against. Without these,
 * asserting the three views are empty is vacuous: they would be empty regardless of whether
 * collateral rows leaked into them.
 */
function seedPositionEvents(db: DatabaseSync): void {
  db.prepare(
    `INSERT INTO spot_transactions
       (id, id_hash, account_id, tx_type, asset_in_id, amount_in, total_fiat, price_fiat,
        fiat_currency, timestamp, status)
     VALUES ('spot-buy', 'hash-spot-buy', ?, 'BUY', 'BTC', '2', '20000', '10000', 'EUR',
             '2026-01-01T00:00:00.000Z', 'COMPLETED')`
  ).run(ACC);
  db.prepare(
    `INSERT INTO spot_transactions
       (id, id_hash, account_id, tx_type, asset_out_id, amount_out, total_fiat, price_fiat,
        fiat_currency, timestamp, status)
     VALUES ('spot-sell', 'hash-spot-sell', ?, 'SELL', 'BTC', '1', '12000', '12000', 'EUR',
             '2026-01-02T00:00:00.000Z', 'COMPLETED')`
  ).run(ACC);
  db.prepare(
    `INSERT INTO futures_transactions
       (id, id_hash, account_id, tx_type, symbol, realized_pnl, settlement_asset_id,
        fiat_currency, timestamp, status)
     VALUES ('fut-trade', 'hash-fut-trade', ?, 'TRADE', 'BTCUSDT', '500.00', 'EUR', 'EUR',
             '2026-01-03T00:00:00.000Z', 'COMPLETED')`
  ).run(ACC);
}

function seedMovements(db: DatabaseSync, specs: readonly MovementSpec[]): void {
  const insert = db.prepare(
    `INSERT INTO collateral_movements
       (id, id_hash, account_id, movement_type, currency, amount, spread_pct, pair_id, occurred_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  for (const s of specs) {
    insert.run(
      s.id, `hash-${s.id}`, ACC, s.movementType, s.currency, s.amount,
      s.spreadPct ?? null, s.pairId ?? null, s.occurredAt,
    );
  }
}

interface Harness {
  sqliteDb: DatabaseSync;
  duckDb: DuckDbAdapter;
  cleanup: () => void;
}

async function harness(label: string, specs: readonly MovementSpec[]): Promise<Harness> {
  const sqlitePath = path.join(
    os.tmpdir(),
    `test_collateral_${label}_${process.pid}_${Date.now()}_${Math.trunc(performance.now() * 1000)}.db`
  );
  const sqliteDb = new DatabaseSync(sqlitePath);
  sqliteDb.exec('PRAGMA foreign_keys = ON;');
  applyMigrations(sqliteDb);
  seedBase(sqliteDb);
  seedMovements(sqliteDb, specs);

  process.env.MOCK_MODE = 'false';
  process.env.DUCKDB_PATH = ':memory:';
  const duckDb = new DuckDbAdapter();
  await duckDb.initialize(sqlitePath);

  return {
    sqliteDb,
    duckDb,
    cleanup: () => {
      sqliteDb.close();
      if (fs.existsSync(sqlitePath)) fs.unlinkSync(sqlitePath);
    },
  };
}

interface BalanceRow {
  account_id: string;
  currency: string;
  balance: string;
}

const balances = (h: Harness) =>
  h.duckDb.queryMany(
    'SELECT account_id, currency, balance FROM v_collateral_balances ORDER BY currency'
  ) as Promise<BalanceRow[]>;

describe('v_collateral_balances', () => {
  it('nets a conversion pair to zero across currencies but not within one', async () => {
    const h = await harness('pair', [
      { id: 'eur-leg', movementType: 'CONVERSION', currency: 'EUR', amount: '-1.23100000000', pairId: 'p1', occurredAt: '2026-02-08T16:42:52.000Z' },
      { id: 'usd-leg', movementType: 'CONVERSION', currency: 'USD', amount: '1.45480000000', pairId: 'p1', occurredAt: '2026-02-08T16:42:52.000Z' },
    ]);
    try {
      const rows = await balances(h);
      expect(rows).toEqual([
        { account_id: ACC, currency: 'EUR', balance: '-1.231' },
        { account_id: ACC, currency: 'USD', balance: '1.4548' },
      ]);
    } finally {
      h.cleanup();
    }
  });

  it('carries an unpaired cross-exchange transfer as its own balance', async () => {
    const h = await harness('unpaired', [
      { id: 'cross', movementType: 'CROSS_EXCHANGE_TRANSFER', currency: 'EUR', amount: '200.00000000000', occurredAt: '2026-01-16T15:41:20.000Z' },
    ]);
    try {
      const rows = await balances(h);
      expect(rows).toEqual([{ account_id: ACC, currency: 'EUR', balance: '200.0' }]);
    } finally {
      h.cleanup();
    }
  });

  it('sums multiple movements in the same currency rather than only keeping the last', async () => {
    const h = await harness('sum', [
      { id: 'a', movementType: 'CONVERSION', currency: 'EUR', amount: '-1.0', occurredAt: '2026-01-01T00:00:00.000Z' },
      { id: 'b', movementType: 'CONVERSION', currency: 'EUR', amount: '0.5', occurredAt: '2026-01-02T00:00:00.000Z' },
    ]);
    try {
      const rows = await balances(h);
      expect(rows).toEqual([{ account_id: ACC, currency: 'EUR', balance: '-0.5' }]);
    } finally {
      h.cleanup();
    }
  });

  it('never appears in the FIFO/tax chain or in futures realized PnL, alongside real position events that do', async () => {
    const h = await harness('isolation', [
      { id: 'eur-leg', movementType: 'CONVERSION', currency: 'EUR', amount: '-1.0', pairId: 'p1', occurredAt: '2026-02-08T16:42:52.000Z' },
      { id: 'usd-leg', movementType: 'CONVERSION', currency: 'USD', amount: '1.0', pairId: 'p1', occurredAt: '2026-02-08T16:42:52.000Z' },
    ]);
    seedPositionEvents(h.sqliteDb);
    try {
      const fifoEvents = (await h.duckDb.queryMany(
        'SELECT tx_id, event_type FROM v_flattened_fifo_events ORDER BY event_type'
      )) as { tx_id: string; event_type: string }[];
      const taxLots = (await h.duckDb.queryMany(
        'SELECT spot_transaction_id, CAST(remaining_qty AS VARCHAR) AS remaining_qty FROM v_calculated_tax_lots'
      )) as { spot_transaction_id: string; remaining_qty: string }[];
      const realizedPnl = (await h.duckDb.queryMany(
        'SELECT id, CAST(pnl_fiat AS VARCHAR) AS pnl_fiat FROM v_futures_realized_pnl'
      )) as { id: string; pnl_fiat: string }[];

      // Exactly the two spot events (one ACQUISITION, one DISPOSAL) -- no collateral-derived row.
      expect(fifoEvents).toEqual([
        { tx_id: 'spot-buy', event_type: 'ACQUISITION' },
        { tx_id: 'spot-sell', event_type: 'DISPOSAL' },
      ]);
      // Exactly the one lot the BUY opened, partially consumed by the SELL -- no collateral-derived lot.
      expect(taxLots).toEqual([
        { spot_transaction_id: 'spot-buy', remaining_qty: '1.000000000000000000' },
      ]);
      // Exactly the one futures TRADE's PnL -- no collateral-derived row.
      expect(realizedPnl).toEqual([{ id: 'fut-trade', pnl_fiat: '500.000000000000000000' }]);

      // And the collateral balance view reflects only the collateral rows, not the position events.
      const collateral = await balances(h);
      expect(collateral).toEqual([
        { account_id: ACC, currency: 'EUR', balance: '-1.0' },
        { account_id: ACC, currency: 'USD', balance: '1.0' },
      ]);
    } finally {
      h.cleanup();
    }
  });
});
