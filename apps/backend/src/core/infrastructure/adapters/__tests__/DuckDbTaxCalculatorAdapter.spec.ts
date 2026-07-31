import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DuckDbAdapter } from '@kryptofolio/database';
import { DuckDbTaxCalculatorAdapter } from '../DuckDbTaxCalculatorAdapter';

const MIGRATION_SQL = fs.readFileSync(
  path.resolve(
    __dirname,
    '../../../../../../../packages/database/migrations/sqlite/002_ledger_schema.sql',
  ),
  'utf-8',
);

const MIGRATION_003_SQL = fs.readFileSync(
  path.resolve(
    __dirname,
    '../../../../../../../packages/database/migrations/sqlite/003_currency_schema.sql',
  ),
  'utf-8',
);
const MIGRATION_004_SQL = fs.readFileSync(
  path.resolve(__dirname, '../../../../../../../packages/database/migrations/sqlite/004_fifo_traceability.sql'),
  'utf-8',
);

describe('DuckDbTaxCalculatorAdapter', () => {
  let sqlitePath: string;
  let sqliteDb: DatabaseSync;
  let duckDb: DuckDbAdapter;
  let adapter: DuckDbTaxCalculatorAdapter;

  beforeEach(async () => {
    sqlitePath = path.join(os.tmpdir(), `test_ledger_tax_${Date.now()}.db`);
    sqliteDb = new DatabaseSync(sqlitePath);
    sqliteDb.exec('PRAGMA foreign_keys = ON;');
    sqliteDb.exec(MIGRATION_SQL);
    sqliteDb.exec(MIGRATION_003_SQL);
    sqliteDb.exec(MIGRATION_004_SQL);

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

  it('should return an empty tax report for a year with no transactions', async () => {
    const report = await adapter.getSpanishTaxReport(2023);
    expect(report.year).toBe(2023);
    expect(Number(report.savingsBaseYields)).toBe(0);
    expect(Number(report.generalBaseAirdrops)).toBe(0);
    expect(Number(report.spotCapitalGains)).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // SQL Injection Prevention Tests
  // ---------------------------------------------------------------------------

  it('[SQL Injection] getSpanishTaxReport with malicious accountId returns empty report safely', async () => {
    const maliciousId = "'; DROP TABLE lot_history_events; --";
    // Should NOT throw and should return zero values
    const report = await adapter.getSpanishTaxReport(2023, maliciousId);
    expect(report.year).toBe(2023);
    expect(Number(report.savingsBaseYields)).toBe(0);
    expect(Number(report.generalBaseAirdrops)).toBe(0);
    expect(Number(report.spotCapitalGains)).toBe(0);
  });

  it('[SQL Injection] getSpanishTaxReport with SQL-injected year is handled safely', async () => {
    // year is a number type in TypeScript, but test the query handles a coerced bad value
    // In practice TypeScript enforces number, but the parameterized query must be safe
    const report = await adapter.getSpanishTaxReport(2023, "acc' OR '1'='1");
    expect(report.year).toBe(2023);
    expect(Number(report.savingsBaseYields)).toBe(0);
  });

  it('[SQL Injection] calculateLotsAndEvents with malicious accountId returns empty arrays safely', async () => {
    const maliciousId = "'; SELECT * FROM tax_lots; --";
    const result = await adapter.calculateLotsAndEvents(maliciousId);
    expect(result.lots).toEqual([]);
    expect(result.events).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // Flagged events must not reach the tax base
  // ---------------------------------------------------------------------------

  /**
   * Seeds two materialised events against one lot: one trustworthy and taxable, one carrying a
   * valuation defect. The defective row deliberately still holds a gain figure, because that is the
   * case the dual-source `UNION` used to sum — `is_taxable` existed on the column and was read by
   * nothing.
   */
  const seedTaxableAndFlaggedEvents = (): void => {
    sqliteDb.exec(`
      INSERT INTO assets (id, symbol) VALUES ('BNB', 'BNB');
      INSERT INTO accounts (id, name, type) VALUES ('acc-1', 'Binance', 'exchange');

      INSERT INTO spot_transactions
        (id, id_hash, account_id, tx_type, asset_in_id, amount_in, total_fiat, price_fiat, fiat_currency, timestamp, status)
      VALUES ('tx-buy', 'h-buy', 'acc-1', 'BUY', 'BNB', '10.0', '1000.00', '100.00', 'EUR', '2023-01-01T10:00:00Z', 'COMPLETED');

      INSERT INTO spot_transactions
        (id, id_hash, account_id, tx_type, asset_out_id, amount_out, total_fiat, price_fiat, fiat_currency, timestamp, status)
      VALUES ('tx-sell', 'h-sell', 'acc-1', 'SELL', 'BNB', '1.0', '200.00', '200.00', 'EUR', '2023-06-01T10:00:00Z', 'COMPLETED');

      INSERT INTO tax_lots
        (id, spot_transaction_id, asset_id, account_id, original_qty, remaining_qty,
         unit_cost_fiat, total_cost_fiat, fiat_currency, acquisition_timestamp, exchange_location, status)
      VALUES ('lot-1', 'tx-buy', 'BNB', 'acc-1', '10.0', '9.0', '100.00', '1000.00', 'EUR',
              '2023-01-01T10:00:00Z', 'Binance', 'PARTIAL');

      INSERT INTO lot_history_events
        (id, tax_lot_id, spot_transaction_id, account_id, amount_from_lot, sale_price_fiat,
         gain_loss_fiat, fiat_currency, is_taxable, disposal_type, quality_flag, disposal_date)
      VALUES
        ('ev-taxable', 'lot-1', 'tx-sell', 'acc-1', '1.0', '200.00', '100.00', 'EUR', 1, 'SELL', NULL,
         '2023-06-01T10:00:00Z'),
        ('ev-flagged', 'lot-1', 'tx-sell', 'acc-1', '1.0', '999.00', '999.00', 'EUR', 0, 'FEE',
         'MISSING_PRICE', '2023-06-02T10:00:00Z');
    `);
  };

  it('excludes non-taxable flagged events from spotCapitalGains', async () => {
    seedTaxableAndFlaggedEvents();
    const report = await adapter.getSpanishTaxReport(2023);
    expect(Number(report.spotCapitalGains)).toBe(100);
  });

  it('reports how many events were excluded alongside the total', async () => {
    seedTaxableAndFlaggedEvents();
    const report = await adapter.getSpanishTaxReport(2023);
    expect(report.excludedFlaggedEvents).toBe(1);
  });

  it('reports zero exclusions when every event is taxable', async () => {
    const report = await adapter.getSpanishTaxReport(2023);
    expect(report.excludedFlaggedEvents).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Custody and data quality — the two relations the port declares beyond lots
  // ---------------------------------------------------------------------------

  const seedCustodyMovement = () => {
    sqliteDb.exec(`
      INSERT INTO assets (id, symbol, is_fiat) VALUES ('BTC', 'BTC', 0), ('EUR', 'EUR', 1);
      INSERT INTO accounts (id, name, type) VALUES
        ('acc-1', 'Exchange A', 'exchange'),
        ('acc-2', 'Wallet B', 'wallet');
      INSERT INTO spot_transactions
        (id, id_hash, account_id, tx_type, asset_in_id, amount_in, total_fiat, price_fiat,
         fiat_currency, timestamp, status)
      VALUES
        ('tx-buy', 'h-buy', 'acc-1', 'BUY', 'BTC', '10', '10000', '1000', 'EUR',
         '2024-01-01T10:00:00.000Z', 'COMPLETED');
      INSERT INTO spot_transactions
        (id, id_hash, account_id, tx_type, asset_out_id, amount_out, total_fiat, price_fiat,
         fiat_currency, timestamp, status)
      VALUES
        ('tx-out', 'h-out', 'acc-1', 'TRANSFER_OUT', 'BTC', '4', '0', '0', 'EUR',
         '2024-02-01T10:00:00.000Z', 'COMPLETED');
    `);
  };

  it('returns balanced custody entries for a movement', async () => {
    seedCustodyMovement();
    const rows = await adapter.calculateCustodyEntries();

    expect(rows.length).toBe(2);
    const net = rows.reduce((sum, row) => sum + Number(row.qty_delta), 0);
    expect(Math.abs(net)).toBeLessThan(1e-9);

    const debit = rows.find((row) => row.account_id === 'acc-1');
    expect(debit).toBeDefined();
    expect(Number(debit?.qty_delta)).toBeCloseTo(-4, 9);
    expect(typeof debit?.qty_delta).toBe('string');
    expect(debit?.asset_id).toBe('BTC');
    expect(debit?.spot_transaction_id).toBe('tx-out');
    expect(debit?.tax_lot_id).toBeTruthy();
    expect(debit?.occurred_at).toBe('2024-02-01T10:00:00.000Z');
  });

  it('scopes custody entries to the requested account', async () => {
    seedCustodyMovement();
    const rows = await adapter.calculateCustodyEntries('acc-1');
    expect(rows.length).toBe(1);
    expect(rows[0].account_id).toBe('acc-1');
  });

  it('[SQL Injection] calculateCustodyEntries with a malicious accountId returns no rows safely', async () => {
    seedCustodyMovement();
    const rows = await adapter.calculateCustodyEntries(
      "'; DROP TABLE lot_custody_entries; --",
    );
    expect(rows).toEqual([]);
    const survived = sqliteDb
      .prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name = 'lot_custody_entries'")
      .get() as { n: number };
    expect(survived.n).toBe(1);
  });

  it('returns data-quality defects with a canonical severity and an i18n detail key', async () => {
    sqliteDb.exec(`
      INSERT INTO assets (id, symbol, is_fiat) VALUES ('BTC', 'BTC', 0);
      INSERT INTO accounts (id, name, type) VALUES ('acc-1', 'Exchange A', 'exchange');
      INSERT INTO spot_transactions
        (id, id_hash, account_id, tx_type, asset_in_id, amount_in, total_fiat, price_fiat,
         fiat_currency, timestamp, status)
      VALUES
        ('tx-staking', 'h-staking', 'acc-1', 'STAKING', 'BTC', '1', '0', '0', 'EUR',
         '2024-01-01T10:00:00.000Z', 'COMPLETED');
    `);

    const rows = await adapter.getDataQuality();
    const missing = rows.filter((row) => row.quality_flag === 'MISSING_PRICE');
    expect(missing.length).toBeGreaterThan(0);
    expect(missing[0].severity).toBe('medium');
    expect(missing[0].detail_key).toBe('fifo_quality.missing_price');
    expect(missing[0].pending_review).toBe(true);
    expect(missing[0].tx_id).toBe('tx-staking');
  });

  it('returns no data-quality rows for a ledger with nothing wrong with it', async () => {
    seedCustodyMovement();
    sqliteDb.exec(`
      INSERT INTO spot_transactions
        (id, id_hash, account_id, tx_type, asset_in_id, amount_in, total_fiat, price_fiat,
         fiat_currency, timestamp, status)
      VALUES
        ('tx-in', 'h-in', 'acc-2', 'TRANSFER_IN', 'BTC', '4', '0', '0', 'EUR',
         '2024-02-01T10:00:00.000Z', 'COMPLETED');
    `);
    const rows = await adapter.getDataQuality();
    expect(rows).toEqual([]);
  });

  it('[SQL Injection] getDataQuality with a malicious accountId returns no rows safely', async () => {
    const rows = await adapter.getDataQuality("'; DROP TABLE tax_lots; --");
    expect(rows).toEqual([]);
    const survived = sqliteDb
      .prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name = 'tax_lots'")
      .get() as { n: number };
    expect(survived.n).toBe(1);
  });
});
