/**
 * transfer_traceability — integration suite for the FIFO custody-traceability fix.
 *
 * The cases that read `v_custody_entries`, `v_lot_current_location` and `v_fifo_data_quality` still
 * fail: those relations do not exist yet. Everything else is live.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { SPOT_TX_TYPES, fifoEventPolicyRows } from '@kryptofolio/shared-types';
import { DuckDbAdapter } from '../../src/adapters/DuckDbAdapter.js';
import {
  seedTransferTraceabilityFixture,
  ACCOUNTS,
  AMOUNTS,
  TX,
  NON_DISPOSAL_TX_IDS,
  NON_ACQUISITION_TX_IDS,
} from '../fixtures/transfer-traceability.js';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../migrations/sqlite');

/** Applies every migration present, in filename order, so `004` is picked up once it exists. */
function applyMigrations(db: DatabaseSync): void {
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of files) {
    db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8'));
  }
}

interface LotRow {
  id: string;
  spot_transaction_id: string;
  asset_id: string;
  unit_cost_fiat: string;
  original_qty: string;
  remaining_qty: string;
  status: string;
  quality_flag: string | null;
  value_provenance: string;
  exchange_location: string;
}

interface EventRow {
  id: string;
  spot_transaction_id: string;
  disposal_type: string;
  gain_loss_fiat: string | null;
  sale_price_fiat: string | null;
  is_taxable: number;
  quality_flag: string | null;
  value_provenance: string;
  flag: string | null;
}

