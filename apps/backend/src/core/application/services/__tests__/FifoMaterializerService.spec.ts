import os from 'node:os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import Decimal from 'decimal.js';
import { SQLiteLedgerAdapter } from '../../../infrastructure/adapters/SQLiteLedgerAdapter.js';
import { DuckDbAdapter } from '@kryptofolio/database';
import { DuckDbTaxCalculatorAdapter } from '../../../infrastructure/adapters/DuckDbTaxCalculatorAdapter.js';
import { FifoMaterializerService } from '../FifoMaterializerService';
import type { IUserSettingsPort } from '../../../domain/ports/IUserSettingsPort.js';
import type { TaxLotType, TaxLotEventType } from '@kryptofolio/shared-types';

const MIGRATION_SQL = fs.readFileSync(
  path.resolve(
    __dirname,
    '../../../../../../../packages/database/migrations/sqlite/002_ledger_schema.sql',
  ),
  'utf-8',
);

describe('FifoMaterializerService — Integration Tests', () => {
  let sqliteDb: DatabaseSync;
  let ledgerAdapter: SQLiteLedgerAdapter;
  let duckDbAdapter: DuckDbAdapter;
  let taxCalculator: DuckDbTaxCalculatorAdapter;
  let userSettings: IUserSettingsPort;
  let service: FifoMaterializerService;
  let sqliteDbPath: string;

  beforeEach(async () => {
    // 1. Initialize SQLite temporary file DB
    sqliteDbPath = path.join(os.tmpdir(), `test_ledger_${Date.now()}_${Math.random().toString(36).substring(7)}.db`);
    sqliteDb = new DatabaseSync(sqliteDbPath);
    sqliteDb.exec('PRAGMA foreign_keys = ON;');
    sqliteDb.exec(MIGRATION_SQL);

    ledgerAdapter = new SQLiteLedgerAdapter(sqliteDb);
    await ledgerAdapter.initialize();

    // 2. Initialize DuckDB adapter
    process.env.MOCK_MODE = 'false';
    process.env.DUCKDB_PATH = ':memory:';
    duckDbAdapter = new DuckDbAdapter();
    await duckDbAdapter.initialize(sqliteDbPath);

    taxCalculator = new DuckDbTaxCalculatorAdapter(duckDbAdapter);

    // 3. Mock User Settings
    let needsRecalc = 'false';
    userSettings = {
      getSetting: async (key: string) =>
        key === 'needs_recalculation' ? needsRecalc : null,
      setSetting: async (key: string, value: string) => {
        if (key === 'needs_recalculation') needsRecalc = value;
      },
    };

    service = new FifoMaterializerService(
      ledgerAdapter,
      taxCalculator,
      userSettings,
    );
  });

  afterEach(() => {
    sqliteDb.close();
    if (fs.existsSync(sqliteDbPath)) {
      fs.unlinkSync(sqliteDbPath);
    }
  });

  it('[Strict TDD] should update existing tax_lots without triggering redundant audit_log updates', async () => {
    // Seed assets, accounts, and the spot transaction in SQLite
    sqliteDb
      .prepare(
        "INSERT INTO assets (id, symbol, name) VALUES ('BTC', 'BTC', 'Bitcoin')",
      )
      .run();
    sqliteDb
      .prepare(
        "INSERT INTO assets (id, symbol, name) VALUES ('EUR', 'EUR', 'Euro')",
      )
      .run();
    sqliteDb
      .prepare(
        "INSERT INTO accounts (id, name, type) VALUES ('acc-1', 'Binance', 'exchange')",
      )
      .run();
    sqliteDb
      .prepare(
        `
      INSERT INTO spot_transactions (
        id, id_hash, account_id, tx_type, asset_in_id, amount_in, total_fiat, price_fiat, timestamp, status
      ) VALUES (
        'tx-1', 'hash-1', 'acc-1', 'BUY', 'BTC', '1.5', '30000', '20000', '2023-01-01T12:00:00Z', 'COMPLETED'
      )
    `,
      )
      .run();

    // Mock DuckDB taxCalculator output to return a stable tax lot
    const mockLot: TaxLotType = {
      id: 'deterministic-lot-1',
      spot_transaction_id: 'tx-1',
      asset_id: 'BTC',
      account_id: 'acc-1',
      original_qty: '1.5',
      remaining_qty: '1.5',
      unit_cost_fiat: '20000',
      total_cost_fiat: '30000',
      fiat_currency: 'EUR',
      acquisition_timestamp: '2023-01-01T12:00:00Z',
      exchange_location: 'Binance',
      status: 'OPEN',
    };

    taxCalculator.calculateLotsAndEvents = async () => ({
      lots: [mockLot],
      events: [],
    });

    // Mark as needing recalculation
    await userSettings.setSetting('needs_recalculation', 'true');

    // Run first recalculation (inserts the lot)
    await service.recalculate();

    const lots = await ledgerAdapter.getTaxLots('acc-1');
    expect(lots).toHaveLength(1);
    expect(lots[0].id).toBe('deterministic-lot-1');

    // Check audit log for updates
    const initialAuditCount = sqliteDb
      .prepare(
        "SELECT COUNT(*) as count FROM audit_log WHERE table_name = 'tax_lots' AND action = 'UPDATE'",
      )
      .get() as { count: number };

    // Run second recalculation with the same identical lot
    await userSettings.setSetting('needs_recalculation', 'true');
    await service.recalculate();

    const postRecalcAuditCount = sqliteDb
      .prepare(
        "SELECT COUNT(*) as count FROM audit_log WHERE table_name = 'tax_lots' AND action = 'UPDATE'",
      )
      .get() as { count: number };

    // Assert no redundant update audit log entries were created
    expect(postRecalcAuditCount.count).toBe(initialAuditCount.count);
  });
});
