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
const MIGRATION_003_SQL = fs.readFileSync(
  path.resolve(__dirname, '../../migrations/sqlite/003_currency_schema.sql'),
  'utf-8'
);

describe('Spanish Tax Base Categorization (IRPF)', () => {
  let sqlitePath: string;
  let sqliteDb: DatabaseSync;
  let duckDb: DuckDbAdapter;
  let adapter: DuckDbTaxCalculatorAdapter;

  beforeEach(async () => {
    // 1. Create a temporary SQLite file
    sqlitePath = path.join(os.tmpdir(), `test_ledger_tax_base_${Date.now()}.db`);
    sqliteDb = new DatabaseSync(sqlitePath);
    sqliteDb.exec('PRAGMA foreign_keys = ON;');
    sqliteDb.exec(MIGRATION_SQL);
    sqliteDb.exec(MIGRATION_003_SQL);

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

  it('[Strict TDD] should route staking/earn/dividends to savings base and airdrops/mining to general base', async () => {
    // Seed assets and accounts
    sqliteDb.prepare("INSERT INTO assets (id, symbol) VALUES ('BTC', 'BTC')").run();
    sqliteDb.prepare("INSERT INTO assets (id, symbol) VALUES ('ETH', 'ETH')").run();
    sqliteDb.prepare("INSERT INTO accounts (id, name, type) VALUES ('acc-1', 'Binance', 'exchange')").run();

    // Insert mock spot transactions:
    // 1. Staking yield (Savings Base)
    sqliteDb.prepare(`
      INSERT INTO spot_transactions (id, id_hash, account_id, tx_type, asset_in_id, amount_in, total_fiat, price_fiat, timestamp, status)
      VALUES ('tx-staking', 'h1', 'acc-1', 'STAKING', 'BTC', '0.005', '150.00', '30000.00', '2023-05-10T12:00:00Z', 'COMPLETED')
    `).run();

    // 2. Airdrop (General Base)
    sqliteDb.prepare(`
      INSERT INTO spot_transactions (id, id_hash, account_id, tx_type, asset_in_id, amount_in, total_fiat, price_fiat, timestamp, status)
      VALUES ('tx-airdrop', 'h2', 'acc-1', 'AIRDROP', 'ETH', '0.1', '200.00', '2000.00', '2023-06-15T15:00:00Z', 'COMPLETED')
    `).run();

    // 3. Mining reward (General Base)
    sqliteDb.prepare(`
      INSERT INTO spot_transactions (id, id_hash, account_id, tx_type, asset_in_id, amount_in, total_fiat, price_fiat, timestamp, status)
      VALUES ('tx-mining', 'h3', 'acc-1', 'MINING', 'BTC', '0.01', '300.00', '30000.00', '2023-07-20T08:00:00Z', 'COMPLETED')
    `).run();

    // 4. Regular buy (Not in either yield base)
    sqliteDb.prepare(`
      INSERT INTO spot_transactions (id, id_hash, account_id, tx_type, asset_in_id, amount_in, total_fiat, price_fiat, timestamp, status)
      VALUES ('tx-buy', 'h4', 'acc-1', 'BUY', 'BTC', '0.5', '15000.00', '30000.00', '2023-08-01T10:00:00Z', 'COMPLETED')
    `).run();

    // Fetch report
    const report = await adapter.getSpanishTaxReport(2023);

    expect(Number(report.savingsBaseYields)).toBe(150);
    expect(Number(report.generalBaseAirdrops)).toBe(500);
    expect(Number(report.spotCapitalGains)).toBe(0);
  });

  it('[Strict TDD] should aggregate futures realized PnL into the savings base capital gains', async () => {
    // Seed assets and accounts
    sqliteDb.prepare("INSERT INTO assets (id, symbol) VALUES ('BTC', 'BTC')").run();
    sqliteDb.prepare("INSERT INTO assets (id, symbol) VALUES ('EUR', 'EUR')").run();
    sqliteDb.prepare("INSERT INTO accounts (id, name, type) VALUES ('acc-1', 'Binance', 'exchange')").run();

    // Insert closed futures transaction with realized PnL = 500 EUR, fee = 10 EUR
    sqliteDb.prepare(`
      INSERT INTO futures_transactions (id, id_hash, account_id, tx_type, symbol, realized_pnl, fee_amount, fee_asset_id, settlement_asset_id, timestamp, status)
      VALUES ('fut-1', 'h-fut', 'acc-1', 'TRADE', 'BTCUSDT', '500.00', '10.00', 'EUR', 'EUR', '2023-09-01T12:00:00Z', 'COMPLETED')
    `).run();

    // Call getSpanishTaxReport via the calculator adapter
    const report = await adapter.getSpanishTaxReport(2023);

    // spotCapitalGains should reflect the 490 EUR net futures PnL (500 realized PnL - 10 fee)
    expect(Number(report.spotCapitalGains)).toBe(490);
  });
});