describe('FIFO custody traceability', () => {
  let sqlitePath: string;
  let sqliteDb: DatabaseSync;
  let duckDb: DuckDbAdapter;

  beforeEach(async () => {
    sqlitePath = path.join(os.tmpdir(), `test_ledger_custody_${process.pid}_${Date.now()}.db`);
    sqliteDb = new DatabaseSync(sqlitePath);
    sqliteDb.exec('PRAGMA foreign_keys = ON;');
    applyMigrations(sqliteDb);
    // `004` made `spot_transactions.total_fiat` non-negative by CHECK, so the raw `-300.00` the
    // buggy ingestion path used to persist is no longer representable in the ledger at all —
    // seeding it aborts the insert. The engine-level guard against a negative basis is therefore
    // exercised separately, on a row planted with `ignore_check_constraints`.
    seedTransferTraceabilityFixture(sqliteDb, { normaliseFiatSign: true });

    process.env.MOCK_MODE = 'false';
    process.env.DUCKDB_PATH = ':memory:';
    duckDb = new DuckDbAdapter();
    await duckDb.initialize(sqlitePath);
  });

  afterEach(() => {
    sqliteDb.close();
    if (fs.existsSync(sqlitePath)) fs.unlinkSync(sqlitePath);
  });

  const lots = () =>
    duckDb.queryMany('SELECT * FROM v_calculated_tax_lots ORDER BY acquisition_timestamp') as Promise<
      LotRow[]
    >;
  const events = () =>
    duckDb.queryMany(
      'SELECT * FROM v_calculated_lot_history_events ORDER BY disposal_date'
    ) as Promise<EventRow[]>;

  // ─── Non-taxable custody movements ────────────────────────────────────────────

  it('emits no principal disposal for any custody movement', async () => {
    const rows = await events();
    const offenders = rows.filter(
      (e) => NON_DISPOSAL_TX_IDS.includes(e.spot_transaction_id) && e.disposal_type !== 'FEE'
    );
    expect(offenders).toEqual([]);
  });

  it('emits exactly one FEE disposal for the withdrawal, for the fee amount only', async () => {
    const rows = await events();
    const forWithdrawal = rows.filter(
      (e) => e.spot_transaction_id === TX.withdrawalUnknownDest
    );
    expect(forWithdrawal).toHaveLength(1);
    expect(forWithdrawal[0]?.disposal_type).toBe('FEE');
  });

  it('creates no lot for a crypto deposit, a fiat deposit, or a transfer-in leg', async () => {
    const rows = await lots();
    const offenders = rows.filter((l) =>
      NON_ACQUISITION_TX_IDS.includes(l.spot_transaction_id)
    );
    expect(offenders).toEqual([]);
  });

  it('excludes fiat assets from lot creation entirely', async () => {
    const rows = await lots();
    expect(rows.filter((l) => l.asset_id === 'EUR')).toEqual([]);
  });

  it('never consumes the withdrawn principal from the lot', async () => {
    const rows = await lots();
    const lot = rows.find((l) => l.spot_transaction_id === TX.buyNegativeFiat);
    expect(lot).toBeDefined();
    expect(lot?.status).not.toBe('CLOSED');
    // This lot is the globally oldest XRP acquisition, so by IRPF global FIFO it is consumed by
    // exactly two things: the 0.20 XRP network fee and the 100 XRP genuine sale. The 179.11 XRP
    // withdrawal principal must contribute nothing.
    const withdrawnPrincipal = Number(AMOUNTS.withdrawalQty);
    const consumedByFeeAndSale = Number(AMOUNTS.withdrawalFeeQty) + Number(AMOUNTS.sellQty);
    expect(Number(lot?.remaining_qty)).toBeCloseTo(
      Number(AMOUNTS.buyNegativeQty) - consumedByFeeAndSale,
      6
    );
    expect(Number(lot?.remaining_qty)).toBeGreaterThan(
      Number(AMOUNTS.buyNegativeQty) - withdrawnPrincipal
    );
  });

  // ─── Sign and basis integrity ─────────────────────────────────────────────────

  it('never derives a negative unit cost basis', async () => {
    const rows = await lots();
    const negative = rows.filter((l) => Number(l.unit_cost_fiat) < 0);
    expect(negative).toEqual([]);
  });

  it('flags a negative-basis lot instead of producing a gain from it', async () => {
    const rows = await lots();
    const lot = rows.find((l) => l.spot_transaction_id === TX.buyNegativeFiat);
    // Ingestion should have normalised the sign; if a negative basis still reaches the engine it
    // must be flagged and suppressed, never amplified into a positive gain.
    if (lot && Number(lot.unit_cost_fiat) < 0) {
      expect(lot.quality_flag).toBe('NEGATIVE_COST_BASIS');
    }
    const evts = await events();
    const positiveGains = evts.filter((e) => Number(e.gain_loss_fiat ?? 0) > 0 && e.is_taxable === 1);
    // The only taxable gain in this fixture comes from the genuine SELL.
    for (const e of positiveGains) {
      expect(e.spot_transaction_id).toBe(TX.genuineSell);
    }
  });

  // ─── No invented prices ───────────────────────────────────────────────────────

  it('flags the unpriced staking acquisition rather than valuing it at zero', async () => {
    const rows = await lots();
    const lot = rows.find((l) => l.spot_transaction_id === TX.stakingUnpriced);
    expect(lot).toBeDefined();
    expect(lot?.quality_flag).toBe('MISSING_PRICE');
  });

  it('never values an unpriceable crypto fee at 1.0 per unit', async () => {
    const rows = await events();
    const feeEvent = rows.find((e) => e.spot_transaction_id === TX.withdrawalUnknownDest);
    expect(feeEvent).toBeDefined();
    expect(feeEvent?.sale_price_fiat).not.toBe('1.0');
    expect(Number(feeEvent?.sale_price_fiat ?? 0)).not.toBe(1);
    expect(feeEvent?.is_taxable).toBe(0);
    expect(feeEvent?.quality_flag).toBe('MISSING_PRICE');
  });

  // ─── The genuine sale ─────────────────────────────────────────────────────────

  it('matches the genuine SELL against the globally oldest lot at its real cost basis', async () => {
    const rows = await events();
    const sellEvents = rows.filter((e) => e.spot_transaction_id === TX.genuineSell);
    expect(sellEvents.length).toBeGreaterThan(0);
    for (const e of sellEvents) {
      expect(e.disposal_type).toBe('SELL');
      expect(e.is_taxable).toBe(1);
    }
    // Sale at 2.00 against a ~1.675 basis is a gain, not the ~+299 the phantom path produced.
    const totalGain = sellEvents.reduce((acc, e) => acc + Number(e.gain_loss_fiat ?? 0), 0);
    expect(totalGain).toBeGreaterThan(0);
    expect(totalGain).toBeLessThan(100);
  });

  it('reports zero taxable gain from non-FEE events other than the genuine sale', async () => {
    const rows = await events();
    const phantom = rows.filter(
      (e) => e.disposal_type !== 'FEE' && e.spot_transaction_id !== TX.genuineSell
    );
    expect(phantom).toEqual([]);
  });

  // ─── Custody ──────────────────────────────────────────────────────────────────

  it('credits an unknown withdrawal destination to the synthetic ownwallet account', async () => {
    const balances = (await duckDb.queryMany(
      `SELECT account_id, asset_id, CAST(SUM(CAST(qty_delta AS DOUBLE)) AS VARCHAR) AS balance
         FROM v_custody_entries GROUP BY 1, 2`
    )) as { account_id: string; asset_id: string; balance: string }[];
    const synthetic = balances.find((b) => b.account_id === 'ownwallet-XRP');
    expect(synthetic).toBeDefined();
  });

  it('keeps every custody movement balanced to zero per asset', async () => {
    const rows = (await duckDb.queryMany(
      `SELECT asset_id, CAST(SUM(CAST(qty_delta AS DOUBLE)) AS VARCHAR) AS net
         FROM v_custody_entries GROUP BY 1`
    )) as { asset_id: string; net: string }[];
    for (const r of rows) {
      expect(Math.abs(Number(r.net))).toBeLessThan(1e-9);
    }
  });

  it('splits custody across two accounts without splitting the lot row', async () => {
    const allLots = await lots();
    const xrpLots = allLots.filter((l) => l.asset_id === 'XRP');
    // Only the three genuine acquisitions produce lots.
    expect(xrpLots).toHaveLength(3);

    const locations = (await duckDb.queryMany(
      `SELECT account_id, CAST(SUM(CAST(qty AS DOUBLE)) AS VARCHAR) AS qty
         FROM v_lot_current_location WHERE asset_id = 'XRP' GROUP BY 1`
    )) as { account_id: string; qty: string }[];
    const accountsHolding = locations.filter((l) => Number(l.qty) > 0).map((l) => l.account_id);
    expect(accountsHolding).toContain(ACCOUNTS.binance);
  });

  it('attributes the sub-wallet move to the child account, netting zero at the venue', async () => {
    const rows = (await duckDb.queryMany(
      `SELECT account_id, CAST(SUM(CAST(qty_delta AS DOUBLE)) AS VARCHAR) AS balance
         FROM v_custody_entries WHERE asset_id = 'XRP' GROUP BY 1`
    )) as { account_id: string; balance: string }[];
    const earn = rows.find((r) => r.account_id === ACCOUNTS.krakenEarn);
    expect(earn).toBeDefined();
    expect(Number(earn?.balance)).toBeCloseTo(Number(AMOUNTS.subWalletQty), 6);
  });

  it('preserves the acquiring venue on a relocated lot', async () => {
    const rows = await lots();
    const lot = rows.find((l) => l.spot_transaction_id === TX.buyNegativeFiat);
    expect(lot?.exchange_location).toBe('Kraken:spot');
  });

  // ─── Data quality surface ─────────────────────────────────────────────────────

  it('reports an untracked inflow for crypto arriving from an unrecorded source', async () => {
    const rows = (await duckDb.queryMany(
      `SELECT quality_flag, asset_id FROM v_fifo_data_quality`
    )) as { quality_flag: string; asset_id: string }[];
    expect(rows.map((r) => r.quality_flag)).toContain('UNTRACKED_INFLOW');
  });

  it('reports missing prices without blocking', async () => {
    const rows = (await duckDb.queryMany(
      `SELECT quality_flag FROM v_fifo_data_quality WHERE quality_flag = 'MISSING_PRICE'`
    )) as { quality_flag: string }[];
    expect(rows.length).toBeGreaterThan(0);
  });

  // ─── Persistence contract ─────────────────────────────────────────────────────

  it('emits figures SQLite accepts, including the flagged and unpriced rows', async () => {
    // DuckDB computes in DECIMAL and SQLite stores TEXT behind GLOB CHECKs that admit only digits
    // and a dot — no exponent, no leading minus on a magnitude. An engine that computes correctly
    // but emits '1e-7' or '-0.5' is still unmaterialisable, and the rows most at risk are exactly
    // the ones this group added: a NULL price, a suppressed gain, a defective basis.
    const derivedLots = await lots();
    const derivedEvents = await events();
    expect(derivedLots.length).toBeGreaterThan(0);
    expect(derivedEvents.length).toBeGreaterThan(0);

    const insertLot = sqliteDb.prepare(
      `INSERT INTO tax_lots (
         id, spot_transaction_id, asset_id, account_id, original_qty, remaining_qty,
         unit_cost_fiat, total_cost_fiat, fiat_currency, acquisition_timestamp, exchange_location,
         status, quality_flag, value_provenance
       ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?`
    );
    for (const lot of derivedLots) {
      const row = lot as unknown as Record<string, string | null>;
      insertLot.run(
        row.id,
        row.spot_transaction_id,
        row.asset_id,
        row.account_id,
        row.original_qty,
        row.remaining_qty,
        row.unit_cost_fiat,
        row.total_cost_fiat,
        row.fiat_currency,
        row.acquisition_timestamp,
        row.exchange_location,
        row.status,
        row.quality_flag,
        row.value_provenance
      );
    }

    const insertEvent = sqliteDb.prepare(
      `INSERT INTO lot_history_events (
         id, tax_lot_id, spot_transaction_id, account_id, amount_from_lot, sale_price_fiat,
         gain_loss_fiat, fiat_currency, is_taxable, disposal_type, quality_flag, value_provenance,
         disposal_date
       ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?`
    );
    for (const event of derivedEvents) {
      const row = event as unknown as Record<string, string | number | null>;
      insertEvent.run(
        row.id,
        row.tax_lot_id,
        row.spot_transaction_id,
        row.account_id,
        row.amount_from_lot,
        row.sale_price_fiat,
        row.gain_loss_fiat,
        row.fiat_currency,
        row.is_taxable,
        row.disposal_type,
        row.quality_flag,
        row.value_provenance,
        row.disposal_date
      );
    }

    const lotCount = sqliteDb.prepare('SELECT COUNT(*) AS n FROM tax_lots').get() as { n: number };
    const eventCount = sqliteDb.prepare('SELECT COUNT(*) AS n FROM lot_history_events').get() as {
      n: number;
    };
    expect(lotCount.n).toBe(derivedLots.length);
    expect(eventCount.n).toBe(derivedEvents.length);

    // The unpriced fee disposal must have survived as an absent value, not as a fabricated one.
    const stored = sqliteDb
      .prepare('SELECT sale_price_fiat, is_taxable FROM lot_history_events WHERE disposal_type = ?')
      .all('FEE') as { sale_price_fiat: string | null; is_taxable: number }[];
    expect(stored).toHaveLength(1);
    expect(stored[0]?.sale_price_fiat).toBeNull();
    expect(stored[0]?.is_taxable).toBe(0);
  });
});

