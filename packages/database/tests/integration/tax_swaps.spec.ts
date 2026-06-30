import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DuckDbAdapter } from '../../src/adapters/DuckDbAdapter.js';
import { DuckDbTaxCalculatorAdapter } from '../../../../apps/backend/src/core/infrastructure/adapters/DuckDbTaxCalculatorAdapter.js';

const MIGRATION_SQL = fs.readFileSync(
  path.resolve(__dirname, '../../migrations/sqlite/002_ledger_schema.sql'),
  'utf-8'
);

describe('Vectorized Spot FIFO Engine', () => {
  let sqlitePath: string;
  let sqliteDb: DatabaseSync;
  let duckDb: DuckDbAdapter;
  let adapter: DuckDbTaxCalculatorAdapter;

  beforeEach(async () => {
    // 1. Create a temporary SQLite file
    sqlitePath = path.join(os.tmpdir(), `test_ledger_fifo_${Date.now()}.db`);
    sqliteDb = new DatabaseSync(sqlitePath);
    sqliteDb.exec('PRAGMA foreign_keys = ON;');
    sqliteDb.exec(MIGRATION_SQL);

    // 2. Initialize DuckDbAdapter with the temporary SQLite file attached
    process.env.MOCK_MODE = 'false';
    process.env.DUCKDB_PATH = ':memory:';
    duckDb = new DuckDbAdapter();
    await duckDb.initialize(sqlitePath);

    adapter = new DuckDbTaxCalculatorAdapter(duckDb);
  });

  afterEach(() => {
    sqliteDb.close();
    if (fs.existsSync(sqlitePath)) {
      fs.unlinkSync(sqlitePath);
    }
  });

  it('[Strict TDD] should execute Spot FIFO lot matching and calculate crypto-fee disposal correctly', async () => {
    // Seed assets and accounts
    sqliteDb.prepare("INSERT INTO assets (id, symbol) VALUES ('BTC', 'BTC')").run();
    sqliteDb.prepare("INSERT INTO assets (id, symbol) VALUES ('BNB', 'BNB')").run();
    sqliteDb.prepare("INSERT INTO assets (id, symbol) VALUES ('USDT', 'USDT')").run();
    sqliteDb.prepare("INSERT INTO accounts (id, name, type) VALUES ('acc-1', 'Binance', 'exchange')").run();

    // 1. BUY 1 BNB at €100 (total €100)
    sqliteDb.prepare(`
      INSERT INTO spot_transactions (id, id_hash, account_id, tx_type, asset_in_id, amount_in, total_fiat, price_fiat, timestamp, status)
      VALUES ('tx-buy-bnb', 'h-bnb', 'acc-1', 'BUY', 'BNB', '1.0', '100.00', '100.00', '2023-01-01T10:00:00Z', 'COMPLETED')
    `).run();

    // 2. BUY 0.5 BTC at €20,000 (total €10,000)
    sqliteDb.prepare(`
      INSERT INTO spot_transactions (id, id_hash, account_id, tx_type, asset_in_id, amount_in, total_fiat, price_fiat, timestamp, status)
      VALUES ('tx-buy-btc', 'h-btc', 'acc-1', 'BUY', 'BTC', '0.5', '10000.00', '20000.00', '2023-01-02T10:00:00Z', 'COMPLETED')
    `).run();

    // 3. SWAP: Swap 0.2 BTC for USDT (fiat value €5000), paying 0.1 BNB fee (value €30)
    // This swap does three things:
    //   - Disposes 0.2 BTC (cost basis 0.2 * 20000 = €4000). Realized Gain: €1000.
    //   - Disposes 0.1 BNB for fee (value €30, cost basis 0.1 * 100 = €10). Realized Gain: €20.
    //   - Acquires USDT (value €5000). Cost basis is €5000 + €30 fee = €5030.
    sqliteDb.prepare(`
      INSERT INTO spot_transactions (id, id_hash, account_id, tx_type, asset_in_id, amount_in, asset_out_id, amount_out, fee_asset_id, fee_amount, total_fiat, price_fiat, timestamp, status)
      VALUES ('tx-swap', 'h-swap', 'acc-1', 'SWAP', 'USDT', '5000.0', 'BTC', '0.2', 'BNB', '0.1', '5000.00', '25000.00', '2023-01-03T10:00:00Z', 'COMPLETED')
    `).run();

    // Seed BNB price at swap time in DuckDB's asset_prices table
    await duckDb.execute("INSERT INTO asset_prices (symbol, price_fiat, timestamp) VALUES ('BNB', 300.0, '2023-01-03 10:00:00')");

    // Calculate lots and events
    const { lots, events } = await adapter.calculateLotsAndEvents();

    // Verify Lots
    // We expect:
    // - 1 Lot for BNB (remaining 0.9 BNB)
    // - 1 Lot for BTC (remaining 0.3 BTC)
    // - 1 Lot for USDT (5000 USDT)
    expect(lots).toHaveLength(3);

    const bnbLot = lots.find(l => l.asset_id === 'BNB')!;
    expect(bnbLot.remaining_qty).toBe('0.900000000000000000');
    expect(bnbLot.status).toBe('PARTIAL');

    const btcLot = lots.find(l => l.asset_id === 'BTC')!;
    expect(btcLot.remaining_qty).toBe('0.300000000000000000');
    expect(btcLot.status).toBe('PARTIAL');

    // Verify SQLite GLOB Constraint compatibility (strictly string decimals)
    expect(bnbLot.remaining_qty).not.toMatch(/[eE]/);
    expect(btcLot.remaining_qty).not.toMatch(/[eE]/);

    // Verify Events
    // We expect:
    // - 1 disposal event for BTC (0.2 BTC disposed, gain €1000)
    // - 1 disposal event for BNB fee (0.1 BNB disposed, gain €20)
    expect(events).toHaveLength(2);

    const btcEvent = events.find(e => e.tax_lot_id === btcLot.id)!;
    expect(btcEvent.amount_from_lot).toBe('0.200000000000000000');
    expect(Number(btcEvent.gain_loss_fiat)).toBe(1000);

    const feeEvent = events.find(e => e.tax_lot_id === bnbLot.id)!;
    expect(feeEvent.amount_from_lot).toBe('0.100000000000000000');
    expect(Number(feeEvent.gain_loss_fiat)).toBe(20); // €30 sale price - €10 cost basis = €20
  });
});
