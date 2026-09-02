/**
 * A display conversion that fails is not a lot quality defect.
 *
 * `MISSING_FX_RATE` is persisted on the lot, carries a severity and is read by the tax
 * report: it says the engine could not build the basis. A display conversion failing says
 * the lot is sound and the *view* cannot express it in the requested currency — read-time,
 * never persisted, and unpersistable in principle, since the display currency is unknown
 * when the flag column is written.
 *
 * Conflating the two produces a lot that reads as defective in EUR and healthy in USD. So
 * every assertion here reads the two signals from two different places on purpose: the flag
 * from `v_calculated_tax_lots`, the outcome from `HoldingsSnapshot.costBasis`.
 *
 * The failure mode being fenced off is not only a blank or a zero. `COALESCE(fx.rate, 1)`
 * returns the euro number wearing a dollar label, which is the most expensive kind of wrong
 * because it is the right order of magnitude — several assertions below therefore rule out
 * the identity factor explicitly rather than only checking that something was returned.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import Decimal from 'decimal.js';
import { DuckDbAdapter } from '@kryptofolio/database';
import {
  isConvertible,
  nativeAmountOf,
  type ConvertedAmount,
} from '@kryptofolio/shared-types';
import { DuckDbPortfolioAnalyticsAdapter } from '../DuckDbPortfolioAnalyticsAdapter';
import { DuckDbMetricsAdapter } from '../DuckDbMetricsAdapter';
import type { HoldingsSnapshot } from '../../../domain/ports/IPortfolioAnalyticsPort';

/**
 * `005` is what makes `total_fiat` nullable, and a nullable `total_fiat` is the only way to
 * build the fixture task 6.3 needs: a reward with no stated fiat total, valued from a price
 * series in another currency, which is what makes the engine reach for an FX rate and record
 * `MISSING_FX_RATE` when none resolves.
 */
const MIGRATIONS = [
  '002_ledger_schema',
  '003_currency_schema',
  '004_fifo_traceability',
  '005_nullable_fiat_magnitudes',
  '006_fx_conversion_provenance',
  '007_futures_collateral_movements',
].map((name) =>
  fs.readFileSync(
    path.resolve(__dirname, `../../../../../../../packages/database/migrations/sqlite/${name}.sql`),
    'utf-8',
  ),
);

const ACCOUNT = 'acc-1';

/**
 * Every rate is chosen so its reciprocal is exact at the twelve decimal places `v_fx_daily`
 * bounds an inversion to: `exchange_rates` holds `USD/EUR` only and `EUR/USD` is derived, so
 * a fixture whose expectation depended on the twelfth place would fail for a rounding reason
 * rather than for the reason under test.
 */
const RATES: ReadonlyArray<readonly [date: string, usdPerEurQuote: string, eurUsd: string]> = [
  ['2024-01-15', '0.8', '1.25'],
  ['2025-12-01', '0.25', '4'],
];

const EUR_USD_ON = (date: string): Decimal => new Decimal(RATES.find(([d]) => d === date)![2]);
const USD_EUR_ON = (date: string): Decimal => new Decimal(RATES.find(([d]) => d === date)![1]);

/** Older than every rate in the ledger, so nothing resolves backward from it. */
const PRE_LEDGER = '2020-01-02T10:00:00Z';

interface Fixture {
  readonly analytics: DuckDbPortfolioAnalyticsAdapter;
  readonly metrics: DuckDbMetricsAdapter;
  readonly duckDb: DuckDbAdapter;
}

interface Seeder {
  /** A fiat-denominated buy: the basis is recorded, so no FX is consulted at materialisation. */
  readonly buy: (
    symbol: string,
    qty: string,
    unitCost: string,
    currency: string,
    timestamp: string,
  ) => void;
  /**
   * A reward with no stated fiat total. Its value comes from the price series, and when that
   * series is denominated in another currency the engine must convert — which is the only
   * path that produces a genuine persisted `MISSING_FX_RATE`.
   */
  readonly reward: (
    symbol: string,
    qty: string,
    reportingCurrency: string,
    timestamp: string,
  ) => void;
  /** A price series point, in whatever currency the series is published in. */
  readonly price: (symbol: string, close: string, date: string, currency: string) => void;
}