describe('FIFO view hygiene', () => {
  let sqlitePath: string;
  let sqliteDb: DatabaseSync;
  let duckDb: DuckDbAdapter;

  beforeEach(async () => {
    sqlitePath = path.join(os.tmpdir(), `test_ledger_hygiene_${process.pid}_${Date.now()}.db`);
    sqliteDb = new DatabaseSync(sqlitePath);
    sqliteDb.exec('PRAGMA foreign_keys = ON;');
    applyMigrations(sqliteDb);
    process.env.MOCK_MODE = 'false';
    process.env.DUCKDB_PATH = ':memory:';
    duckDb = new DuckDbAdapter();
    await duckDb.initialize(sqlitePath);
  });

  afterEach(() => {
    sqliteDb.close();
    if (fs.existsSync(sqlitePath)) fs.unlinkSync(sqlitePath);
  });

  const FIFO_VIEWS = [
    'v_flattened_fifo_events',
    'v_acquisitions',
    'v_disposals',
    'v_fifo_matches',
    'v_calculated_tax_lots',
    'v_calculated_lot_history_events',
  ];

  it('contains no hardcoded transaction-type literals in any FIFO view', async () => {
    const rows = (await duckDb.queryMany(
      `SELECT view_name, sql FROM duckdb_views() WHERE view_name IN (${FIFO_VIEWS.map(
        (v) => `'${v}'`
      ).join(', ')})`
    )) as { view_name: string; sql: string }[];
    expect(rows.length).toBe(FIFO_VIEWS.length);

    const forbidden = ['TRANSFER_IN', 'TRANSFER_OUT', 'MIGRATION_SWAP', 'DEPOSIT', 'WITHDRAWAL'];
    for (const row of rows) {
      for (const literal of forbidden) {
        expect(row.sql, `${row.view_name} must not hardcode '${literal}'`).not.toContain(
          `'${literal}'`
        );
      }
    }
  });

  it('never substitutes a fabricated price for missing market data', async () => {
    const rows = (await duckDb.queryMany(
      `SELECT view_name, sql FROM duckdb_views() WHERE view_name IN (${FIFO_VIEWS.map(
        (v) => `'${v}'`
      ).join(', ')})`
    )) as { view_name: string; sql: string }[];
    for (const row of rows) {
      // The two fallbacks that turned absent data into plausible numbers.
      // DuckDB re-emits the column as a quoted identifier (`hp_fee_dis."close"`), so the
      // optional quotes must be part of the pattern — without them this assertion passes
      // vacuously against the very SQL it is meant to reject.
      expect(row.sql, `${row.view_name} must not invent a 1.0 price`).not.toMatch(
        /COALESCE\([^)]*\."?close"?,\s*1(\.0+)?\s*\)/i
      );
      expect(row.sql, `${row.view_name} must not invent a 0.0 price`).not.toMatch(
        /COALESCE\([^)]*\."?close"?,\s*0(\.0+)?\s*\)/i
      );
    }
  });

  it('seeds the FIFO event policy relation from the canonical map', async () => {
    const rows = (await duckDb.queryMany(
      `SELECT tx_type, generates_acquisition, generates_disposal, generates_fee_disposal,
              taxable_disposal
         FROM fifo_event_policy`
    )) as PolicyRow[];

    expect(rows).toHaveLength(SPOT_TX_TYPES.length);

    // Round-tripped against the canonical map rather than restated, so the seed cannot drift from
    // the constant it is derived from.
    const seeded = new Map(rows.map((r) => [r.tx_type, r]));
    for (const expected of fifoEventPolicyRows()) {
      const actual = seeded.get(expected.txType);
      expect(actual, `no policy row seeded for '${expected.txType}'`).toBeDefined();
      expect(actual?.generates_acquisition).toBe(expected.generatesAcquisition);
      expect(actual?.generates_disposal).toBe(expected.generatesDisposal);
      expect(actual?.generates_fee_disposal).toBe(expected.generatesFeeDisposal);
      expect(actual?.taxable_disposal).toBe(expected.taxableDisposal);
    }
  });
});

