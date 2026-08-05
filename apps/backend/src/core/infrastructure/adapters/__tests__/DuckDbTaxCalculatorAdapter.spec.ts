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
const MIGRATION_005_SQL = fs.readFileSync(
  path.resolve(__dirname, '../../../../../../../packages/database/migrations/sqlite/005_nullable_fiat_magnitudes.sql'),
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
    sqliteDb.exec(MIGRATION_005_SQL);

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
  // An unresolved income row must not silently vanish from the yearly total
  // ---------------------------------------------------------------------------

  /**
   * A staking reward the price provider never priced: `total_fiat` is NULL, not `'0'` — the same
   * distinction that keeps a genuinely free acquisition from being flagged MISSING_PRICE. `SUM`
   * already skips the NULL row, which is correct for the total; nothing before this counted it.
   */
  const seedUnresolvedStaking = (): void => {
    sqliteDb.exec(`
      INSERT INTO assets (id, symbol) VALUES ('BTC', 'BTC');
      INSERT INTO accounts (id, name, type) VALUES ('acc-1', 'Binance', 'exchange');

      INSERT INTO spot_transactions
        (id, id_hash, account_id, tx_type, asset_in_id, amount_in, total_fiat, price_fiat, fiat_currency, timestamp, status)
      VALUES
        ('tx-staking-priced', 'h-staking-priced', 'acc-1', 'STAKING', 'BTC', '0.01', '500.00', '50000.00', 'EUR',
         '2023-03-01T10:00:00Z', 'COMPLETED'),
        ('tx-staking-unpriced', 'h-staking-unpriced', 'acc-1', 'STAKING', 'BTC', '0.02', NULL, NULL, 'EUR',
         '2023-03-02T10:00:00Z', 'COMPLETED');
    `);
  };

  it('excludes an unresolved staking reward from savingsBaseYields', async () => {
    seedUnresolvedStaking();
    const report = await adapter.getSpanishTaxReport(2023);
    expect(Number(report.savingsBaseYields)).toBe(500);
  });

  it('counts the unresolved reward instead of letting it disappear from the total', async () => {
    seedUnresolvedStaking();
    const report = await adapter.getSpanishTaxReport(2023);
    expect(report.excludedUnresolvedIncomeCount).toBe(1);
  });

  it('reports zero unresolved income when every reward has a price', async () => {
    seedUnresolvedStaking();
    sqliteDb.exec(`
      UPDATE spot_transactions SET total_fiat = '600.00', price_fiat = '30000.00'
      WHERE id = 'tx-staking-unpriced';
    `);
    const report = await adapter.getSpanishTaxReport(2023);
    expect(report.excludedUnresolvedIncomeCount).toBe(0);
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

  // The lot's custody *timeline*: where it has been, as against where it is now.
  it('returns one relocation per allocated movement leg, with both ends named', async () => {
    seedCustodyMovement();
    const rows = await adapter.getLotCustodyTimeline();

    expect(rows).toHaveLength(1);
    expect(rows[0]?.from_account_id).toBe('acc-1');
    expect(rows[0]?.from_account_name).toBe('Exchange A');
    expect(rows[0]?.from_is_synthetic).toBe(false);
    expect(rows[0]?.to_account_id).toBe('ownwallet-BTC');
    expect(rows[0]?.to_is_synthetic).toBe(true);
    expect(rows[0]?.occurred_at).toBe('2024-02-01T10:00:00.000Z');
    expect(Number(rows[0]?.qty)).toBeCloseTo(4, 9);
    expect(typeof rows[0]?.qty).toBe('string');
    expect(rows[0]?.tax_lot_id).toBeTruthy();
    expect(rows[0]?.spot_transaction_id).toBe('tx-out');
  });

  it('reports no relocation for a lot that never moved', async () => {
    sqliteDb.exec(`
      INSERT INTO assets (id, symbol, is_fiat) VALUES ('BTC', 'BTC', 0), ('EUR', 'EUR', 1);
      INSERT INTO accounts (id, name, type) VALUES ('acc-1', 'Exchange A', 'exchange');
      INSERT INTO spot_transactions
        (id, id_hash, account_id, tx_type, asset_in_id, amount_in, total_fiat, price_fiat,
         fiat_currency, timestamp, status)
      VALUES
        ('tx-buy', 'h-buy', 'acc-1', 'BUY', 'BTC', '10', '10000', '1000', 'EUR',
         '2024-01-01T10:00:00.000Z', 'COMPLETED');
    `);

    expect(await adapter.getLotCustodyTimeline()).toEqual([]);
  });

  it('scopes the timeline to an account on either end of the movement', async () => {
    seedCustodyMovement();

    expect(await adapter.getLotCustodyTimeline('acc-1')).toHaveLength(1);
    expect(await adapter.getLotCustodyTimeline('ownwallet-BTC')).toHaveLength(1);
    expect(await adapter.getLotCustodyTimeline('acc-2')).toEqual([]);
  });

  it('[SQL Injection] getLotCustodyTimeline with a malicious accountId returns safely', async () => {
    seedCustodyMovement();
    expect(await adapter.getLotCustodyTimeline("'; DROP TABLE tax_lots; --")).toEqual([]);
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

  it('reports where each portion of a lot currently sits', async () => {
    seedCustodyMovement();
    const rows = await adapter.getLotCustodyLocations();

    const held = rows.filter((row) => Number(row.qty) !== 0);
    expect(held.map((row) => row.account_id).sort()).toEqual(['acc-1', 'ownwallet-BTC']);

    const source = held.find((row) => row.account_id === 'acc-1');
    expect(Number(source?.qty)).toBeCloseTo(6, 9);
    expect(typeof source?.qty).toBe('string');
    expect(source?.asset_id).toBe('BTC');
    expect(source?.account_name).toBe('Exchange A');
    expect(source?.is_synthetic).toBe(false);
    expect(source?.tax_lot_id).toBeTruthy();

    const destination = held.find((row) => row.account_id === 'ownwallet-BTC');
    expect(Number(destination?.qty)).toBeCloseTo(4, 9);
    expect(destination?.is_synthetic).toBe(true);
    expect(destination?.tax_lot_id).toBe(source?.tax_lot_id);
  });

  it('scopes custody locations to the requested account', async () => {
    seedCustodyMovement();
    const rows = await adapter.getLotCustodyLocations('acc-1');

    expect(rows.every((row) => row.account_id === 'acc-1')).toBe(true);
    expect(rows.length).toBe(1);
  });

  it('[SQL Injection] getLotCustodyLocations with a malicious accountId returns no rows safely', async () => {
    seedCustodyMovement();
    const rows = await adapter.getLotCustodyLocations("'; DROP TABLE tax_lots; --");

    expect(rows).toEqual([]);
    const survived = sqliteDb
      .prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name = 'tax_lots'")
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
        ('tx-staking', 'h-staking', 'acc-1', 'STAKING', 'BTC', '1', NULL, NULL, 'EUR',
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

  /**
   * A stated `total_fiat = '0'` is a fact (a genuinely free acquisition) and must not be flagged
   * `MISSING_PRICE` the way a `NULL` (unresolved) magnitude is — same row shape as the test above,
   * differing only in NULL vs '0'.
   */
  it('does not flag a stated-zero acquisition as MISSING_PRICE', async () => {
    sqliteDb.exec(`
      INSERT INTO assets (id, symbol, is_fiat) VALUES ('BTC', 'BTC', 0);
      INSERT INTO accounts (id, name, type) VALUES ('acc-1', 'Exchange A', 'exchange');
      INSERT INTO spot_transactions
        (id, id_hash, account_id, tx_type, asset_in_id, amount_in, total_fiat, price_fiat,
         fiat_currency, timestamp, status)
      VALUES
        ('tx-free', 'h-free', 'acc-1', 'STAKING', 'BTC', '1', '0', '0', 'EUR',
         '2024-01-01T10:00:00.000Z', 'COMPLETED');
    `);

    const rows = await adapter.getDataQuality();
    const missing = rows.filter((row) => row.tx_id === 'tx-free' && row.quality_flag === 'MISSING_PRICE');
    expect(missing).toHaveLength(0);
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
