/**
 * FX conversion inside the FIFO valuation path.
 *
 * Before this behaviour existed, a price series denominated in anything other than the transaction's
 * reporting currency produced `CURRENCY_MISMATCH` and a cost basis masked to `0` — 544 of 578 lots on
 * the real ledger. The price was there and the rate was there; only the multiplication was missing.
 *
 * The three currency outcomes are asserted as three distinct states, because collapsing any two of
 * them is the defect this suite exists to prevent: convertible (a real basis, no flag), no rate
 * (`MISSING_FX_RATE`, masked), and a manual override in a foreign currency (`CURRENCY_MISMATCH`,
 * masked).
 */

import { describe, it, expect, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DuckDbAdapter } from '../../src/adapters/DuckDbAdapter.js';
import { applyMigrations } from '../helpers/migrations.js';

const ACCOUNT = 'acc-b2m';
const REPORTING = 'EUR';

/** The real figures from the live ledger: a B2M staking reward priced in USD, valued in EUR. */
const USD_PRICE = '0.015692281';
const USD_EUR_RATE = '0.918695';
const QTY = '100';

interface TxSpec {
  readonly id: string;
  readonly tx_type: string;
  readonly timestamp: string;
  readonly asset_in_id?: string;
  readonly amount_in?: string;
  readonly asset_out_id?: string;
  readonly amount_out?: string;
  readonly fee_asset_id?: string;
  readonly fee_amount?: string;
  readonly total_fiat?: string | null;
  readonly fiat_currency?: string;
}

interface PriceSpec {
  readonly symbol: string;
  readonly close: string;
  readonly date: string;
  readonly currency: string;
}

interface RateSpec {
  readonly date: string;
  readonly pair: string;
  readonly rate: string;
  readonly source?: string;
}

interface OverrideSpec {
  readonly idHash: string;
  readonly priceFiat: string;
  readonly currency: string;
}

interface LotRow {
  readonly id: string;
  readonly spot_transaction_id: string;
  readonly symbol: string;
  readonly unit_cost_fiat: string;
  readonly total_cost_fiat: string;
  readonly quality_flag: string | null;
  readonly value_provenance: string;
  readonly fx_rate: string | null;
  readonly fx_rate_date: string | null;
  readonly original_qty: string;
}

interface EventRow {
  readonly spot_transaction_id: string;
  readonly disposal_type: string;
  readonly sale_price_fiat: string | null;
  readonly gain_loss_fiat: string | null;
  readonly quality_flag: string | null;
  readonly is_taxable: number;
  readonly value_provenance: string;
  readonly fx_rate: string | null;
  readonly fx_rate_date: string | null;
}

interface HarnessSpec {
  readonly label: string;
  readonly txs: readonly TxSpec[];
  readonly prices?: readonly PriceSpec[];
  readonly rates?: readonly RateSpec[];
  readonly overrides?: readonly OverrideSpec[];
}

interface Harness {
  readonly duckDb: DuckDbAdapter;
  readonly lots: () => Promise<LotRow[]>;
  readonly events: () => Promise<EventRow[]>;
  readonly cleanup: () => void;
}

const created: Harness[] = [];

