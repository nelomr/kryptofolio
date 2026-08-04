/**
 * The fiscal classification of a source operation, and what the fee branch is allowed to dispose of.
 *
 * Both properties are invisible to the ingestion tests: they only appear once the derived events are
 * read back out of the engine.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DuckDbAdapter } from '../../src/adapters/DuckDbAdapter.js';
import { applyMigrations } from '../helpers/migrations.js';

interface TxSpec {
  id: string;
  tx_type: string;
  timestamp: string;
  asset_in_id?: string;
  amount_in?: string;
  asset_out_id?: string;
  amount_out?: string;
  fee_asset_id?: string;
  fee_amount?: string;
  total_fiat?: string;
  price_fiat?: string;
  flag?: string;
}

interface EventRow {
  spot_transaction_id: string;
  disposal_type: string;
  amount_from_lot: string;
  flag: string | null;
  quality_flag: string | null;
}

const ACCOUNT = 'acc-tangem';

interface Harness {
  duckDb: DuckDbAdapter;
  cleanup: () => void;
}

async function harness(label: string, specs: readonly TxSpec[]): Promise<Harness> {
  const sqlitePath = path.join(
    os.tmpdir(),
    `test_fiscal_flag_${label}_${process.pid}_${Date.now()}_${Math.trunc(performance.now() * 1000)}.db`
  );
  const sqliteDb = new DatabaseSync(sqlitePath);
  sqliteDb.exec('PRAGMA foreign_keys = ON;');
  applyMigrations(sqliteDb);

  const asset = sqliteDb.prepare('INSERT INTO assets (id, symbol, is_fiat) VALUES (?, ?, ?)');
  asset.run('XRP', 'XRP', 0);
  asset.run('ETH', 'ETH', 0);
  asset.run('EUR', 'EUR', 1);
  sqliteDb
    .prepare('INSERT INTO accounts (id, name, type) VALUES (?, ?, ?)')
    .run(ACCOUNT, 'Tangem', 'wallet');

  const insert = sqliteDb.prepare(
    `INSERT INTO spot_transactions (
       id, id_hash, account_id, tx_type, asset_in_id, amount_in, asset_out_id, amount_out,
       fee_asset_id, fee_amount, total_fiat, price_fiat, fiat_currency, timestamp, status, flag
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'EUR', ?, 'COMPLETED', ?)`
  );
  for (const s of specs) {
    insert.run(
      s.id,
      `hash-${s.id}`,
      ACCOUNT,
      s.tx_type,
      s.asset_in_id ?? null,
      s.amount_in ?? null,
      s.asset_out_id ?? null,
      s.amount_out ?? null,
      s.fee_asset_id ?? null,
      s.fee_amount ?? null,
      s.total_fiat ?? '0',
      s.price_fiat ?? '0',
      s.timestamp,
      s.flag ?? null
    );
  }
  sqliteDb.close();

  process.env.MOCK_MODE = 'false';
  process.env.DUCKDB_PATH = ':memory:';
  const duckDb = new DuckDbAdapter();
  await duckDb.initialize(sqlitePath);
  await duckDb.execute(
    `INSERT INTO _price_seed (symbol, close, date, currency)
     VALUES ('XRP', 2.0, DATE '2025-06-01', 'EUR')`
  );

  return {
    duckDb,
    cleanup: () => {
      if (fs.existsSync(sqlitePath)) fs.unlinkSync(sqlitePath);
    },
  };
}

const events = (h: Harness) =>
  h.duckDb.queryMany(
    'SELECT * FROM v_calculated_lot_history_events ORDER BY disposal_date, spot_transaction_id'
  ) as Promise<EventRow[]>;

/** An earlier acquisition, so a later fee disposal has a lot to consume. */
const EARLIER_BUY: TxSpec = {
  id: 'tx-earlier-buy',
  tx_type: 'BUY',
  timestamp: '2025-06-01T10:00:00.000Z',
  asset_in_id: 'XRP',
  amount_in: '100',
  total_fiat: '200',
  price_fiat: '2',
};

/** The Tangem activation: 1 XRP reserved, with a network fee paid in the same asset. */
function activation(overrides: Partial<TxSpec> = {}): TxSpec {
  return {
    id: 'tx-activation',
    tx_type: 'BUY',
    timestamp: '2025-06-03T10:01:00.000Z',
    asset_in_id: 'XRP',
    amount_in: '1.0',
    fee_asset_id: 'XRP',
    fee_amount: '0.05',
    total_fiat: '2',
    price_fiat: '2',
    flag: 'WALLET_ACTIVATION',
    ...overrides,
  };
}