interface PolicyRow {
  tx_type: string;
  generates_acquisition: boolean;
  generates_disposal: boolean;
  generates_fee_disposal: boolean;
  taxable_disposal: boolean;
}

/**
 * Price resolution: market data, manual overrides, currency agreement.
 *
 * The fixture deliberately ships without any `historical_prices` row, so these cases inject prices
 * into the adapter's `_price_seed` relation — the same seam the pre-existing FIFO integration suites
 * use — and rows into `manual_price_overrides`, to prove the resolution order actually fires rather
 * than merely producing NULL for everything.
 */
describe('FIFO price resolution and provenance', () => {
  let sqlitePath: string;
  let sqliteDb: DatabaseSync;
  let duckDb: DuckDbAdapter;

  beforeEach(async () => {
    sqlitePath = path.join(os.tmpdir(), `test_ledger_pricing_${process.pid}_${Date.now()}.db`);
    sqliteDb = new DatabaseSync(sqlitePath);
    sqliteDb.exec('PRAGMA foreign_keys = ON;');
    applyMigrations(sqliteDb);
    seedTransferTraceabilityFixture(sqliteDb, { normaliseFiatSign: true });

    process.env.MOCK_MODE = 'false';
    process.env.DUCKDB_PATH = ':memory:';
    duckDb = new DuckDbAdapter();
    await duckDb.initialize(sqlitePath);
  });

  afterEach(() => {
    sqliteDb.close();
    if (fs.existsSync(sqlitePath)) fs.unlinkSync(sqlitePath);
  });

  /** Dated the day before the STAKING receipt so the ASOF join resolves it, and only it. */
  const seedPrice = (close: string, currency: string) =>
    duckDb.execute(
      `INSERT INTO _price_seed (symbol, close, date, currency)
       VALUES ('XRP', ${close}, DATE '2026-01-31', '${currency}')`
    );

  const stakingLot = async () => {
    const rows = (await duckDb.queryMany(
      `SELECT * FROM v_calculated_tax_lots WHERE spot_transaction_id = '${TX.stakingUnpriced}'`
    )) as LotRow[];
    return rows[0];
  };

  it('values a priced income acquisition at market and leaves it unflagged', async () => {
    await seedPrice('0.40', 'EUR');
    const lot = await stakingLot();
    expect(lot).toBeDefined();
    expect(lot?.quality_flag).toBeNull();
    expect(Number(lot?.unit_cost_fiat)).toBeCloseTo(0.4, 9);
    expect(lot?.value_provenance).toBe('MARKET');
  });

  it('prefers a manual override over the resolved market price and marks it MANUAL', async () => {
    await seedPrice('0.40', 'EUR');
    sqliteDb
      .prepare(
        `INSERT INTO manual_price_overrides (id_hash, price_fiat, fiat_currency)
         VALUES (?, ?, ?)`
      )
      .run(`hash-${TX.stakingUnpriced}`, '0.42', 'EUR');

    const lot = await stakingLot();
    expect(lot?.quality_flag).toBeNull();
    expect(Number(lot?.unit_cost_fiat)).toBeCloseTo(0.42, 9);
    expect(lot?.value_provenance).toBe('MANUAL');
  });

  it('ignores a soft-deleted override and falls back to market', async () => {
    await seedPrice('0.40', 'EUR');
    sqliteDb
      .prepare(
        `INSERT INTO manual_price_overrides (id_hash, price_fiat, fiat_currency, deleted_at)
         VALUES (?, ?, ?, datetime('now', 'utc'))`
      )
      .run(`hash-${TX.stakingUnpriced}`, '0.42', 'EUR');

    const lot = await stakingLot();
    expect(Number(lot?.unit_cost_fiat)).toBeCloseTo(0.4, 9);
    expect(lot?.value_provenance).toBe('MARKET');
  });

  it('flags a price series denominated in another currency instead of mixing the arithmetic', async () => {
    await seedPrice('0.45', 'USD');
    const lot = await stakingLot();
    expect(lot?.quality_flag).toBe('CURRENCY_MISMATCH');
  });
});