interface PendingPrice {
  readonly symbol: string;
  readonly close: string;
  readonly date: string;
  readonly currency: string;
}

const cleanups: Array<() => void> = [];

afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

/**
 * Built per test rather than in a `beforeEach`: `getKpis` aggregates the whole ledger, and
 * "a total that reports itself incomplete" and "a total that does not" cannot be two states
 * of one database.
 */
async function createFixture(seed: (s: Seeder) => void): Promise<Fixture> {
  const sqlitePath = path.join(
    os.tmpdir(),
    `test_unconvertible_${process.pid}_${Date.now()}_${Math.trunc(performance.now() * 1000)}.db`,
  );
  const sqliteDb = new DatabaseSync(sqlitePath);
  sqliteDb.exec('PRAGMA foreign_keys = ON;');
  for (const sql of MIGRATIONS) sqliteDb.exec(sql);

  sqliteDb
    .prepare('INSERT INTO accounts (id, name, type) VALUES (?, ?, ?)')
    .run(ACCOUNT, 'Kraken', 'exchange');

  const rate = sqliteDb.prepare(
    "INSERT INTO exchange_rates (date, pair, rate, source) VALUES (?, 'USD/EUR', ?, 'ECB')",
  );
  for (const [date, quote] of RATES) rate.run(date, quote);

  const asset = sqliteDb.prepare('INSERT INTO assets (id, symbol) VALUES (?, ?)');
  const seen = new Set<string>();
  const ensureAsset = (symbol: string): void => {
    if (seen.has(symbol)) return;
    seen.add(symbol);
    asset.run(symbol, symbol);
  };

  const buyStmt = sqliteDb.prepare(
    `INSERT INTO spot_transactions (id, id_hash, account_id, tx_type, asset_in_id, amount_in,
       total_fiat, price_fiat, fiat_currency, timestamp, status)
     VALUES (?, ?, ?, 'BUY', ?, ?, ?, ?, ?, ?, 'COMPLETED')`,
  );
  const rewardStmt = sqliteDb.prepare(
    `INSERT INTO spot_transactions (id, id_hash, account_id, tx_type, asset_in_id, amount_in,
       total_fiat, price_fiat, fiat_currency, timestamp, status)
     VALUES (?, ?, ?, 'STAKING', ?, ?, NULL, NULL, ?, ?, 'COMPLETED')`,
  );

  const prices: PendingPrice[] = [];
  seed({
    buy: (symbol, qty, unitCost, currency, timestamp) => {
      ensureAsset(symbol);
      const basis = new Decimal(unitCost).times(qty).toFixed();
      buyStmt.run(
        `tx-${symbol}`,
        `h-${symbol}`,
        ACCOUNT,
        symbol,
        qty,
        basis,
        unitCost,
        currency,
        timestamp,
      );
    },
    reward: (symbol, qty, reportingCurrency, timestamp) => {
      ensureAsset(symbol);
      rewardStmt.run(
        `tx-${symbol}`,
        `h-${symbol}`,
        ACCOUNT,
        symbol,
        qty,
        reportingCurrency,
        timestamp,
      );
    },
    price: (symbol, close, date, currency) => {
      prices.push({ symbol, close, date, currency });
    },
  });

  sqliteDb.close();

  process.env.MOCK_MODE = 'false';
  process.env.DUCKDB_PATH = ':memory:';
  process.env.PARQUET_DATA_PATH = fs.mkdtempSync(path.join(os.tmpdir(), 'prices-'));
  const duckDb = new DuckDbAdapter();
  await duckDb.initialize(sqlitePath);

  for (const p of prices) {
    await duckDb.execute(
      `INSERT INTO _price_seed (symbol, close, date, currency)
       VALUES ('${p.symbol}', ${p.close}, DATE '${p.date}', '${p.currency}')`,
    );
  }

  cleanups.push(() => {
    if (fs.existsSync(sqlitePath)) fs.unlinkSync(sqlitePath);
  });

  return {
    analytics: new DuckDbPortfolioAnalyticsAdapter(duckDb),
    metrics: new DuckDbMetricsAdapter(duckDb),
    duckDb,
  };
}