async function harness(spec: HarnessSpec): Promise<Harness> {
  const sqlitePath = path.join(
    os.tmpdir(),
    `test_fx_${spec.label}_${process.pid}_${Date.now()}_${Math.trunc(performance.now() * 1000)}.db`
  );
  const sqliteDb = new DatabaseSync(sqlitePath);
  sqliteDb.exec('PRAGMA foreign_keys = ON;');
  applyMigrations(sqliteDb);

  const asset = sqliteDb.prepare('INSERT INTO assets (id, symbol, is_fiat) VALUES (?, ?, ?)');
  for (const [id, isFiat] of [
    ['B2M', 0],
    ['XRP', 0],
    ['EUR', 1],
    ['USD', 1],
  ] as const) {
    asset.run(id, id, isFiat);
  }
  sqliteDb
    .prepare('INSERT INTO accounts (id, name, type) VALUES (?, ?, ?)')
    .run(ACCOUNT, 'Bit2Me', 'exchange');

  const insert = sqliteDb.prepare(
    `INSERT INTO spot_transactions (
       id, id_hash, account_id, tx_type, asset_in_id, amount_in, asset_out_id, amount_out,
       fee_asset_id, fee_amount, total_fiat, fiat_currency, timestamp, status
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'COMPLETED')`
  );
  for (const t of spec.txs) {
    insert.run(
      t.id,
      `hash-${t.id}`,
      ACCOUNT,
      t.tx_type,
      t.asset_in_id ?? null,
      t.amount_in ?? null,
      t.asset_out_id ?? null,
      t.amount_out ?? null,
      t.fee_asset_id ?? null,
      t.fee_amount ?? null,
      t.total_fiat ?? null,
      t.fiat_currency ?? REPORTING,
      t.timestamp
    );
  }

  const rate = sqliteDb.prepare(
    'INSERT INTO exchange_rates (date, pair, rate, source) VALUES (?, ?, ?, ?)'
  );
  for (const r of spec.rates ?? []) {
    rate.run(r.date, r.pair, r.rate, r.source ?? 'ECB');
  }

  const override = sqliteDb.prepare(
    'INSERT INTO manual_price_overrides (id_hash, price_fiat, fiat_currency) VALUES (?, ?, ?)'
  );
  for (const o of spec.overrides ?? []) {
    override.run(o.idHash, o.priceFiat, o.currency);
  }

  sqliteDb.close();

  process.env.MOCK_MODE = 'false';
  process.env.DUCKDB_PATH = ':memory:';
  const duckDb = new DuckDbAdapter();
  await duckDb.initialize(sqlitePath);

  for (const p of spec.prices ?? []) {
    await duckDb.execute(
      `INSERT INTO _price_seed (symbol, close, date, currency)
       VALUES ('${p.symbol}', ${p.close}, DATE '${p.date}', '${p.currency}')`
    );
  }

  const h: Harness = {
    duckDb,
    lots: () =>
      duckDb.queryMany(
        'SELECT * FROM v_calculated_tax_lots ORDER BY acquisition_timestamp, spot_transaction_id'
      ) as Promise<LotRow[]>,
    events: () =>
      duckDb.queryMany(
        'SELECT * FROM v_calculated_lot_history_events ORDER BY disposal_date, spot_transaction_id'
      ) as Promise<EventRow[]>,
    cleanup: () => {
      if (fs.existsSync(sqlitePath)) fs.unlinkSync(sqlitePath);
    },
  };
  created.push(h);
  return h;
}

/** A single USD-priced staking acquisition — the shape 432 of the real ledger's B2M lots take. */
const STAKING_TX: TxSpec = {
  id: 'tx-staking',
  tx_type: 'STAKING',
  timestamp: '2024-11-05T10:00:00Z',
  asset_in_id: 'B2M',
  amount_in: QTY,
};

const USD_PRICE_ROW: PriceSpec = {
  symbol: 'B2M',
  close: USD_PRICE,
  date: '2024-11-05',
  currency: 'USD',
};

const USD_EUR_ROW: RateSpec = { date: '2024-11-01', pair: 'USD/EUR', rate: USD_EUR_RATE };

afterEach(async () => {
  while (created.length > 0) {
    const h = created.pop()!;
    h.cleanup();
  }
});

