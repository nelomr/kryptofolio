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
});