async function holdingOf(
  fixture: Fixture,
  symbol: string,
  currency: string,
): Promise<HoldingsSnapshot> {
  const holdings = await fixture.analytics.getHoldingsSnapshot(ACCOUNT, currency);
  const row = holdings.find((h) => h.symbol === symbol);
  expect(row, `no holding returned for ${symbol} in ${currency}`).toBeDefined();
  return row!;
}

/**
 * Read through a helper so a missing field fails as a named assertion rather than as a
 * `TypeError` on the next line, which would report the shape of the test instead of the
 * shape of the defect.
 */
function costBasisOf(row: HoldingsSnapshot): ConvertedAmount {
  const value: ConvertedAmount | undefined = row.costBasis;
  expect(value, `holding ${row.symbol} returned no costBasis`).toBeDefined();
  return value!;
}

async function qualityFlagOf(fixture: Fixture, symbol: string): Promise<string | null> {
  const rows = await fixture.duckDb.queryMany<{ quality_flag: string | null }>(
    `SELECT quality_flag FROM v_calculated_tax_lots WHERE spot_transaction_id = 'tx-${symbol}'`,
  );
  expect(rows.length, `no calculated lot for ${symbol}`).toBe(1);
  return rows[0].quality_flag;
}

describe('unconvertible display figures', () => {
  it('reports a lot older than every stored rate as UNCONVERTIBLE, carrying its native figure', async () => {
    const fixture = await createFixture((s) => {
      s.buy('PRELEDGER', '1', '1000', 'EUR', PRE_LEDGER);
    });

    const basis = costBasisOf(await holdingOf(fixture, 'PRELEDGER', 'USD'));

    expect(basis.kind).toBe('UNCONVERTIBLE');
    expect(isConvertible(basis)).toBe(false);
    // Named individually because each is a distinct wrong answer this arm exists to exclude:
    // CONVERTED would claim a rate that does not exist, NATIVE would claim the request was
    // already satisfied.
    expect(basis.kind).not.toBe('CONVERTED');
    expect(basis.kind).not.toBe('NATIVE');

    const reported = nativeAmountOf(basis);
    expect(reported.currency).toBe('EUR');
    expect(new Decimal(reported.amount).equals(new Decimal('1000'))).toBe(true);
    expect(new Decimal(reported.amount).isZero(), 'the honest figure was replaced by a zero').toBe(
      false,
    );

    if (basis.kind === 'UNCONVERTIBLE') {
      expect(basis.nativeCurrency).toBe('EUR');
      expect(basis.requested).toBe('USD');
      expect(new Decimal(basis.nativeAmount).equals(new Decimal('1000'))).toBe(true);
    }

    // The figure must not have been silently converted at any rate the ledger does hold —
    // the identity factor included, which is what `COALESCE(fx.rate, 1)` produces today.
    for (const [date] of RATES) {
      expect(
        new Decimal(reported.amount).equals(new Decimal('1000').times(EUR_USD_ON(date))),
        `the native figure equals the basis converted at the ${date} rate`,
      ).toBe(false);
    }
  });

  it('leaves the persisted quality flag untouched, in either display currency', async () => {
    const fixture = await createFixture((s) => {
      s.buy('PRELEDGER', '1', '1000', 'EUR', PRE_LEDGER);
    });

    const before = await qualityFlagOf(fixture, 'PRELEDGER');
    expect(before, 'the fixture lot is defective before any display request').toBeNull();

    const inUsd = costBasisOf(await holdingOf(fixture, 'PRELEDGER', 'USD'));
    expect(inUsd.kind).toBe('UNCONVERTIBLE');

    expect(
      await qualityFlagOf(fixture, 'PRELEDGER'),
      'a failed display conversion was written back onto the lot as a defect',
    ).toBeNull();

    // The same lot, same database, asked for in the currency it is already denominated in:
    // sound, and stated as such. A lot that reads defective in one currency and healthy in
    // another is exactly the conflation this separation exists to prevent.
    const inEur = costBasisOf(await holdingOf(fixture, 'PRELEDGER', 'EUR'));
    expect(inEur.kind).toBe('NATIVE');
    if (inEur.kind === 'NATIVE') {
      expect(inEur.currency).toBe('EUR');
      expect(new Decimal(inEur.amount).equals(new Decimal('1000'))).toBe(true);
    }
    expect(await qualityFlagOf(fixture, 'PRELEDGER')).toBeNull();
  });

  it('reports a genuine MISSING_FX_RATE independently of the display conversion outcome', async () => {
    const fixture = await createFixture((s) => {
      // A reward with no stated total, valued from a USD series while the transaction reports
      // in EUR, dated before any stored rate: the engine needs USD/EUR, none resolves backward,
      // and the lot is persisted as MISSING_FX_RATE.
      s.reward('ETH', '3', 'EUR', '2022-05-09T09:00:00Z');
      s.price('ETH', '2100.75', '2022-05-09', 'USD');
    });

    expect(await qualityFlagOf(fixture, 'ETH')).toBe('MISSING_FX_RATE');

    // Asked for in its own reporting currency, no display conversion is required at all — so
    // the defect and the outcome disagree, which is only possible because they are two signals.
    const inEur = costBasisOf(await holdingOf(fixture, 'ETH', 'EUR'));
    expect(inEur.kind).toBe('NATIVE');
    expect(isConvertible(inEur)).toBe(true);
    expect(await qualityFlagOf(fixture, 'ETH')).toBe('MISSING_FX_RATE');

    // Asked for in USD, the display conversion fails too — for its own reason, and without
    // changing the flag.
    const inUsd = costBasisOf(await holdingOf(fixture, 'ETH', 'USD'));
    expect(inUsd.kind).toBe('UNCONVERTIBLE');
    expect(await qualityFlagOf(fixture, 'ETH')).toBe('MISSING_FX_RATE');
  });

  it('marks a total that aggregates an unconvertible lot as incomplete', async () => {
    const fixture = await createFixture((s) => {
      s.buy('COVERED', '1', '1000', 'EUR', '2024-01-15T10:00:00Z');
      s.buy('PRELEDGER', '1', '500', 'EUR', PRE_LEDGER);
      // Both assets are priced, because `v_portfolio_daily_valuation` marks a point with no
      // price series as unconvertible too. Without these rows the flag would be true for a
      // missing price rather than for the missing rate under test.
      s.price('COVERED', '1000', '2024-01-15', 'EUR');
      s.price('PRELEDGER', '500', '2020-01-02', 'EUR');
    });

    const kpis = await fixture.metrics.getKpis('USD');

    expect(kpis.ratesIncomplete).toBe(true);

    // The unconvertible lot contributes nothing, and `ratesIncomplete` is what makes that
    // absence distinguishable from a lot genuinely acquired for free. Passing it through at a
    // factor of one instead would put 500 EUR into a dollar total as 500 USD.
    const converted = new Decimal('1000').times(EUR_USD_ON('2024-01-15'));
    expect(new Decimal(kpis.totalCostBasis).equals(converted)).toBe(true);
    expect(
      new Decimal(kpis.totalCostBasis).equals(converted.plus('500')),
      'the unconvertible lot was added to a dollar total at its unconverted euro value',
    ).toBe(false);
  });

  it('does not mark a fully convertible ledger as incomplete', async () => {
    const fixture = await createFixture((s) => {
      s.buy('COVERED', '1', '1000', 'EUR', '2024-01-15T10:00:00Z');
      s.price('COVERED', '1000', '2024-01-15', 'EUR');
    });

    const kpis = await fixture.metrics.getKpis('USD');

    expect(kpis.ratesIncomplete).toBe(false);
    expect(
      new Decimal(kpis.totalCostBasis).equals(new Decimal('1000').times(EUR_USD_ON('2024-01-15'))),
    ).toBe(true);
  });

  it('reports an unpriced asset as a price gap, not as incomplete exchange rates', async () => {
    const fixture = await createFixture((s) => {
      s.buy('COVERED', '1', '1000', 'EUR', '2024-01-15T10:00:00Z');
      s.price('COVERED', '1000', '2024-01-15', 'EUR');
      // Acquired on a date the FX ledger covers, so its basis converts; it simply has no price
      // series. This is the only fixture shape that isolates the two signals — a lot older than
      // every rate makes the daily series older than every rate too, so both would fire.
      s.buy('UNPRICED', '1', '250', 'EUR', '2024-01-15T10:00:00Z');
    });

    const kpis = await fixture.metrics.getKpis('USD');

    expect(
      kpis.ratesIncomplete,
      'a ledger with complete FX coverage reported its exchange rates incomplete because one ' +
        'asset has no price series — the remedy is to seed prices, not rates',
    ).toBe(false);
    expect(kpis.pricesIncomplete).toBe(true);

    // The unpriced asset still contributes nothing to equity; separating the signals must not
    // reintroduce it. Its basis, in contrast, converts normally — the gap is in the valuation.
    expect(
      new Decimal(kpis.totalCostBasis).equals(
        new Decimal('1250').times(EUR_USD_ON('2024-01-15')),
      ),
    ).toBe(true);
  });

  it('reports a fully priced, fully covered ledger as complete on both signals', async () => {
    const fixture = await createFixture((s) => {
      s.buy('COVERED', '1', '1000', 'EUR', '2024-01-15T10:00:00Z');
      s.price('COVERED', '1000', '2024-01-15', 'EUR');
    });

    const kpis = await fixture.metrics.getKpis('USD');

    expect(kpis.ratesIncomplete).toBe(false);
    expect(kpis.pricesIncomplete).toBe(false);
  });

  it('emits a converted figure of order 1e-9 as a plain decimal', async () => {
    const fixture = await createFixture((s) => {
      s.buy('TINY', '1', '0.000000001', 'EUR', '2024-01-15T10:00:00Z');
    });

    const basis = costBasisOf(await holdingOf(fixture, 'TINY', 'USD'));
    expect(basis.kind).toBe('CONVERTED');

    const amount = nativeAmountOf(basis).amount;
    expect(amount).not.toMatch(/e[-+]/i);
    expect(new Decimal(amount).equals(new Decimal('0.000000001').times(EUR_USD_ON('2024-01-15')))).toBe(
      true,
    );
  });

  it('flags a non-zero basis that the display conversion cannot represent, rather than reporting zero', async () => {
    const fixture = await createFixture((s) => {
      // One wei of value. Exactly representable at the DECIMAL(38,18) the ledger carries, so
      // the lot itself is sound; the 0.25 rate on its acquisition date drops the product to
      // 2.5e-19, which that same scale cannot hold and rounds to zero. A cost basis of zero is
      // a phantom hundred-percent gain, so it must be stated as unrepresentable, not returned.
      s.buy('SUBPRECISION', '1', '0.000000000000000001', 'USD', '2025-12-01T10:00:00Z');
    });

    expect(await qualityFlagOf(fixture, 'SUBPRECISION'), 'the lot itself is defective').toBeNull();

    const basis = costBasisOf(await holdingOf(fixture, 'SUBPRECISION', 'EUR'));
    const reported = nativeAmountOf(basis);

    expect(
      new Decimal(reported.amount).isZero(),
      'a non-zero cost basis was silently reported as zero',
    ).toBe(false);
    expect(reported.amount).not.toMatch(/e[-+]/i);

    // Stated for the record: the product the engine cannot represent is genuinely below the
    // scale, so no rounding bound recovers it — reporting it is the only honest option.
    expect(
      new Decimal('0.000000000000000001')
        .times(USD_EUR_ON('2025-12-01'))
        .lessThan(new Decimal('0.5e-18')),
    ).toBe(true);
  });
});