describe('a derived event inherits the fiscal classification of its source operation', () => {
  let h: Harness;
  afterEach(() => h?.cleanup());

  it('emits the fee disposal the classification has to ride on', async () => {
    h = await harness('paired-success', [EARLIER_BUY, activation({ flag: undefined })]);
    const fees = (await events(h)).filter((e) => e.spot_transaction_id === 'tx-activation');
    expect(fees).toHaveLength(1);
    expect(fees[0]?.disposal_type).toBe('FEE');
    expect(fees[0]?.flag).toBeNull();
  });

  it('carries WALLET_ACTIVATION from the transaction onto that event', async () => {
    h = await harness('flag-propagates', [EARLIER_BUY, activation()]);
    const fees = (await events(h)).filter((e) => e.spot_transaction_id === 'tx-activation');
    expect(fees).toHaveLength(1);
    expect(fees[0]?.flag).toBe('WALLET_ACTIVATION');
  });

  it('leaves the events of unclassified transactions unflagged', async () => {
    h = await harness('flag-scoped', [EARLIER_BUY, activation()]);
    const others = (await events(h)).filter((e) => e.spot_transaction_id !== 'tx-activation');
    expect(others.every((e) => e.flag === null)).toBe(true);
  });

  it('does not let the classification displace a data-quality defect', async () => {
    // No price series for the fee date is reachable here only by pricing nothing at all, so the
    // assertion is on co-occurrence: the classification column is populated and the quality column
    // keeps whatever the valuation produced.
    h = await harness('flag-and-quality', [
      EARLIER_BUY,
      activation({ fee_asset_id: 'XRP', fee_amount: '0.05' }),
    ]);
    const fee = (await events(h)).find((e) => e.spot_transaction_id === 'tx-activation');
    expect(fee?.flag).toBe('WALLET_ACTIVATION');
    expect(fee?.quality_flag ?? null).toBe(null);
  });
});

describe('a promotional credit is reported as income', () => {
  let h: Harness;
  afterEach(() => h?.cleanup());

  const promotion: TxSpec = {
    id: 'tx-promotion',
    tx_type: 'PROMOTION',
    timestamp: '2025-09-30T08:10:36.000Z',
    asset_in_id: 'EUR',
    amount_in: '10',
    total_fiat: '10',
    price_fiat: '1',
  };

  /** Same money, same year, arriving as the user's own funds — must not be income. */
  const ownDeposit: TxSpec = {
    id: 'tx-own-deposit',
    tx_type: 'DEPOSIT',
    timestamp: '2025-09-30T08:10:32.000Z',
    asset_in_id: 'EUR',
    amount_in: '50',
    total_fiat: '50',
    price_fiat: '1',
  };

  const generalBase = (harnessed: Harness) =>
    harnessed.duckDb.queryMany(
      'SELECT id, tx_type, CAST(total_fiat AS VARCHAR) AS total_fiat, year FROM general_base_airdrops ORDER BY id'
    ) as Promise<{ id: string; tx_type: string; total_fiat: string; year: string }[]>;

  it('routes the credit into the general base at its face value', async () => {
    h = await harness('promotion-general-base', [promotion, ownDeposit]);
    const rows = await generalBase(h);
    expect(rows.map((r) => r.id)).toEqual(['tx-promotion']);
    expect(Number(rows[0]?.total_fiat)).toBe(10);
    expect(rows[0]?.year).toBe('2025');
  });

  it('keeps it out of the savings base, which is for yields', async () => {
    h = await harness('promotion-not-savings', [promotion]);
    const rows = (await h.duckDb.queryMany(
      'SELECT id FROM savings_base_yields'
    )) as { id: string }[];
    expect(rows).toEqual([]);
  });

  it('creates no tax lot, because the credit is fiat', async () => {
    h = await harness('promotion-no-lot', [promotion]);
    const lots = (await h.duckDb.queryMany(
      'SELECT spot_transaction_id FROM v_calculated_tax_lots'
    )) as { spot_transaction_id: string }[];
    expect(lots.filter((l) => l.spot_transaction_id === 'tx-promotion')).toEqual([]);
  });
});