describe('converting a historical market price into the reporting currency', () => {
  it('values a USD-priced acquisition in EUR using the dated rate', async () => {
    const h = await harness({
      label: 'convertible',
      txs: [STAKING_TX],
      prices: [USD_PRICE_ROW],
      rates: [USD_EUR_ROW],
    });

    const [lot] = await h.lots();
    expect(lot).toBeDefined();
    expect(lot!.quality_flag).toBeNull();

    const expectedUnit = Number(USD_PRICE) * Number(USD_EUR_RATE);
    expect(Number(lot!.unit_cost_fiat)).toBeCloseTo(expectedUnit, 15);
    expect(Number(lot!.total_cost_fiat)).toBeCloseTo(expectedUnit * Number(QTY), 12);
  });

  it('records the rate it used and its date, and names the provenance', async () => {
    const h = await harness({
      label: 'provenance',
      txs: [STAKING_TX],
      prices: [USD_PRICE_ROW],
      rates: [USD_EUR_ROW],
    });

    const [lot] = await h.lots();
    expect(lot!.value_provenance).toBe('MARKET_CONVERTED');
    expect(Number(lot!.fx_rate)).toBeCloseTo(Number(USD_EUR_RATE), 15);
    expect(lot!.fx_rate_date).toBe('2024-11-01');
  });

  it('reproduces a stored basis from quantity, series price and the recorded rate', async () => {
    // The reproducibility requirement, made executable: a reader holding only the ledger row and the
    // price series must arrive at the same figure years later.
    const h = await harness({
      label: 'reproducible',
      txs: [STAKING_TX],
      prices: [USD_PRICE_ROW],
      rates: [USD_EUR_ROW],
    });

    const [lot] = await h.lots();
    const recomputed = Number(QTY) * Number(USD_PRICE) * Number(lot!.fx_rate);
    expect(Number(lot!.total_cost_fiat)).toBeCloseTo(recomputed, 12);
  });

  it('produces a smaller euro figure than its USD source when the rate is below 1', async () => {
    // The test that fails if the multiplication is inverted. A wrong direction is otherwise invisible:
    // it scales every figure by ~1.09 instead of ~0.92 and still looks like a plausible basis.
    const h = await harness({
      label: 'direction',
      txs: [STAKING_TX],
      prices: [USD_PRICE_ROW],
      rates: [USD_EUR_ROW],
    });

    const [lot] = await h.lots();
    expect(Number(USD_EUR_RATE)).toBeLessThan(1);
    expect(Number(lot!.unit_cost_fiat)).toBeLessThan(Number(USD_PRICE));
    // …and not merely smaller: within a rounding of price × rate, so a random shrink would not pass.
    expect(Number(lot!.unit_cost_fiat)).toBeCloseTo(Number(USD_PRICE) * Number(USD_EUR_RATE), 15);
  });

  it('uses the most recent rate on or before the transaction, never a later one', async () => {
    const h = await harness({
      label: 'asof',
      txs: [STAKING_TX],
      prices: [USD_PRICE_ROW],
      rates: [
        { date: '2024-11-01', pair: 'USD/EUR', rate: '0.900000' },
        { date: '2024-11-04', pair: 'USD/EUR', rate: '0.918695' },
        { date: '2024-11-06', pair: 'USD/EUR', rate: '0.500000' },
      ],
    });

    const [lot] = await h.lots();
    expect(lot!.fx_rate_date).toBe('2024-11-04');
    expect(Number(lot!.unit_cost_fiat)).toBeCloseTo(Number(USD_PRICE) * 0.918695, 15);
  });

  it('resolves with no rate row at all when the series is already in the reporting currency', async () => {
    const h = await harness({
      label: 'same-currency',
      txs: [STAKING_TX],
      prices: [{ ...USD_PRICE_ROW, currency: 'EUR' }],
      rates: [],
    });

    const [lot] = await h.lots();
    expect(lot!.quality_flag).toBeNull();
    expect(Number(lot!.unit_cost_fiat)).toBeCloseTo(Number(USD_PRICE), 15);
    // No conversion took place, so nothing is claimed about a rate.
    expect(lot!.value_provenance).toBe('MARKET');
    expect(lot!.fx_rate).toBeNull();
    expect(lot!.fx_rate_date).toBeNull();
  });
});

describe('the reciprocal pair', () => {
  it('inverts the reciprocal rate when the direct pair is absent', async () => {
    // The ECB publishes EUR-based rates only, so a USD-reporting user has no `EUR/USD` row.
    const h = await harness({
      label: 'reciprocal',
      txs: [{ ...STAKING_TX, fiat_currency: 'USD' }],
      prices: [{ ...USD_PRICE_ROW, currency: 'EUR' }],
      rates: [USD_EUR_ROW],
    });

    const [lot] = await h.lots();
    expect(lot!.quality_flag).toBeNull();
    expect(Number(lot!.fx_rate)).toBeCloseTo(1 / Number(USD_EUR_RATE), 12);
    expect(Number(lot!.unit_cost_fiat)).toBeCloseTo(Number(USD_PRICE) / Number(USD_EUR_RATE), 12);
  });

  it('never inverts a direct rate when one exists for the same pair and date', async () => {
    // Both directions present: the direct row must win, un-inverted. Were the reciprocal preferred
    // here, every figure would be scaled by rate² instead of rate.
    const h = await harness({
      label: 'direct-wins',
      txs: [STAKING_TX],
      prices: [USD_PRICE_ROW],
      rates: [
        { date: '2024-11-01', pair: 'USD/EUR', rate: USD_EUR_RATE },
        { date: '2024-11-01', pair: 'EUR/USD', rate: '2.0' },
      ],
    });

    const [lot] = await h.lots();
    expect(Number(lot!.fx_rate)).toBeCloseTo(Number(USD_EUR_RATE), 15);
    expect(Number(lot!.fx_rate)).not.toBeCloseTo(0.5, 6);
  });
});

