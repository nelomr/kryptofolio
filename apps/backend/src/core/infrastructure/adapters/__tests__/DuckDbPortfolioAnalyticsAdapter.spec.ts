import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DuckDbAdapter } from '@kryptofolio/database';
import { DuckDbPortfolioAnalyticsAdapter } from '../DuckDbPortfolioAnalyticsAdapter';

const MIGRATION_SQL = fs.readFileSync(
  path.resolve(
    __dirname,
    '../../../../../../../packages/database/migrations/sqlite/002_ledger_schema.sql',
  ),
  'utf-8',
);

describe('DuckDbPortfolioAnalyticsAdapter', () => {
  let sqlitePath: string;
  let sqliteDb: DatabaseSync;
  let duckDb: DuckDbAdapter;
  let adapter: DuckDbPortfolioAnalyticsAdapter;

  beforeEach(async () => {
    sqlitePath = path.join(
      os.tmpdir(),
      `test_ledger_analytics_${Date.now()}.db`,
    );
    sqliteDb = new DatabaseSync(sqlitePath);
    sqliteDb.exec('PRAGMA foreign_keys = ON;');
    sqliteDb.exec(MIGRATION_SQL);

    process.env.MOCK_MODE = 'false';
    process.env.DUCKDB_PATH = ':memory:';
    duckDb = new DuckDbAdapter();
    await duckDb.initialize(sqlitePath);

    adapter = new DuckDbPortfolioAnalyticsAdapter(duckDb);
  });

  afterEach(() => {
    sqliteDb.close();
    if (fs.existsSync(sqlitePath)) {
      fs.unlinkSync(sqlitePath);
    }
  });

  it('[Strict TDD] should calculate holdings snapshot with live prices and unrealized PnL', async () => {
    // Seed assets, accounts, and spot tx
    sqliteDb
      .prepare("INSERT INTO assets (id, symbol) VALUES ('ETH', 'ETH')")
      .run();
    sqliteDb
      .prepare(
        "INSERT INTO accounts (id, name, type) VALUES ('acc-1', 'Binance', 'exchange')",
      )
      .run();
    sqliteDb
      .prepare(
        `
      INSERT INTO spot_transactions (id, id_hash, account_id, tx_type, asset_in_id, amount_in, total_fiat, price_fiat, timestamp, status)
      VALUES ('tx-1', 'h1', 'acc-1', 'BUY', 'ETH', '2.0', '3000.00', '1500.00', '2023-01-01T10:00:00Z', 'COMPLETED')
    `,
      )
      .run();

    // Seed materialized tax lot
    sqliteDb
      .prepare(
        `
      INSERT INTO tax_lots (id, spot_transaction_id, asset_id, account_id, original_qty, remaining_qty, unit_cost_fiat, total_cost_fiat, fiat_currency, acquisition_timestamp, exchange_location, status)
      VALUES ('lot-1', 'tx-1', 'ETH', 'acc-1', '2.000000000000000000', '2.000000000000000000', '1500.000000000000000000', '3000.000000000000000000', 'EUR', '2023-01-01T10:00:00Z', 'Binance', 'OPEN')
    `,
      )
      .run();

    // Call adapter
    const snapshots = await adapter.getHoldingsSnapshot('acc-1', [
      { symbol: 'ETH', price: '2000' },
    ]);

    expect(snapshots).toHaveLength(1);
    const eth = snapshots[0];
    expect(eth.symbol).toBe('ETH');
    expect(Number(eth.totalQty)).toBe(2);
    expect(Number(eth.avgUnitCost)).toBe(1500);
    expect(Number(eth.totalCostFiat)).toBe(3000);
    expect(Number(eth.livePrice)).toBe(2000);
    expect(Number(eth.currentValueFiat)).toBe(4000);
    expect(Number(eth.unrealizedPnlFiat)).toBe(1000);
  });

  it('[Strict TDD] should aggregate derivatives realized PnL, funding, and fees by contract', async () => {
    // Seed assets and accounts
    sqliteDb
      .prepare("INSERT INTO assets (id, symbol) VALUES ('BTC', 'BTC')")
      .run();
    sqliteDb
      .prepare("INSERT INTO assets (id, symbol) VALUES ('EUR', 'EUR')")
      .run();
    sqliteDb
      .prepare(
        "INSERT INTO accounts (id, name, type) VALUES ('acc-1', 'Binance', 'exchange')",
      )
      .run();

    // Seed futures transactions
    // 1. Profit trade
    sqliteDb
      .prepare(
        `
      INSERT INTO futures_transactions (id, id_hash, account_id, tx_type, symbol, realized_pnl, funding_amount, fee_amount, fee_asset_id, settlement_asset_id, timestamp, status)
      VALUES ('f-1', 'hf1', 'acc-1', 'TRADE', 'BTCUSDT', '600.00', '20.00', '5.00', 'EUR', 'EUR', '2023-01-02T10:00:00Z', 'COMPLETED')
    `,
      )
      .run();

    // 2. Loss trade
    sqliteDb
      .prepare(
        `
      INSERT INTO futures_transactions (id, id_hash, account_id, tx_type, symbol, realized_pnl, funding_amount, fee_amount, fee_asset_id, settlement_asset_id, timestamp, status)
      VALUES ('f-2', 'hf2', 'acc-1', 'TRADE', 'BTCUSDT', '-100.00', '-5.00', '5.00', 'EUR', 'EUR', '2023-01-03T10:00:00Z', 'COMPLETED')
    `,
      )
      .run();

    const derivPnls = await adapter.getDerivativesPnl('acc-1');

    expect(derivPnls).toHaveLength(1);
    const btc = derivPnls[0];
    expect(btc.symbol).toBe('BTCUSDT');
    expect(Number(btc.realizedPnl)).toBe(500); // 600 - 100
    expect(Number(btc.funding)).toBe(15); // 20 - 5
    expect(Number(btc.fees)).toBe(10); // 5 + 5
    expect(Number(btc.netPnl)).toBe(505); // 500 + 15 - 10
  });
});