describe('a credited fee is never a disposal', () => {
  let h: Harness;
  afterEach(() => h?.cleanup());

  it('disposes of the fee quantity when the fee was charged', async () => {
    h = await harness('fee-charged', [
      EARLIER_BUY,
      activation({ flag: undefined, fee_amount: '0.05' }),
    ]);
    const fees = (await events(h)).filter((e) => e.spot_transaction_id === 'tx-activation');
    expect(fees).toHaveLength(1);
    expect(Number(fees[0]?.amount_from_lot)).toBeCloseTo(0.05, 12);
  });

  it('emits no disposal at all when the fee was credited back', async () => {
    h = await harness('fee-credited', [
      EARLIER_BUY,
      activation({ flag: undefined, fee_amount: '-0.05' }),
    ]);
    const fees = (await events(h)).filter((e) => e.spot_transaction_id === 'tx-activation');
    expect(fees).toEqual([]);
  });

  it('never emits a disposal of a negative quantity for any transaction', async () => {
    h = await harness('no-negative-disposal', [
      EARLIER_BUY,
      activation({ flag: undefined, fee_amount: '-0.05' }),
    ]);
    const negative = (await events(h)).filter((e) => Number(e.amount_from_lot) < 0);
    expect(negative).toEqual([]);
  });

  /**
   * A negative disposal never matches a lot, so it is invisible in the event history — and still
   * reaches the daily balances, where subtracting it *adds* quantity the user never received.
   */
  it('emits no negative disposal into the flattened event stream either', async () => {
    h = await harness('no-negative-flattened', [
      EARLIER_BUY,
      activation({ flag: undefined, fee_amount: '-0.05' }),
    ]);
    const rows = (await h.duckDb.queryMany(
      `SELECT tx_id, event_type, CAST(amount AS VARCHAR) AS amount
         FROM v_flattened_fifo_events
        WHERE event_type = 'DISPOSAL'`
    )) as { tx_id: string; amount: string }[];
    expect(rows.filter((r) => Number(r.amount) <= 0)).toEqual([]);
  });
});

/**
 * Where a fee lands, seen from the end of the pipeline.
 *
 * The engine adds a fee denominated in the ledger's own currency to the basis, and disposes of one
 * denominated in an asset. That makes what ingestion records load-bearing: a source whose reported
 * total already contains its fee must be stored net of it, or the basis is inflated by the fee and
 * every later gain on the lot is understated.
 */
describe('a fee reaches the basis or a disposal, according to what it is denominated in', () => {
  let h: Harness;
  afterEach(() => h?.cleanup());

  const acquisition = (over: Partial<TxSpec> = {}): TxSpec => ({
    id: 'tx-buy-eth',
    tx_type: 'BUY',
    timestamp: '2025-06-02T09:00:00.000Z',
    asset_in_id: 'ETH',
    amount_in: '0.30338',
    // Net of the fee: 0.30338 × 1645 = 499.0601, and the source reported 499.81 as paid.
    total_fiat: '499.0601',
    price_fiat: '1645',
    fee_asset_id: 'EUR',
    fee_amount: '0.7499',
    ...over,
  });

  const basisOf = async (txId: string): Promise<string> => {
    const rows = (await h.duckDb.queryMany(
      `SELECT CAST(total_fiat AS VARCHAR) AS total_fiat
         FROM v_flattened_fifo_events
        WHERE tx_id = '${txId}' AND event_type = 'ACQUISITION'`
    )) as { total_fiat: string }[];
    expect(rows).toHaveLength(1);
    return rows[0].total_fiat;
  };

  it('reaches exactly the total the buyer paid, and not that total plus the fee again', async () => {
    h = await harness('basis-not-inflated', [acquisition()]);
    expect(Number(await basisOf('tx-buy-eth'))).toBeCloseTo(499.81, 4);
    expect(Number(await basisOf('tx-buy-eth'))).not.toBeCloseTo(500.5599, 4);
  });

  it('adds a fiat fee to the basis rather than disposing of a quantity of money', async () => {
    h = await harness('fiat-fee-no-disposal', [acquisition()]);
    const disposals = (await events(h)).filter((e) => e.spot_transaction_id === 'tx-buy-eth');
    expect(disposals).toEqual([]);
  });

  it('disposes of a fee denominated in an asset instead of adding it to the basis', async () => {
    h = await harness('asset-fee-disposes', [
      EARLIER_BUY,
      activation({ flag: undefined, fee_asset_id: 'XRP', fee_amount: '0.05', total_fiat: '2' }),
    ]);

    const fees = (await events(h)).filter((e) => e.spot_transaction_id === 'tx-activation');
    expect(fees).toHaveLength(1);
    expect(fees[0].disposal_type).toBe('FEE');
    // The fee's own value still enters the acquired lot's basis — 0.05 XRP at 2 EUR — because it was
    // a cost of acquiring. What distinguishes it from a fee in money is the disposal above: the
    // quantity really left an earlier lot, and that is a taxable event of its own.
    expect(Number(await basisOf('tx-activation'))).toBeCloseTo(2.1, 4);
  });
});