describe('the three currency outcomes on one fixture', () => {
  it('flags MISSING_FX_RATE and masks the basis when no rate covers the pair', async () => {
    const h = await harness({
      label: 'no-rate',
      txs: [STAKING_TX],
      prices: [USD_PRICE_ROW],
      rates: [],
    });

    const [lot] = await h.lots();
    expect(lot!.quality_flag).toBe('MISSING_FX_RATE');
    expect(lot!.unit_cost_fiat).toBe('0');
    expect(lot!.total_cost_fiat).toBe('0');
    expect(lot!.fx_rate).toBeNull();
  });

  it('flags MISSING_FX_RATE when the only rate is dated after the transaction', async () => {
    const h = await harness({
      label: 'later-rate',
      txs: [STAKING_TX],
      prices: [USD_PRICE_ROW],
      rates: [{ date: '2024-11-06', pair: 'USD/EUR', rate: USD_EUR_RATE }],
    });

    const [lot] = await h.lots();
    expect(lot!.quality_flag).toBe('MISSING_FX_RATE');
    expect(lot!.unit_cost_fiat).toBe('0');
  });

  it('keeps CURRENCY_MISMATCH for a manual override stated in a foreign currency', async () => {
    // A user-declared price in another currency is a contradiction in the input, not a gap in
    // reference data — converting it would mean guessing which of the two figures was meant.
    const h = await harness({
      label: 'override-foreign',
      txs: [STAKING_TX],
      prices: [USD_PRICE_ROW],
      rates: [USD_EUR_ROW],
      overrides: [{ idHash: 'hash-tx-staking', priceFiat: '0.02', currency: 'USD' }],
    });

    const [lot] = await h.lots();
    expect(lot!.quality_flag).toBe('CURRENCY_MISMATCH');
    expect(lot!.unit_cost_fiat).toBe('0');
  });

  it('accepts a manual override stated in the reporting currency, unconverted', async () => {
    const h = await harness({
      label: 'override-native',
      txs: [STAKING_TX],
      prices: [USD_PRICE_ROW],
      rates: [USD_EUR_ROW],
      overrides: [{ idHash: 'hash-tx-staking', priceFiat: '0.02', currency: 'EUR' }],
    });

    const [lot] = await h.lots();
    expect(lot!.quality_flag).toBeNull();
    expect(Number(lot!.unit_cost_fiat)).toBeCloseTo(0.02, 15);
    expect(lot!.value_provenance).toBe('MANUAL');
    expect(lot!.fx_rate).toBeNull();
  });

  it('still flags MISSING_PRICE when no price series covers the asset', async () => {
    // A missing price and a missing rate are fixed differently, so they must not collapse into one.
    const h = await harness({
      label: 'no-price',
      txs: [STAKING_TX],
      prices: [],
      rates: [USD_EUR_ROW],
    });

    const [lot] = await h.lots();
    expect(lot!.quality_flag).toBe('MISSING_PRICE');
  });
});

describe('a recorded total is never converted', () => {
  it('trusts the source-stated total_fiat even when a rate exists', async () => {
    const h = await harness({
      label: 'recorded-total',
      txs: [{ ...STAKING_TX, total_fiat: '5.00' }],
      prices: [USD_PRICE_ROW],
      rates: [USD_EUR_ROW],
    });

    const [lot] = await h.lots();
    expect(lot!.quality_flag).toBeNull();
    expect(Number(lot!.total_cost_fiat)).toBeCloseTo(5, 12);
    expect(lot!.value_provenance).toBe('MARKET');
    expect(lot!.fx_rate).toBeNull();
  });
});

