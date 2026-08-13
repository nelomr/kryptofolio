/**
 * A euro report built from dollar records is an AEAT figure; a dollar report is not.
 *
 * The tax base is a sum of completed events, and what each event earned is settled on the day it
 * happened. Converting the finished sum — or any single event at today's rate — reports a gain the
 * user never made, in a figure that changes every time the ECB publishes. So each event converts at
 * its own date, and the discriminator this suite relies on is that the latest rate in the ledger is
 * deliberately far from either event's rate: a total built from it is arithmetically distinguishable
 * from the correct one, rather than merely suspicious.
 *
 * `exchange_rates` is ECB-quoted and holds `USD/EUR` directly, so nothing here depends on the
 * twelve-decimal reciprocal bound.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import Decimal from 'decimal.js';
import { DuckDbAdapter, applyMigrations } from '@kryptofolio/database';
import { DuckDbTaxCalculatorAdapter } from '../DuckDbTaxCalculatorAdapter';

const YEAR = 2024;

/** Two event dates inside the reported year, and a later rate that must never be reached for. */
const RATES: ReadonlyArray<readonly [date: string, usdEur: string]> = [
  ['2024-02-10', '0.5'],
  ['2024-06-20', '0.8'],
  ['2025-12-01', '0.25'],
];

const EARLY_ON = '2024-02-10';
const LATE_ON = '2024-06-20';
const LATEST_ON = '2025-12-01';

const rateOn = (date: string): Decimal => new Decimal(RATES.find(([d]) => d === date)![1]);

/** Two disposals, in dollars, on the two dates that carry different rates. */
const EARLY_GAIN_USD = '100';
const LATE_GAIN_USD = '200';
/** One staking reward, in dollars, on the early date: income shares the rule, not just gains. */
const INCOME_USD = '40';

const expectMoney = (actual: string, expected: Decimal, label: string): void => {
  expect(
    new Decimal(actual).equals(expected),
    `${label}: got ${actual}, expected ${expected.toFixed()}`,
  ).toBe(true);
};