/**
 * Negative cost basis — defence in depth.
 *
 * `004` makes a negative `total_fiat` unrepresentable by CHECK, so the row is planted with
 * `ignore_check_constraints` to reproduce the case the design calls out: a negative basis that
 * reaches the matcher despite the constraint must be flagged and suppressed, never amplified into a
 * gain.
 */
describe('FIFO negative cost basis guard', () => {
  let sqlitePath: string;
  let sqliteDb: DatabaseSync;
  let duckDb: DuckDbAdapter;

  beforeEach(async () => {
    sqlitePath = path.join(os.tmpdir(), `test_ledger_negbasis_${process.pid}_${Date.now()}.db`);
    sqliteDb = new DatabaseSync(sqlitePath);
    sqliteDb.exec('PRAGMA foreign_keys = ON;');
    applyMigrations(sqliteDb);
    sqliteDb.exec('PRAGMA ignore_check_constraints = ON;');
    seedTransferTraceabilityFixture(sqliteDb, { normaliseFiatSign: false });
    sqliteDb.exec('PRAGMA ignore_check_constraints = OFF;');

    process.env.MOCK_MODE = 'false';
    process.env.DUCKDB_PATH = ':memory:';
    duckDb = new DuckDbAdapter();
    await duckDb.initialize(sqlitePath);
  });

  afterEach(() => {
    sqliteDb.close();
    if (fs.existsSync(sqlitePath)) fs.unlinkSync(sqlitePath);
  });

  it('planted the negative magnitude the CHECK would otherwise reject', () => {
    const row = sqliteDb
      .prepare('SELECT total_fiat FROM spot_transactions WHERE id = ?')
      .get(TX.buyNegativeFiat) as { total_fiat: string };
    expect(row.total_fiat).toBe(AMOUNTS.buyNegativeTotalFiat);
  });

  it('flags the lot NEGATIVE_COST_BASIS and emits no negative basis of its own', async () => {
    const rows = (await duckDb.queryMany(
      `SELECT * FROM v_calculated_tax_lots WHERE spot_transaction_id = '${TX.buyNegativeFiat}'`
    )) as LotRow[];
    expect(rows).toHaveLength(1);
    expect(rows[0]?.quality_flag).toBe('NEGATIVE_COST_BASIS');
    // `tax_lots.unit_cost_fiat` is NOT NULL with a non-negative GLOB CHECK, so the view cannot
    // emit the raw figure. The flag, not the number, carries the defect.
    expect(Number(rows[0]?.unit_cost_fiat)).toBeGreaterThanOrEqual(0);
  });

  it('suppresses every disposal matched against a negative-basis lot', async () => {
    const rows = (await duckDb.queryMany(
      `SELECT * FROM v_calculated_lot_history_events WHERE spot_transaction_id = '${TX.genuineSell}'`
    )) as EventRow[];
    expect(rows.length).toBeGreaterThan(0);
    for (const event of rows) {
      expect(event.quality_flag).toBe('NEGATIVE_COST_BASIS');
      expect(event.is_taxable).toBe(0);
      expect(event.gain_loss_fiat).toBeNull();
    }
  });
});