describe('the disposal side', () => {
  it('states a disposal and its matched lot in the same currency, and the gain as their difference', async () => {
    const h = await harness({
      label: 'disposal',
      txs: [
        STAKING_TX,
        {
          id: 'tx-sell',
          tx_type: 'SELL',
          timestamp: '2024-12-01T10:00:00Z',
          asset_out_id: 'B2M',
          amount_out: QTY,
        },
      ],
      prices: [
        USD_PRICE_ROW,
        { symbol: 'B2M', close: '0.030000000', date: '2024-12-01', currency: 'USD' },
      ],
      rates: [USD_EUR_ROW],
    });

    const [event] = await h.events();
    expect(event).toBeDefined();
    expect(event!.quality_flag).toBeNull();
    expect(event!.is_taxable).toBe(1);

    const costEur = Number(USD_PRICE) * Number(USD_EUR_RATE);
    const saleEur = 0.03 * Number(USD_EUR_RATE);
    expect(Number(event!.sale_price_fiat)).toBeCloseTo(saleEur, 12);
    expect(Number(event!.gain_loss_fiat)).toBeCloseTo((saleEur - costEur) * Number(QTY), 10);
    expect(event!.value_provenance).toBe('MARKET_CONVERTED');
    expect(Number(event!.fx_rate)).toBeCloseTo(Number(USD_EUR_RATE), 15);
  });

  it('values a crypto fee expense and its fee disposal at the same rate', async () => {
    // A fee cannot be worth one figure as an expense against the basis and another as a disposal:
    // the same fee, the same date, one rate.
    const h = await harness({
      label: 'fee',
      txs: [
        {
          id: 'tx-buy-fee',
          tx_type: 'BUY',
          timestamp: '2024-11-05T10:00:00Z',
          asset_in_id: 'XRP',
          amount_in: '10',
          fee_asset_id: 'B2M',
          fee_amount: '5',
        },
        {
          // The fee asset needs a prior lot of its own, or the fee disposal matches nothing.
          ...STAKING_TX,
          id: 'tx-staking-fee-asset',
          timestamp: '2024-11-04T10:00:00Z',
        },
      ],
      prices: [
        { symbol: 'XRP', close: '2.000000000', date: '2024-11-05', currency: 'USD' },
        USD_PRICE_ROW,
        { symbol: 'B2M', close: USD_PRICE, date: '2024-11-04', currency: 'USD' },
      ],
      rates: [USD_EUR_ROW],
    });

    const feeEvents = (await h.events()).filter((e) => e.disposal_type === 'FEE');
    expect(feeEvents).toHaveLength(1);
    const feeEvent = feeEvents[0]!;
    expect(feeEvent.quality_flag).toBeNull();
    expect(Number(feeEvent.sale_price_fiat)).toBeCloseTo(
      Number(USD_PRICE) * Number(USD_EUR_RATE),
      12
    );

    // The same rate the fee's expense component used against the XRP lot's basis.
    const xrpLot = (await h.lots()).find((l) => l.symbol === 'XRP');
    expect(xrpLot).toBeDefined();
    const xrpPriceEur = 2 * Number(USD_EUR_RATE);
    const feeExpenseEur = 5 * Number(USD_PRICE) * Number(USD_EUR_RATE);
    expect(Number(xrpLot!.total_cost_fiat)).toBeCloseTo(10 * xrpPriceEur + feeExpenseEur, 10);
    expect(Number(feeEvent.fx_rate)).toBeCloseTo(Number(xrpLot!.fx_rate), 15);
  });
});

describe('precision through the round trip', () => {
  it('writes a micro-price basis as a plain decimal string, not scientific notation', async () => {
    // A converted unit cost of order 1e-9 must satisfy the column's GLOB constraint, which rejects
    // the `e` in `9.2e-10` as a non-numeric character.
    const h = await harness({
      label: 'micro',
      txs: [STAKING_TX],
      prices: [{ symbol: 'B2M', close: '0.000000001', date: '2024-11-05', currency: 'USD' }],
      rates: [USD_EUR_ROW],
    });

    const [lot] = await h.lots();
    expect(lot!.quality_flag).toBeNull();
    expect(lot!.unit_cost_fiat).toMatch(/^[0-9]+\.?[0-9]*$/);
    expect(Number(lot!.unit_cost_fiat)).toBeGreaterThan(0);
    expect(Number(lot!.unit_cost_fiat)).toBeCloseTo(1e-9 * Number(USD_EUR_RATE), 18);
  });

  it('flags rather than silently zeroing a non-zero figure that rounds away entirely', async () => {
    // An unflagged zero must always mean "genuinely free". A figure too small for 18 decimals is
    // unknown, not free.
    //
    // The vehicle is a tiny quantity, not a tiny price: `historical_prices.close` is itself
    // DECIMAL(38,18), so a price below 1e-18 is already zero before the conversion sees it and would
    // exercise nothing. A wei-scale quantity of a micro-priced asset reaches the same place through
    // arithmetic the engine actually performs.
    const h = await harness({
      label: 'rounds-to-zero',
      txs: [{ ...STAKING_TX, amount_in: '0.000000000000000001' }],
      prices: [{ symbol: 'B2M', close: '0.000000001', date: '2024-11-05', currency: 'USD' }],
      rates: [USD_EUR_ROW],
    });

    const [lot] = await h.lots();
    expect(lot!.quality_flag).not.toBeNull();
    expect(lot!.unit_cost_fiat).toBe('0');
  });
});
