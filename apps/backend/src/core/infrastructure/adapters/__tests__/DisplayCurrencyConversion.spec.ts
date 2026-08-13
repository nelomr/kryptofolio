import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DuckDbAdapter } from '@kryptofolio/database';
import Decimal from 'decimal.js';
import { DuckDbPortfolioAnalyticsAdapter } from '../DuckDbPortfolioAnalyticsAdapter';

const MIGRATIONS = ['002_ledger_schema', '003_currency_schema', '004_fifo_traceability'].map(
  (name) =>
    fs.readFileSync(
      path.resolve(__dirname, `../../../../../../../packages/database/migrations/sqlite/${name}.sql`),
      'utf-8',
    ),
);

describe('display currency conversion', () => {
  let sqlitePath: string;
  let sqliteDb: DatabaseSync;
  let duckDb: DuckDbAdapter;
  let adapter: DuckDbPortfolioAnalyticsAdapter;

  beforeEach(async () => {
    sqlitePath = path.join(os.tmpdir(), `test_ledger_fxdisplay_${Date.now()}_${Math.trunc(performance.now())}.db`);
    sqliteDb = new DatabaseSync(sqlitePath);
    sqliteDb.exec('PRAGMA foreign_keys = ON;');
    for (const sql of MIGRATIONS) sqliteDb.exec(sql);

    sqliteDb.prepare("INSERT INTO assets (id, symbol) VALUES ('ETH', 'ETH')").run();
    sqliteDb
      .prepare("INSERT INTO accounts (id, name, type) VALUES ('acc-1', 'Binance', 'exchange')")
      .run();
    sqliteDb
      .prepare(
        `INSERT INTO spot_transactions (id, id_hash, account_id, tx_type, asset_in_id, amount_in, total_fiat, price_fiat, fiat_currency, timestamp, status)
         VALUES ('tx-1', 'h1', 'acc-1', 'BUY', 'ETH', '2.0', '3000.00', '1500.00', 'EUR', '2023-01-02T10:00:00Z', 'COMPLETED')`,
      )
      .run();
    sqliteDb
      .prepare(
        `INSERT INTO tax_lots (id, spot_transaction_id, asset_id, account_id, original_qty, remaining_qty, unit_cost_fiat, total_cost_fiat, fiat_currency, acquisition_timestamp, exchange_location, status)
         VALUES ('lot-1', 'tx-1', 'ETH', 'acc-1', '2.000000000000000000', '2.000000000000000000', '1500.000000000000000000', '3000.000000000000000000', 'EUR', '2023-01-02T10:00:00Z', 'Binance', 'OPEN')`,
      )
      .run();
    // 1 USD = 0.9 EUR on the acquisition date, so an EUR basis displayed in USD
    // must differ from the same basis displayed in EUR by the reciprocal.
    sqliteDb
      .prepare(
        `INSERT INTO exchange_rates (date, pair, rate, source) VALUES ('2023-01-02', 'USD/EUR', '0.9', 'ECB')`,
      )
      .run();

    process.env.MOCK_MODE = 'false';
    process.env.DUCKDB_PATH = ':memory:';
    duckDb = new DuckDbAdapter();
    await duckDb.initialize(sqlitePath);
    adapter = new DuckDbPortfolioAnalyticsAdapter(duckDb);
  });

  afterEach(() => {
    sqliteDb.close();
    if (fs.existsSync(sqlitePath)) fs.unlinkSync(sqlitePath);
  });

  it('the display currency is arithmetic, not a label — EUR and USD return different figures', async () => {
    const inEur = await adapter.getHoldingsSnapshot('acc-1', 'EUR');
    const inUsd = await adapter.getHoldingsSnapshot('acc-1', 'USD');

    expect(inEur).toHaveLength(1);
    expect(inUsd).toHaveLength(1);

    expect(inEur[0].currency).toBe('EUR');
    expect(inUsd[0].currency).toBe('USD');

    // This assertion was the inverse until this change landed: the same request in two
    // currencies returned byte-identical figures, because the currency was selected as a
    // label beside an unconverted value rather than multiplied into it.
    expect(inUsd[0].totalCostFiat).not.toBe(inEur[0].totalCostFiat);

    // And not merely different — converted at the acquisition date's rate. The ledger
    // holds USD/EUR = 0.9 on 2023-01-02, so EUR/USD is its reciprocal.
    const eurBasis = new Decimal(inEur[0].totalCostFiat);
    const usdBasis = new Decimal(inUsd[0].totalCostFiat);
    expect(eurBasis.equals(new Decimal('3000'))).toBe(true);
    expect(usdBasis.greaterThan(eurBasis)).toBe(true);
    expect(usdBasis.minus(eurBasis.div('0.9')).abs().lessThan('0.0001')).toBe(true);
  });

  /**
   * Every row the ledger holds, as text, in a deterministic order.
   *
   * Compared as a whole rather than column by column: the claim under test is that *nothing* moved,
   * and a per-column assertion only proves the columns someone thought to name.
   */
  const ledgerFingerprint = (): string => {
    const tables = ['spot_transactions', 'tax_lots', 'lot_history_events', 'exchange_rates'];
    return tables
      .map((table) => {
        const rows = sqliteDb.prepare(`SELECT * FROM ${table}`).all() as ReadonlyArray<
          Record<string, unknown>
        >;
        const ordered = rows
          .map((row) =>
            Object.keys(row)
              .sort()
              .map((key) => `${key}=${String(row[key])}`)
              .join('|'),
          )
          .sort();
        return `${table}:${ordered.join(';')}`;
      })
      .join('\n');
  };

  it('changes the displayed amounts and leaves the stored ones byte-identical', async () => {
    // The central architectural promise of this change: the display currency is a read-time concern
    // and is reversible at any moment. That only holds if reading in another currency writes nothing
    // — and "we did not write any code that writes" is not the same claim as "nothing was written".
    const before = ledgerFingerprint();

    const inEur = await adapter.getHoldingsSnapshot('acc-1', 'EUR');
    const inUsd = await adapter.getHoldingsSnapshot('acc-1', 'USD');

    // The displayed amounts did move, so the comparison below is not vacuously true over two reads
    // that did nothing.
    expect(inUsd[0].totalCostFiat).not.toBe(inEur[0].totalCostFiat);

    expect(ledgerFingerprint()).toBe(before);

    // And specifically: the lot still states the currency the source recorded, not the one just
    // requested. A conversion that rewrote this column would be unrecoverable.
    const lot = sqliteDb
      .prepare("SELECT fiat_currency, total_cost_fiat FROM tax_lots WHERE id = 'lot-1'")
      .get() as { fiat_currency: string; total_cost_fiat: string };
    expect(lot.fiat_currency).toBe('EUR');
    expect(new Decimal(lot.total_cost_fiat).equals(new Decimal('3000'))).toBe(true);
  });


  it('proves the fingerprint would notice a stored row changing', () => {
    // Without this, the assertion above passes just as well against a fingerprint that reads nothing:
    // two empty strings compare equal.
    const before = ledgerFingerprint();
    expect(before).toContain('tax_lots:');
    expect(before).toContain('fiat_currency=EUR');

    sqliteDb.prepare("UPDATE tax_lots SET fiat_currency = 'USD' WHERE id = 'lot-1'").run();
    expect(ledgerFingerprint()).not.toBe(before);

    sqliteDb.prepare("UPDATE tax_lots SET fiat_currency = 'EUR' WHERE id = 'lot-1'").run();
    expect(ledgerFingerprint()).toBe(before);
  });

  it('restores the original figure when the display currency switches away and back', async () => {
    // A self-referential pair, deliberately wrong, that a correct implementation must never read.
    //
    // It is here because without it this test cannot fail. Conversion is stateless per query, so
    // "switch away and back" holds by construction and the assertion would pass against any
    // implementation — including one that had dropped the identity cut entirely. With the row
    // present, dropping that cut makes the euro read resolve `EUR/EUR` and multiply the basis by
    // 1.5, and the round trip breaks. That is what makes this an assertion rather than a statement.
    sqliteDb
      .prepare(
        "INSERT INTO exchange_rates (date, pair, rate, source) VALUES ('2023-01-02', 'EUR/EUR', '1.5', 'ECB')",
      )
      .run();
    duckDb = new DuckDbAdapter();
    await duckDb.initialize(sqlitePath);
    adapter = new DuckDbPortfolioAnalyticsAdapter(duckDb);

    const first = await adapter.getHoldingsSnapshot('acc-1', 'EUR');
    await adapter.getHoldingsSnapshot('acc-1', 'USD');
    const back = await adapter.getHoldingsSnapshot('acc-1', 'EUR');

    expect(back[0].totalCostFiat).toBe(first[0].totalCostFiat);
    expect(back[0].currentValueFiat).toBe(first[0].currentValueFiat);
    expect(back[0].unrealizedPnlFiat).toBe(first[0].unrealizedPnlFiat);
    expect(back[0].currency).toBe(first[0].currency);

    // The euro read is the untouched basis, not the basis times 1.5: the identity applied no rate.
    expect(new Decimal(first[0].totalCostFiat).equals(new Decimal('3000'))).toBe(true);
  });

  it('returns to the same dollar figure across a round trip through euro', async () => {
    // The same journey from the other side. A conversion applied twice in opposite directions must
    // not accumulate: the native currency here is EUR, so this path is USD → EUR → USD and the
    // reciprocal is used on the outbound leg both times.
    const first = await adapter.getHoldingsSnapshot('acc-1', 'USD');
    await adapter.getHoldingsSnapshot('acc-1', 'EUR');
    const back = await adapter.getHoldingsSnapshot('acc-1', 'USD');

    expect(back[0].totalCostFiat).toBe(first[0].totalCostFiat);
    expect(back[0].currency).toBe('USD');
  });
});