describe('tax report display-currency conversion', () => {
  let sqlitePath: string;
  let sqliteDb: DatabaseSync;
  let duckDb: DuckDbAdapter;
  let taxCalculator: DuckDbTaxCalculatorAdapter;

  beforeEach(async () => {
    sqlitePath = path.join(
      os.tmpdir(),
      `test_taxfx_${process.pid}_${Date.now()}_${Math.trunc(performance.now() * 1000)}.db`,
    );
    sqliteDb = new DatabaseSync(sqlitePath);
    sqliteDb.exec('PRAGMA foreign_keys = ON;');
    // The full migration set, not a hand-picked prefix: `fx_rate` and the nullable fiat magnitudes
    // arrive in 005 and 006, and the FIFO views bind against the current schema.
    applyMigrations(sqliteDb);

    sqliteDb
      .prepare("INSERT INTO accounts (id, name, type) VALUES ('acc-1', 'Kraken', 'exchange')")
      .run();

    const rate = sqliteDb.prepare(
      "INSERT INTO exchange_rates (date, pair, rate, source) VALUES (?, 'USD/EUR', ?, 'ECB')",
    );
    for (const [date, quote] of RATES) rate.run(date, quote);

    sqliteDb.prepare('INSERT INTO assets (id, symbol) VALUES (?, ?)').run('BTC', 'BTC');

    const buy = sqliteDb.prepare(
      `INSERT INTO spot_transactions (id, id_hash, account_id, tx_type, asset_in_id, amount_in,
         total_fiat, price_fiat, fiat_currency, timestamp, status)
       VALUES (?, ?, 'acc-1', ?, 'BTC', ?, ?, ?, 'USD', ?, 'COMPLETED')`,
    );
    const sell = sqliteDb.prepare(
      `INSERT INTO spot_transactions (id, id_hash, account_id, tx_type, asset_out_id, amount_out,
         total_fiat, price_fiat, fiat_currency, timestamp, status)
       VALUES (?, ?, 'acc-1', 'SELL', 'BTC', ?, ?, ?, 'USD', ?, 'COMPLETED')`,
    );
    const lot = sqliteDb.prepare(
      `INSERT INTO tax_lots (id, spot_transaction_id, asset_id, account_id, original_qty, remaining_qty,
         unit_cost_fiat, total_cost_fiat, fiat_currency, acquisition_timestamp, exchange_location, status)
       VALUES (?, ?, 'BTC', 'acc-1', '1', '0', ?, ?, 'USD', ?, 'Kraken', 'CLOSED')`,
    );
    const event = sqliteDb.prepare(
      `INSERT INTO lot_history_events (id, tax_lot_id, spot_transaction_id, account_id,
         amount_from_lot, sale_price_fiat, gain_loss_fiat, fiat_currency, is_taxable,
         disposal_type, disposal_date)
       VALUES (?, ?, ?, 'acc-1', '1', ?, ?, 'USD', 1, 'SELL', ?)`,
    );

    /**
     * A closed lot and the disposal that closed it. The gain is written rather than derived: this
     * suite is about what the report does to a settled figure, and deriving it here would test the
     * FIFO engine instead.
     */
    const seedDisposal = (id: string, gainUsd: string, on: string): void => {
      const cost = '1000';
      const proceeds = new Decimal(cost).plus(gainUsd).toFixed();
      buy.run(`tx-buy-${id}`, `h-buy-${id}`, 'BUY', '1', cost, cost, `${on}T09:00:00Z`);
      sell.run(`tx-sell-${id}`, `h-sell-${id}`, '1', proceeds, proceeds, `${on}T10:00:00Z`);
      lot.run(`lot-${id}`, `tx-buy-${id}`, cost, cost, `${on}T09:00:00Z`);
      event.run(`evt-${id}`, `lot-${id}`, `tx-sell-${id}`, proceeds, gainUsd, `${on}T10:00:00Z`);
    };

    seedDisposal('early', EARLY_GAIN_USD, EARLY_ON);
    seedDisposal('late', LATE_GAIN_USD, LATE_ON);

    buy.run('tx-income', 'h-income', 'STAKING', '1', INCOME_USD, INCOME_USD, `${EARLY_ON}T11:00:00Z`);

    process.env.MOCK_MODE = 'false';
    process.env.DUCKDB_PATH = ':memory:';
    process.env.PARQUET_DATA_PATH = fs.mkdtempSync(path.join(os.tmpdir(), 'prices-'));
    duckDb = new DuckDbAdapter();
    await duckDb.initialize(sqlitePath);

    taxCalculator = new DuckDbTaxCalculatorAdapter(duckDb);
  });

  afterEach(() => {
    sqliteDb.close();
    if (fs.existsSync(sqlitePath)) fs.unlinkSync(sqlitePath);
  });

  it('converts each event at its own date, so a USD ledger reports real euro gains', async () => {
    const usd = await taxCalculator.getSpanishTaxReport(YEAR, undefined, 'USD');
    const eur = await taxCalculator.getSpanishTaxReport(YEAR, undefined, 'EUR');

    // The records are dollars throughout, so the USD read is the identity: the native figures.
    const nativeGains = new Decimal(EARLY_GAIN_USD).plus(LATE_GAIN_USD);
    expectMoney(usd.spotCapitalGains, nativeGains, 'USD spotCapitalGains');
    expectMoney(usd.savingsBaseYields, new Decimal(INCOME_USD), 'USD savingsBaseYields');

    // Each event earns its own rate, so the euro total is the sum of two separately converted
    // figures — not the dollar total scaled by any single rate.
    const expectedEurGains = new Decimal(EARLY_GAIN_USD)
      .times(rateOn(EARLY_ON))
      .plus(new Decimal(LATE_GAIN_USD).times(rateOn(LATE_ON)));
    expectMoney(eur.spotCapitalGains, expectedEurGains, 'EUR spotCapitalGains');

    // Income is a completed event too, and takes the rate of the day it was received.
    expectMoney(
      eur.savingsBaseYields,
      new Decimal(INCOME_USD).times(rateOn(EARLY_ON)),
      'EUR savingsBaseYields',
    );

    // The figure must genuinely move between the two reads: the failure mode is a dollar number
    // wearing a euro label, and it passes every test that only checks one currency.
    expect(
      new Decimal(eur.spotCapitalGains).equals(usd.spotCapitalGains),
      'spotCapitalGains identical in USD and EUR',
    ).toBe(false);

    // A uniform scaling is the other way to get a plausible wrong answer, so both uniform
    // candidates are excluded by name rather than left to the total's coincidence.
    for (const [label, uniform] of [
      ['the earlier rate', rateOn(EARLY_ON)],
      ['the later rate', rateOn(LATE_ON)],
    ] as const) {
      expect(
        new Decimal(eur.spotCapitalGains).equals(nativeGains.times(uniform)),
        `EUR spotCapitalGains equals the dollar total scaled by ${label}`,
      ).toBe(false);
    }
  });

  it('derives no figure from the latest rate in the ledger', async () => {
    const eur = await taxCalculator.getSpanishTaxReport(YEAR, undefined, 'EUR');

    // The current rate is the one a reader would reach for by default, and it is the one that makes
    // a filed return wrong. Asserting the total is not it is the point of the assertion.
    const atLatestRate = new Decimal(EARLY_GAIN_USD)
      .plus(LATE_GAIN_USD)
      .times(rateOn(LATEST_ON));
    expect(
      new Decimal(eur.spotCapitalGains).equals(atLatestRate),
      'EUR spotCapitalGains was converted at the latest rate',
    ).toBe(false);

    expect(
      new Decimal(eur.savingsBaseYields).equals(
        new Decimal(INCOME_USD).times(rateOn(LATEST_ON)),
      ),
      'EUR savingsBaseYields was converted at the latest rate',
    ).toBe(false);
  });

  it('states the currency its figures are expressed in', async () => {
    const eur = await taxCalculator.getSpanishTaxReport(YEAR, undefined, 'EUR');

    // Without this the caller has a number and no way to know which currency it is in, which is the
    // condition under which a USD total gets filed as a Spanish return.
    expect(eur.currency).toBe('EUR');
  });

  it('keeps calculateLotsAndEvents native, because that read is what gets persisted', async () => {
    // FifoMaterializerService writes lots and events to SQLite from exactly this method. A converted
    // figure reaching it is persisted, and a persisted euro amount is then indistinguishable from a
    // natively-euro one — silent and unrecoverable. Decision 10 already rules it out in principle:
    // the display currency does not exist at materialisation time, which is when the row is written.
    //
    // This assertion is a fence, not a feature. It exists so the obvious shortcut — "convert here,
    // both readers get it for free" — cannot be taken by someone who has not read Decision 14.
    const { events } = await taxCalculator.calculateLotsAndEvents();

    // Rows come from `v_calculated_lot_history_events`, which recomputes the FIFO rather than
    // reading the materialised table, so its ids are derived and the assertion is on the figures.
    expect(events.length, 'the calculated view produced no events to fence').toBeGreaterThan(0);

    // Every figure stays in the currency the ledger recorded. This is the whole fence: the moment
    // one of them arrives in EUR, the materialiser writes EUR into `lot_history_events`.
    expect(events.map((e) => e.fiat_currency)).toEqual(events.map(() => 'USD'));

    // And no figure may equal what it *would* be after a display conversion — the check that fails
    // if someone applies the rate here rather than in the read built for it.
    for (const event of events) {
      for (const [label, converted] of [
        ['the early rate', new Decimal(EARLY_GAIN_USD).times(rateOn(EARLY_ON))],
        ['the late rate', new Decimal(LATE_GAIN_USD).times(rateOn(LATE_ON))],
      ] as const) {
        expect(
          event.gain_loss_fiat !== null &&
            new Decimal(String(event.gain_loss_fiat)).equals(converted),
          `a gain from calculateLotsAndEvents was already converted at ${label}`,
        ).toBe(false);
      }
    }

    // The signature carries no currency, so there is nowhere for a display currency to enter. The
    // parameter list is asserted rather than counted: an arity of one would be satisfied by a
    // currency parameter just as well as by the account filter.
    //
    // Read off the compiled function, where TypeScript's `?` no longer exists.
    const parameters = String(taxCalculator.calculateLotsAndEvents)
      .slice(
        String(taxCalculator.calculateLotsAndEvents).indexOf('(') + 1,
        String(taxCalculator.calculateLotsAndEvents).indexOf(')'),
      )
      .split(',')
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
    expect(parameters).toEqual(['accountId']);
  });

  describe('the per-event converted read', () => {
    it('converts each disposal at its own date, carrying the rate it used', async () => {
      const rows = await taxCalculator.getConvertedDisposalEvents({ kind: 'FISCAL_YEAR', year: YEAR }, undefined, 'EUR');

      const early = rows.find((r) => r.id === 'evt-early');
      const late = rows.find((r) => r.id === 'evt-late');
      expect(early, 'evt-early missing').toBeDefined();
      expect(late, 'evt-late missing').toBeDefined();

      // Each row states its own outcome, so a reader never has to infer one from a rate value.
      expect(early!.gainLoss?.kind).toBe('CONVERTED');
      expect(late!.gainLoss?.kind).toBe('CONVERTED');

      if (early!.gainLoss?.kind !== 'CONVERTED' || late!.gainLoss?.kind !== 'CONVERTED') {
        throw new Error('expected both gains to be CONVERTED');
      }

      expectMoney(
        early!.gainLoss.amount,
        new Decimal(EARLY_GAIN_USD).times(rateOn(EARLY_ON)),
        'early gain',
      );
      expectMoney(
        late!.gainLoss.amount,
        new Decimal(LATE_GAIN_USD).times(rateOn(LATE_ON)),
        'late gain',
      );

      // The rate travels inside the outcome rather than as a sibling column: the row already has an
      // `fx_rate`, and that one means the FIFO's own hop, not this one.
      expect(early!.gainLoss.rateDate).toBe(EARLY_ON);
      expect(late!.gainLoss.rateDate).toBe(LATE_ON);
      expect(
        early!.gainLoss.rate === late!.gainLoss.rate,
        'two disposals of different dates used the same rate',
      ).toBe(false);
    });

    it('reports the identity read as NATIVE, not as a conversion at rate one', async () => {
      const rows = await taxCalculator.getConvertedDisposalEvents({ kind: 'FISCAL_YEAR', year: YEAR }, undefined, 'USD');
      const early = rows.find((r) => r.id === 'evt-early');

      expect(early!.gainLoss?.kind).toBe('NATIVE');
      if (early!.gainLoss?.kind !== 'NATIVE') throw new Error('expected NATIVE');
      // Bit for bit: a figure already in the requested currency must not round-trip through a rate.
      expectMoney(early!.gainLoss.amount, new Decimal(EARLY_GAIN_USD), 'native early gain');
    });

    it('keeps an unresolved figure null, distinct from an unconvertible one', async () => {
      // `sale_price_fiat` and `gain_loss_fiat` are nullable in the ledger: null means the engine
      // never resolved a price. That is a third state, and collapsing it into UNCONVERTIBLE would
      // report a missing rate where the truth is a missing price — a different remedy.
      sqliteDb
        .prepare(
          `INSERT INTO spot_transactions (id, id_hash, account_id, tx_type, asset_out_id, amount_out,
             total_fiat, price_fiat, fiat_currency, timestamp, status)
           VALUES ('tx-sell-noprice', 'h-noprice', 'acc-1', 'SELL', 'BTC', '1', '0', '0', 'USD',
                   '${LATE_ON}T11:00:00Z', 'COMPLETED')`,
        )
        .run();
      sqliteDb
        .prepare(
          `INSERT INTO lot_history_events (id, tax_lot_id, spot_transaction_id, account_id,
             amount_from_lot, sale_price_fiat, gain_loss_fiat, fiat_currency, is_taxable,
             disposal_type, disposal_date)
           VALUES ('evt-noprice', 'lot-late', 'tx-sell-noprice', 'acc-1', '1', NULL, NULL, 'USD', 0,
                   'SELL', '${LATE_ON}T11:00:00Z')`,
        )
        .run();

      const rows = await taxCalculator.getConvertedDisposalEvents({ kind: 'FISCAL_YEAR', year: YEAR }, undefined, 'EUR');
      const unresolved = rows.find((r) => r.id === 'evt-noprice');

      expect(unresolved, 'evt-noprice missing').toBeDefined();
      expect(unresolved!.gainLoss).toBeNull();
    });
  });

  it('reports a fully convertible period as complete', async () => {
    const eur = await taxCalculator.getSpanishTaxReport(YEAR, undefined, 'EUR');

    // The counterpart of the incompleteness assertions below: a period that says it is incomplete
    // whenever anything is unusual is as useless as one that never says it.
    expect(eur.unconvertibleEvents).toEqual([]);
  });

  describe('an event no rate can cover', () => {
    /** Earlier than every rate in the ledger, so resolution has nothing to look back to. */
    const UNCOVERED_ON = `${YEAR}-01-03`;
    const UNCOVERED_GAIN_USD = '70';

    beforeEach(async () => {
      sqliteDb
        .prepare(
          `INSERT INTO spot_transactions (id, id_hash, account_id, tx_type, asset_out_id, amount_out,
             total_fiat, price_fiat, fiat_currency, timestamp, status)
           VALUES ('tx-sell-uncovered', 'h-sell-uncovered', 'acc-1', 'SELL', 'BTC', '1',
                   '1070', '1070', 'USD', '${UNCOVERED_ON}T10:00:00Z', 'COMPLETED')`,
        )
        .run();
      sqliteDb
        .prepare(
          `INSERT INTO spot_transactions (id, id_hash, account_id, tx_type, asset_in_id, amount_in,
             total_fiat, price_fiat, fiat_currency, timestamp, status)
           VALUES ('tx-buy-uncovered', 'h-buy-uncovered', 'acc-1', 'BUY', 'BTC', '1',
                   '1000', '1000', 'USD', '${UNCOVERED_ON}T09:00:00Z', 'COMPLETED')`,
        )
        .run();
      sqliteDb
        .prepare(
          `INSERT INTO tax_lots (id, spot_transaction_id, asset_id, account_id, original_qty,
             remaining_qty, unit_cost_fiat, total_cost_fiat, fiat_currency, acquisition_timestamp,
             exchange_location, status)
           VALUES ('lot-uncovered', 'tx-buy-uncovered', 'BTC', 'acc-1', '1', '0', '1000', '1000',
                   'USD', '${UNCOVERED_ON}T09:00:00Z', 'Kraken', 'CLOSED')`,
        )
        .run();
      sqliteDb
        .prepare(
          `INSERT INTO lot_history_events (id, tax_lot_id, spot_transaction_id, account_id,
             amount_from_lot, sale_price_fiat, gain_loss_fiat, fiat_currency, is_taxable,
             disposal_type, disposal_date)
           VALUES ('evt-uncovered', 'lot-uncovered', 'tx-sell-uncovered', 'acc-1', '1', '1070',
                   '${UNCOVERED_GAIN_USD}', 'USD', 1, 'SELL', '${UNCOVERED_ON}T10:00:00Z')`,
        )
        .run();

      // The FIFO chain reads the ledger through the sqlite extension, so the rows above have to be
      // present before the views are built.
      duckDb = new DuckDbAdapter();
      await duckDb.initialize(sqlitePath);
      taxCalculator = new DuckDbTaxCalculatorAdapter(duckDb);
    });

    it('identifies the event instead of dropping it, and says the period is incomplete', async () => {
      const eur = await taxCalculator.getSpanishTaxReport(YEAR, undefined, 'EUR');

      // Identified, not omitted: a total quietly missing one disposal is indistinguishable from a
      // correct one, and the user has no way to learn which figure is absent or what it was worth.
      expect(eur.unconvertibleEvents.map((e) => e.id)).toEqual(['evt-uncovered']);

      // Carrying the native figure is the difference between "we could not express this" and
      // "this was nothing". A zero here would read as a disposal that earned nothing.
      const reported = eur.unconvertibleEvents[0]!;
      expectMoney(reported.nativeAmount, new Decimal(UNCOVERED_GAIN_USD), 'native amount');
      expect(reported.nativeCurrency).toBe('USD');

      // And it must not have been added to the euro total at a factor of one, which is the shape
      // this project has already shipped once: 70 dollars counted as 70 euros.
      const convertibleOnly = new Decimal(EARLY_GAIN_USD)
        .times(rateOn(EARLY_ON))
        .plus(new Decimal(LATE_GAIN_USD).times(rateOn(LATE_ON)));
      expectMoney(eur.spotCapitalGains, convertibleOnly, 'EUR spotCapitalGains');
      expect(
        new Decimal(eur.spotCapitalGains).equals(
          convertibleOnly.plus(UNCOVERED_GAIN_USD),
        ),
        'the unconvertible gain entered the euro total at a factor of one',
      ).toBe(false);
    });

    it('reports the same event as complete when read in its own currency', async () => {
      const usd = await taxCalculator.getSpanishTaxReport(YEAR, undefined, 'USD');

      // The lot is sound; only the requested currency was unreachable. Read natively there is no
      // defect to report, and the figure is present in the total.
      expect(usd.unconvertibleEvents).toEqual([]);
      expectMoney(
        usd.spotCapitalGains,
        new Decimal(EARLY_GAIN_USD).plus(LATE_GAIN_USD).plus(UNCOVERED_GAIN_USD),
        'USD spotCapitalGains',
      );
    });

    it('leaves the event\'s persisted quality flag untouched', async () => {
      await taxCalculator.getSpanishTaxReport(YEAR, undefined, 'EUR');

      // A display conversion that fails is not a lot quality defect: the flag column is written at
      // materialisation time, when the display currency is not even known.
      const stored = sqliteDb
        .prepare("SELECT quality_flag FROM lot_history_events WHERE id = 'evt-uncovered'")
        .get() as { quality_flag: string | null };
      expect(stored.quality_flag).toBeNull();
    });
  });
});
