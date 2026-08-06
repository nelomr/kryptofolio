import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DuckDbAdapter, applyMigrations } from '@kryptofolio/database';
import { DuckDbTaxCalculatorAdapter } from '../DuckDbTaxCalculatorAdapter.js';


import Decimal from 'decimal.js';

describe('Tax Engine — Stress & Edge Case Tests', () => {
  let sqlitePath: string;
  let sqliteDb: DatabaseSync;
  let duckDb: DuckDbAdapter;
  let adapter: DuckDbTaxCalculatorAdapter;

  beforeEach(async () => {
    sqlitePath = path.join(os.tmpdir(), `test_ledger_stress_${Date.now()}.db`);
    sqliteDb = new DatabaseSync(sqlitePath);
    sqliteDb.exec('PRAGMA foreign_keys = ON;');
    // The full migration set, not a hand-picked prefix: the FIFO views bind against the
    // current ledger schema, so a partially-migrated ledger is not a schema the adapter supports.
    applyMigrations(sqliteDb);

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

  it('[Strict TDD] should handle 100 micro-sales of BTC without precision loss', async () => {
    // 1. Seed Assets and Account
    sqliteDb.prepare("INSERT INTO assets (id, symbol) VALUES ('BTC', 'BTC')").run();
    sqliteDb.prepare("INSERT INTO accounts (id, name, type) VALUES ('acc-1', 'Binance', 'exchange')").run();

    // 2. BUY 1.0 BTC at €50,000 (total €50,000)
    sqliteDb.prepare(`
      INSERT INTO spot_transactions (id, id_hash, account_id, tx_type, asset_in_id, amount_in, total_fiat, price_fiat, timestamp, status)
      VALUES ('tx-buy-btc', 'h-buy-btc', 'acc-1', 'BUY', 'BTC', '1.0', '50000.00', '50000.00', '2023-01-01T10:00:00Z', 'COMPLETED')
    `).run();

    // 3. Perform 100 micro-sales of 0.005 BTC at a price of €60,000 (value €300 per sell)
    // Cost basis per sell = 0.005 * 50,000 = €250
    // Gain per sell = €300 - €250 = €50
    // Total gain across 100 sells = €5,000
    // Total BTC disposed = 0.5 BTC, remaining = 0.5 BTC
    const insertStmt = sqliteDb.prepare(`
      INSERT INTO spot_transactions (id, id_hash, account_id, tx_type, asset_out_id, amount_out, total_fiat, price_fiat, timestamp, status)
      VALUES (?, ?, 'acc-1', 'SELL', 'BTC', '0.005', '300.00', '60000.00', ?, 'COMPLETED')
    `);

    for (let i = 0; i < 100; i++) {
      const id = `tx-sell-${i}`;
      const hash = `h-sell-${i}`;
      const second = String(i).padStart(2, '0');
      const timestamp = `2023-01-02T12:00:${second}Z`;
      insertStmt.run(id, hash, timestamp);
    }

    const { lots, events } = await adapter.calculateLotsAndEvents();

    expect(lots).toHaveLength(1);
    const btcLot = lots[0];
    expect(btcLot.asset_id).toBe('BTC');
    expect(btcLot.status).toBe('PARTIAL');
    expect(btcLot.remaining_qty).toBe('0.500000000000000000');
    expect(btcLot.original_qty).toBe('1.000000000000000000');

    expect(events).toHaveLength(100);

    const totalGainsDec = events.reduce((sum, e) => sum.add(new Decimal(e.gain_loss_fiat ?? '0')), new Decimal(0));
    expect(totalGainsDec.toFixed(2)).toBe('5000.00');
  });

  it('[Strict TDD] should ignore own-wallet transfers for capital gains/losses while taxing transfer fees', async () => {
    // 1. Seed Assets and Accounts
    sqliteDb.prepare("INSERT INTO assets (id, symbol) VALUES ('BNB', 'BNB')").run();
    sqliteDb.prepare("INSERT INTO accounts (id, name, type) VALUES ('acc-1', 'Binance', 'exchange')").run();
    sqliteDb.prepare("INSERT INTO accounts (id, name, type) VALUES ('acc-2', 'Metamask', 'wallet')").run();

    // 2. BUY 10 BNB at €200 on Binance (acc-1)
    sqliteDb.prepare(`
      INSERT INTO spot_transactions (id, id_hash, account_id, tx_type, asset_in_id, amount_in, total_fiat, price_fiat, timestamp, status)
      VALUES ('tx-buy-bnb', 'h-buy-bnb', 'acc-1', 'BUY', 'BNB', '10.0', '2000.00', '200.00', '2023-01-01T10:00:00Z', 'COMPLETED')
    `).run();

    // 3. Transfer 4 BNB from Binance (acc-1) to Metamask (acc-2)
    // Paying a fee of 0.05 BNB (fiat price at transfer is €300, so fee value is €15)
    // Original cost of fee BNB = 0.05 * 200 = €10. Realized gain = €5.
    sqliteDb.prepare(`
      INSERT INTO spot_transactions (id, id_hash, account_id, tx_type, asset_out_id, amount_out, fee_asset_id, fee_amount, total_fiat, price_fiat, timestamp, status)
      VALUES ('tx-transfer-out', 'h-trans-out', 'acc-1', 'TRANSFER_OUT', 'BNB', '4.0', 'BNB', '0.05', '1200.00', '300.00', '2023-01-02T10:00:00Z', 'COMPLETED')
    `).run();

    sqliteDb.prepare(`
      INSERT INTO spot_transactions (id, id_hash, account_id, tx_type, asset_in_id, amount_in, total_fiat, price_fiat, timestamp, status)
      VALUES ('tx-transfer-in', 'h-trans-in', 'acc-2', 'TRANSFER_IN', 'BNB', '4.0', '1200.00', '300.00', '2023-01-02T10:05:00Z', 'COMPLETED')
    `).run();

    // Seed BNB price at transfer time in DuckDB's _price_seed table
    await duckDb.execute("INSERT INTO _price_seed (symbol, close, date, currency) VALUES ('BNB', 300.0, '2023-01-02', 'USD')");

    const { lots, events } = await adapter.calculateLotsAndEvents();

    expect(events).toHaveLength(1);
    const feeEvent = events[0];
    expect(feeEvent.amount_from_lot).toBe('0.050000000000000000');
    expect(Number(feeEvent.gain_loss_fiat)).toBe(5);

    expect(lots).toHaveLength(1);
    const bnbLot = lots[0];
    expect(bnbLot.remaining_qty).toBe('9.950000000000000000');
    expect(bnbLot.status).toBe('PARTIAL');
  });

  it('[Strict TDD] should correctly handle a complex DeFi HBAR lifecycle (multi-wallet, swaps, LP transfers, farming rewards, consolidation)', async () => {
    // 1. Seed Assets and Accounts
    sqliteDb.prepare("INSERT INTO assets (id, symbol) VALUES ('HBAR', 'HBAR')").run();
    sqliteDb.prepare("INSERT INTO assets (id, symbol) VALUES ('DINO', 'DINO')").run();
    sqliteDb.prepare("INSERT INTO accounts (id, name, type) VALUES ('acc-bit2me', 'Bit2Me', 'exchange')").run();
    sqliteDb.prepare("INSERT INTO accounts (id, name, type) VALUES ('acc-tangem', 'Tangem', 'wallet')").run();
    sqliteDb.prepare("INSERT INTO accounts (id, name, type) VALUES ('acc-hashpack', 'Hashpack', 'wallet')").run();
    sqliteDb.prepare("INSERT INTO accounts (id, name, type) VALUES ('acc-pool', 'LiquidityPool', 'wallet')").run();
    sqliteDb.prepare("INSERT INTO accounts (id, name, type) VALUES ('acc-kraken', 'Kraken', 'exchange')").run();

    // -- TRANSACTION SEQUENCE --

    // Step 1: Buy 1000 HBAR on Bit2Me at €0.10/HBAR (cost = €100)
    sqliteDb.prepare(`
      INSERT INTO spot_transactions (id, id_hash, account_id, tx_type, asset_in_id, amount_in, total_fiat, price_fiat, timestamp, status)
      VALUES ('tx-buy-hbar-1', 'h1', 'acc-bit2me', 'BUY', 'HBAR', '1000.0', '100.00', '0.10', '2023-01-01T10:00:00Z', 'COMPLETED')
    `).run();

    // Step 2: Move HBAR to Tangem cold wallet (1 HBAR fee, price at transfer = €0.12)
    sqliteDb.prepare(`
      INSERT INTO spot_transactions (id, id_hash, account_id, tx_type, asset_out_id, amount_out, fee_asset_id, fee_amount, total_fiat, price_fiat, timestamp, status)
      VALUES ('tx-trans-bit2me-tangem-out', 'h2', 'acc-bit2me', 'TRANSFER_OUT', 'HBAR', '1000.0', 'HBAR', '1.0', '120.00', '0.12', '2023-01-02T10:00:00Z', 'COMPLETED')
    `).run();
    sqliteDb.prepare(`
      INSERT INTO spot_transactions (id, id_hash, account_id, tx_type, asset_in_id, amount_in, total_fiat, price_fiat, timestamp, status)
      VALUES ('tx-trans-bit2me-tangem-in', 'h3', 'acc-tangem', 'TRANSFER_IN', 'HBAR', '999.0', '119.88', '0.12', '2023-01-02T10:05:00Z', 'COMPLETED')
    `).run();

    // Step 3: Move HBAR from Tangem to Hashpack hot wallet (1 HBAR fee, price at transfer = €0.15)
    sqliteDb.prepare(`
      INSERT INTO spot_transactions (id, id_hash, account_id, tx_type, asset_out_id, amount_out, fee_asset_id, fee_amount, total_fiat, price_fiat, timestamp, status)
      VALUES ('tx-trans-tangem-hashpack-out', 'h4', 'acc-tangem', 'TRANSFER_OUT', 'HBAR', '999.0', 'HBAR', '1.0', '149.85', '0.15', '2023-01-03T10:00:00Z', 'COMPLETED')
    `).run();
    sqliteDb.prepare(`
      INSERT INTO spot_transactions (id, id_hash, account_id, tx_type, asset_in_id, amount_in, total_fiat, price_fiat, timestamp, status)
      VALUES ('tx-trans-tangem-hashpack-in', 'h5', 'acc-hashpack', 'TRANSFER_IN', 'HBAR', '998.0', '149.70', '0.15', '2023-01-03T10:05:00Z', 'COMPLETED')
    `).run();

    // Step 4: Swap 500 HBAR for 10,000 DINO on Hashpack (Price HBAR = €0.20, value = €100)
    // Taxable disposal of 500 HBAR. Cost basis is €0.10. Gain = €50.
    sqliteDb.prepare(`
      INSERT INTO spot_transactions (id, id_hash, account_id, tx_type, asset_in_id, amount_in, asset_out_id, amount_out, total_fiat, price_fiat, timestamp, status)
      VALUES ('tx-swap-hbar-dino-1', 'h6', 'acc-hashpack', 'SWAP', 'DINO', '10000.0', 'HBAR', '500.0', '100.00', '0.20', '2023-01-04T10:00:00Z', 'COMPLETED')
    `).run();

    // Step 5: Put 300 HBAR and 5000 DINO in pool (acc-pool) -> Modeled as Transfers
    sqliteDb.prepare(`
      INSERT INTO spot_transactions (id, id_hash, account_id, tx_type, asset_out_id, amount_out, total_fiat, price_fiat, timestamp, status)
      VALUES ('tx-pool-dep-hbar-out', 'h7', 'acc-hashpack', 'TRANSFER_OUT', 'HBAR', '300.0', '60.00', '0.20', '2023-01-05T10:00:00Z', 'COMPLETED')
    `).run();
    sqliteDb.prepare(`
      INSERT INTO spot_transactions (id, id_hash, account_id, tx_type, asset_in_id, amount_in, total_fiat, price_fiat, timestamp, status)
      VALUES ('tx-pool-dep-hbar-in', 'h8', 'acc-pool', 'TRANSFER_IN', 'HBAR', '300.0', '60.00', '0.20', '2023-01-05T10:05:00Z', 'COMPLETED')
    `).run();

    sqliteDb.prepare(`
      INSERT INTO spot_transactions (id, id_hash, account_id, tx_type, asset_out_id, amount_out, total_fiat, price_fiat, timestamp, status)
      VALUES ('tx-pool-dep-dino-out', 'h9', 'acc-hashpack', 'TRANSFER_OUT', 'DINO', '5000.0', '50.00', '0.01', '2023-01-05T10:10:00Z', 'COMPLETED')
    `).run();
    sqliteDb.prepare(`
      INSERT INTO spot_transactions (id, id_hash, account_id, tx_type, asset_in_id, amount_in, total_fiat, price_fiat, timestamp, status)
      VALUES ('tx-pool-dep-dino-in', 'h10', 'acc-pool', 'TRANSFER_IN', 'DINO', '5000.0', '50.00', '0.01', '2023-01-05T10:15:00Z', 'COMPLETED')
    `).run();

    // Step 6: Swap 100 HBAR for 2000 DINO on Hashpack (Price HBAR = €0.25, value = €25)
    // Taxable disposal of 100 HBAR. Cost basis is €0.10. Gain = €15.
    sqliteDb.prepare(`
      INSERT INTO spot_transactions (id, id_hash, account_id, tx_type, asset_in_id, amount_in, asset_out_id, amount_out, total_fiat, price_fiat, timestamp, status)
      VALUES ('tx-swap-hbar-dino-2', 'h11', 'acc-hashpack', 'SWAP', 'DINO', '2000.0', 'HBAR', '100.0', '25.00', '0.25', '2023-01-06T10:00:00Z', 'COMPLETED')
    `).run();

    // Step 7: Buy 2000 HBAR in Bit2Me at €0.25/HBAR (cost = €500)
    sqliteDb.prepare(`
      INSERT INTO spot_transactions (id, id_hash, account_id, tx_type, asset_in_id, amount_in, total_fiat, price_fiat, timestamp, status)
      VALUES ('tx-buy-hbar-2', 'h12', 'acc-bit2me', 'BUY', 'HBAR', '2000.0', '500.00', '0.25', '2023-01-07T10:00:00Z', 'COMPLETED')
    `).run();

    // Step 8: Move those 2000 HBAR from Bit2Me -> Tangem -> Hashpack (2 HBAR fee in each transfer)
    // Fee 1: 2 HBAR at €0.25 (€0.50). Cost basis = 2 * 0.10 = €0.20. Gain = €0.30.
    // Fee 2: 2 HBAR at €0.26 (€0.52). Cost basis = 2 * 0.10 = €0.20. Gain = €0.32.
    sqliteDb.prepare(`
      INSERT INTO spot_transactions (id, id_hash, account_id, tx_type, asset_out_id, amount_out, fee_asset_id, fee_amount, total_fiat, price_fiat, timestamp, status)
      VALUES ('tx-trans-2-out', 'h13', 'acc-bit2me', 'TRANSFER_OUT', 'HBAR', '2000.0', 'HBAR', '2.0', '500.00', '0.25', '2023-01-08T10:00:00Z', 'COMPLETED')
    `).run();
    sqliteDb.prepare(`
      INSERT INTO spot_transactions (id, id_hash, account_id, tx_type, asset_in_id, amount_in, total_fiat, price_fiat, timestamp, status)
      VALUES ('tx-trans-2-in', 'h14', 'acc-tangem', 'TRANSFER_IN', 'HBAR', '1998.0', '499.50', '0.25', '2023-01-08T10:05:00Z', 'COMPLETED')
    `).run();

    sqliteDb.prepare(`
      INSERT INTO spot_transactions (id, id_hash, account_id, tx_type, asset_out_id, amount_out, fee_asset_id, fee_amount, total_fiat, price_fiat, timestamp, status)
      VALUES ('tx-trans-3-out', 'h15', 'acc-tangem', 'TRANSFER_OUT', 'HBAR', '1998.0', 'HBAR', '2.0', '519.48', '0.26', '2023-01-09T10:00:00Z', 'COMPLETED')
    `).run();
    sqliteDb.prepare(`
      INSERT INTO spot_transactions (id, id_hash, account_id, tx_type, asset_in_id, amount_in, total_fiat, price_fiat, timestamp, status)
      VALUES ('tx-trans-3-in', 'h16', 'acc-hashpack', 'TRANSFER_IN', 'HBAR', '1996.0', '518.96', '0.26', '2023-01-09T10:05:00Z', 'COMPLETED')
    `).run();

    // Step 9: Put 1000 HBAR more in LP pool (acc-pool)
    sqliteDb.prepare(`
      INSERT INTO spot_transactions (id, id_hash, account_id, tx_type, asset_out_id, amount_out, total_fiat, price_fiat, timestamp, status)
      VALUES ('tx-pool-dep-2-out', 'h17', 'acc-hashpack', 'TRANSFER_OUT', 'HBAR', '1000.0', '260.00', '0.26', '2023-01-10T10:00:00Z', 'COMPLETED')
    `).run();
    sqliteDb.prepare(`
      INSERT INTO spot_transactions (id, id_hash, account_id, tx_type, asset_in_id, amount_in, total_fiat, price_fiat, timestamp, status)
      VALUES ('tx-pool-dep-2-in', 'h18', 'acc-pool', 'TRANSFER_IN', 'HBAR', '1000.0', '260.00', '0.26', '2023-01-10T10:05:00Z', 'COMPLETED')
    `).run();

    // Step 10: Buy 1500 HBAR on Bit2Me at €0.30/HBAR (cost = €450)
    sqliteDb.prepare(`
      INSERT INTO spot_transactions (id, id_hash, account_id, tx_type, asset_in_id, amount_in, total_fiat, price_fiat, timestamp, status)
      VALUES ('tx-buy-hbar-3', 'h19', 'acc-bit2me', 'BUY', 'HBAR', '1500.0', '450.00', '0.30', '2023-01-11T10:00:00Z', 'COMPLETED')
    `).run();

    // Step 11: Receive farming/rewards (Staking/Earn style)
    // 50 HBAR at €0.32 (€16)
    // 1000 DINO at €0.015 (€15)
    sqliteDb.prepare(`
      INSERT INTO spot_transactions (id, id_hash, account_id, tx_type, asset_in_id, amount_in, total_fiat, price_fiat, timestamp, status)
      VALUES ('tx-reward-hbar', 'h20', 'acc-hashpack', 'REWARD', 'HBAR', '50.0', '16.00', '0.32', '2023-01-12T10:00:00Z', 'COMPLETED')
    `).run();
    sqliteDb.prepare(`
      INSERT INTO spot_transactions (id, id_hash, account_id, tx_type, asset_in_id, amount_in, total_fiat, price_fiat, timestamp, status)
      VALUES ('tx-reward-dino', 'h21', 'acc-hashpack', 'REWARD', 'DINO', '1000.0', '15.00', '0.015', '2023-01-12T10:10:00Z', 'COMPLETED')
    `).run();

    // Step 12: Recover all from pool (acc-pool) to Hashpack (acc-hashpack) (1300 HBAR, 5000 DINO)
    sqliteDb.prepare(`
      INSERT INTO spot_transactions (id, id_hash, account_id, tx_type, asset_out_id, amount_out, total_fiat, price_fiat, timestamp, status)
      VALUES ('tx-pool-rec-hbar-out', 'h22', 'acc-pool', 'TRANSFER_OUT', 'HBAR', '1300.0', '416.00', '0.32', '2023-01-13T10:00:00Z', 'COMPLETED')
    `).run();
    sqliteDb.prepare(`
      INSERT INTO spot_transactions (id, id_hash, account_id, tx_type, asset_in_id, amount_in, total_fiat, price_fiat, timestamp, status)
      VALUES ('tx-pool-rec-hbar-in', 'h23', 'acc-hashpack', 'TRANSFER_IN', 'HBAR', '1300.0', '416.00', '0.32', '2023-01-13T10:05:00Z', 'COMPLETED')
    `).run();

    sqliteDb.prepare(`
      INSERT INTO spot_transactions (id, id_hash, account_id, tx_type, asset_out_id, amount_out, total_fiat, price_fiat, timestamp, status)
      VALUES ('tx-pool-rec-dino-out', 'h24', 'acc-pool', 'TRANSFER_OUT', 'DINO', '5000.0', '75.00', '0.015', '2023-01-13T10:10:00Z', 'COMPLETED')
    `).run();
    sqliteDb.prepare(`
      INSERT INTO spot_transactions (id, id_hash, account_id, tx_type, asset_in_id, amount_in, total_fiat, price_fiat, timestamp, status)
      VALUES ('tx-pool-rec-dino-in', 'h25', 'acc-hashpack', 'TRANSFER_IN', 'DINO', '5000.0', '75.00', '0.015', '2023-01-13T10:15:00Z', 'COMPLETED')
    `).run();

    // Move 2000 HBAR from Hashpack to Tangem
    sqliteDb.prepare(`
      INSERT INTO spot_transactions (id, id_hash, account_id, tx_type, asset_out_id, amount_out, total_fiat, price_fiat, timestamp, status)
      VALUES ('tx-trans-tangem-out', 'h26', 'acc-hashpack', 'TRANSFER_OUT', 'HBAR', '2000.0', '640.00', '0.32', '2023-01-14T10:00:00Z', 'COMPLETED')
    `).run();
    sqliteDb.prepare(`
      INSERT INTO spot_transactions (id, id_hash, account_id, tx_type, asset_in_id, amount_in, total_fiat, price_fiat, timestamp, status)
      VALUES ('tx-trans-tangem-in', 'h27', 'acc-tangem', 'TRANSFER_IN', 'HBAR', '2000.0', '640.00', '0.32', '2023-01-14T10:05:00Z', 'COMPLETED')
    `).run();

    // Step 13: Move HBAR from Bit2Me (1500 HBAR, 1 HBAR fee) and Tangem (2000 HBAR, 2 HBAR fee) to Kraken
    // Bit2Me -> Kraken: fee 1 HBAR at €0.33 (€0.33). Cost basis = 1 * 0.10 = €0.10. Gain = €0.23.
    sqliteDb.prepare(`
      INSERT INTO spot_transactions (id, id_hash, account_id, tx_type, asset_out_id, amount_out, fee_asset_id, fee_amount, total_fiat, price_fiat, timestamp, status)
      VALUES ('tx-trans-bit2me-kraken-out', 'h28', 'acc-bit2me', 'TRANSFER_OUT', 'HBAR', '1500.0', 'HBAR', '1.0', '495.00', '0.33', '2023-01-15T10:00:00Z', 'COMPLETED')
    `).run();
    sqliteDb.prepare(`
      INSERT INTO spot_transactions (id, id_hash, account_id, tx_type, asset_in_id, amount_in, total_fiat, price_fiat, timestamp, status)
      VALUES ('tx-trans-bit2me-kraken-in', 'h29', 'acc-kraken', 'TRANSFER_IN', 'HBAR', '1499.0', '494.67', '0.33', '2023-01-15T10:05:00Z', 'COMPLETED')
    `).run();

    // Tangem -> Kraken: fee 2 HBAR at €0.34 (€0.68). Cost basis = 2 * 0.10 = €0.20. Gain = €0.48.
    sqliteDb.prepare(`
      INSERT INTO spot_transactions (id, id_hash, account_id, tx_type, asset_out_id, amount_out, fee_asset_id, fee_amount, total_fiat, price_fiat, timestamp, status)
      VALUES ('tx-trans-tangem-kraken-out', 'h30', 'acc-tangem', 'TRANSFER_OUT', 'HBAR', '2000.0', 'HBAR', '2.0', '680.00', '0.34', '2023-01-16T10:00:00Z', 'COMPLETED')
    `).run();
    sqliteDb.prepare(`
      INSERT INTO spot_transactions (id, id_hash, account_id, tx_type, asset_in_id, amount_in, total_fiat, price_fiat, timestamp, status)
      VALUES ('tx-trans-tangem-kraken-in', 'h31', 'acc-kraken', 'TRANSFER_IN', 'HBAR', '1998.0', '679.32', '0.34', '2023-01-16T10:05:00Z', 'COMPLETED')
    `).run();

    // Step 14: Buy 2000 HBAR on Kraken at €0.35/HBAR (cost = €700)
    sqliteDb.prepare(`
      INSERT INTO spot_transactions (id, id_hash, account_id, tx_type, asset_in_id, amount_in, total_fiat, price_fiat, timestamp, status)
      VALUES ('tx-buy-hbar-4', 'h32', 'acc-kraken', 'BUY', 'HBAR', '2000.0', '700.00', '0.35', '2023-01-17T10:00:00Z', 'COMPLETED')
    `).run();

    // -- SEED PRICING ORACLE IN DUCKDB --
    await duckDb.execute("INSERT INTO _price_seed (symbol, close, date, currency) VALUES ('HBAR', 0.12, '2023-01-02', 'USD')");
    await duckDb.execute("INSERT INTO _price_seed (symbol, close, date, currency) VALUES ('HBAR', 0.15, '2023-01-03', 'USD')");
    await duckDb.execute("INSERT INTO _price_seed (symbol, close, date, currency) VALUES ('HBAR', 0.25, '2023-01-08', 'USD')");
    await duckDb.execute("INSERT INTO _price_seed (symbol, close, date, currency) VALUES ('HBAR', 0.26, '2023-01-09', 'USD')");
    await duckDb.execute("INSERT INTO _price_seed (symbol, close, date, currency) VALUES ('HBAR', 0.33, '2023-01-15', 'USD')");
    await duckDb.execute("INSERT INTO _price_seed (symbol, close, date, currency) VALUES ('HBAR', 0.34, '2023-01-16', 'USD')");

    // Calculate lots and events
    const { lots, events } = await adapter.calculateLotsAndEvents();

    // -- CALCULATE EXPECTED OUTCOMES --
    // Total acquired = 1000 (BUY 1) + 2000 (BUY 2) + 1500 (BUY 3) + 50 (REWARD) + 2000 (BUY 4) = 6550 HBAR
    // Total disposed = 500 (SWAP 1) + 100 (SWAP 2) + 9 (Fees: 1+1+2+2+1+2) = 609 HBAR
    // Remaining globally = 5941 HBAR
    // FIFO lot consumption:
    // - BUY 1 lot (1000 HBAR) is consumed by:
    //   - 1 HBAR (TRANS 1 fee)
    //   - 1 HBAR (TRANS 2 fee)
    //   - 500 HBAR (SWAP 1)
    //   - 100 HBAR (SWAP 2)
    //   - 2 HBAR (TRANS 3 fee 1)
    //   - 2 HBAR (TRANS 3 fee 2)
    //   - 1 HBAR (Kraken fee 1)
    //   - 2 HBAR (Kraken fee 2)
    //   Total consumed from BUY 1 = 609 HBAR.
    //   Remaining in BUY 1 lot = 391 HBAR.
    // Realized Capital Gains:
    // - SWAP 1: 500 * (0.20 - 0.10) = €50.00
    // - SWAP 2: 100 * (0.25 - 0.10) = €15.00
    // - Fees:
    //   - 1 HBAR at €0.12 (basis €0.10) = €0.02
    //   - 1 HBAR at €0.15 (basis €0.10) = €0.05
    //   - 2 HBAR at €0.25 (basis €0.10) = €0.30
    //   - 2 HBAR at €0.26 (basis €0.10) = €0.32
    //   - 1 HBAR at €0.33 (basis €0.10) = €0.23
    //   - 2 HBAR at €0.34 (basis €0.10) = €0.48
    //   Total fee gains = €1.40
    // Total expected HBAR capital gains = €66.40

    // Filter events relating to HBAR
    const hbarEvents = events.filter(e => e.sale_price_fiat !== '0.015000000000000000'); // exclude DINO reward (not a sale)
    const hbarGains = hbarEvents.reduce((sum, e) => sum + Number(e.gain_loss_fiat), 0);

    expect(Number(hbarGains.toFixed(2))).toBe(66.40);

    const hbarLots = lots.filter(l => l.asset_id === 'HBAR');
    // Expected remaining quantity in HBAR Lot 1 (BUY 1)
    const lot1 = hbarLots.find(l => l.spot_transaction_id === 'tx-buy-hbar-1')!;
    expect(lot1.remaining_qty).toBe('391.000000000000000000');
    expect(lot1.status).toBe('PARTIAL');

    // Other lots should remain fully open
    const lot2 = hbarLots.find(l => l.spot_transaction_id === 'tx-buy-hbar-2')!;
    expect(lot2.remaining_qty).toBe('2000.000000000000000000');
    expect(lot2.status).toBe('OPEN');

    const lot3 = hbarLots.find(l => l.spot_transaction_id === 'tx-buy-hbar-3')!;
    expect(lot3.remaining_qty).toBe('1500.000000000000000000');
    expect(lot3.status).toBe('OPEN');

    const rewardLot = hbarLots.find(l => l.spot_transaction_id === 'tx-reward-hbar')!;
    expect(rewardLot.remaining_qty).toBe('50.000000000000000000');
    expect(rewardLot.status).toBe('OPEN');

    const lot4 = hbarLots.find(l => l.spot_transaction_id === 'tx-buy-hbar-4')!;
    expect(lot4.remaining_qty).toBe('2000.000000000000000000');
    expect(lot4.status).toBe('OPEN');

    const totalHbarRemaining = hbarLots.reduce((sum, l) => sum + Number(l.remaining_qty), 0);
    expect(totalHbarRemaining).toBe(5941);
  });
});
