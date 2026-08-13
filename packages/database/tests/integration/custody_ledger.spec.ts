/**
 * custody_ledger — the double-entry custody projection, on purpose-built micro-ledgers.
 *
 * `transfer_traceability.spec.ts` exercises custody against the nine-scenario regression fixture,
 * which is deliberately messy. These cases isolate one property each, so a failure names the
 * property rather than the fixture.
 */

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { deriveSyntheticAccountName, isSyntheticAccountName } from '@kryptofolio/shared-types';
import { DuckDbAdapter } from '../../src/adapters/DuckDbAdapter.js';
import { applyMigrations } from '../helpers/migrations.js';

interface TxSpec {
  id: string;
  tx_type: string;
  account_id: string;
  timestamp: string;
  asset_in_id?: string;
  amount_in?: string;
  asset_out_id?: string;
  amount_out?: string;
  fee_asset_id?: string;
  fee_amount?: string;
  total_fiat?: string | null;
  price_fiat?: string | null;
  transfer_group_id?: string;
}

const ACC_A = 'acc-a';
const ACC_B = 'acc-b';

function seedBase(db: DatabaseSync): void {
  const asset = db.prepare('INSERT INTO assets (id, symbol, is_fiat) VALUES (?, ?, ?)');
  asset.run('BTC', 'BTC', 0);
  asset.run('ETH', 'ETH', 0);
  asset.run('EUR', 'EUR', 1);
  const account = db.prepare('INSERT INTO accounts (id, name, type) VALUES (?, ?, ?)');
  account.run(ACC_A, 'Exchange A', 'exchange');
  account.run(ACC_B, 'Wallet B', 'wallet');
}

function seedTransactions(db: DatabaseSync, specs: readonly TxSpec[]): void {
  const insert = db.prepare(
    `INSERT INTO spot_transactions (
       id, id_hash, account_id, tx_type, asset_in_id, amount_in, asset_out_id, amount_out,
       fee_asset_id, fee_amount, total_fiat, price_fiat, fiat_currency, timestamp, status,
       transfer_group_id
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'EUR', ?, 'COMPLETED', ?)`
  );
  for (const s of specs) {
    insert.run(
      s.id,
      `hash-${s.id}`,
      s.account_id,
      s.tx_type,
      s.asset_in_id ?? null,
      s.amount_in ?? null,
      s.asset_out_id ?? null,
      s.amount_out ?? null,
      s.fee_asset_id ?? null,
      s.fee_amount ?? null,
      // Unspecified means the fixture never stated a fiat value at all -- NULL, not '0'. A
      // stated 0 is now a genuinely free acquisition and would be trusted outright.
      s.total_fiat ?? null,
      s.price_fiat ?? null,
      s.timestamp,
      s.transfer_group_id ?? null
    );
  }
}

interface Harness {
  sqliteDb: DatabaseSync;
  duckDb: DuckDbAdapter;
  cleanup: () => void;
}

async function harness(label: string, specs: readonly TxSpec[]): Promise<Harness> {
  const sqlitePath = path.join(
    os.tmpdir(),
    `test_custody_${label}_${process.pid}_${Date.now()}_${Math.trunc(performance.now() * 1000)}.db`
  );
  const sqliteDb = new DatabaseSync(sqlitePath);
  sqliteDb.exec('PRAGMA foreign_keys = ON;');
  applyMigrations(sqliteDb);
  seedBase(sqliteDb);
  seedTransactions(sqliteDb, specs);

  process.env.MOCK_MODE = 'false';
  process.env.DUCKDB_PATH = ':memory:';
  const duckDb = new DuckDbAdapter();
  await duckDb.initialize(sqlitePath);

  return {
    sqliteDb,
    duckDb,
    cleanup: () => {
      sqliteDb.close();
      if (fs.existsSync(sqlitePath)) fs.unlinkSync(sqlitePath);
    },
  };
}

interface EntryRow {
  id: string;
  tax_lot_id: string;
  asset_id: string;
  account_id: string;
  qty_delta: string;
  occurred_at: string;
  spot_transaction_id: string;
}

interface QualityRow {
  quality_flag: string;
  severity: string;
  asset_id: string | null;
  account_id: string | null;
  tx_id: string | null;
  occurred_at: string | null;
  detail_key: string;
  pending_review: boolean;
}

const entries = (h: Harness) =>
  h.duckDb.queryMany(
    'SELECT * FROM v_custody_entries ORDER BY occurred_at, spot_transaction_id, account_id, tax_lot_id'
  ) as Promise<EntryRow[]>;

const quality = (h: Harness) =>
  h.duckDb.queryMany(
    'SELECT * FROM v_fifo_data_quality ORDER BY quality_flag, account_id, tx_id'
  ) as Promise<QualityRow[]>;

/** A BUY that establishes a lot, then a full or partial move out of the acquiring account. */
const BUY_10_BTC: TxSpec = {
  id: 'tx-buy',
  tx_type: 'BUY',
  account_id: ACC_A,
  timestamp: '2024-01-01T10:00:00.000Z',
  asset_in_id: 'BTC',
  amount_in: '10',
  total_fiat: '10000',
  price_fiat: '1000',
};

const transferOut = (over: Partial<TxSpec> = {}): TxSpec => ({
  id: 'tx-out',
  tx_type: 'TRANSFER_OUT',
  account_id: ACC_A,
  timestamp: '2024-02-01T10:00:00.000Z',
  asset_out_id: 'BTC',
  amount_out: '4',
  ...over,
});

const transferIn = (over: Partial<TxSpec> = {}): TxSpec => ({
  id: 'tx-in',
  tx_type: 'TRANSFER_IN',
  account_id: ACC_B,
  timestamp: '2024-02-01T10:00:00.000Z',
  asset_in_id: 'BTC',
  amount_in: '4',
  ...over,
});

// ─── double-entry custody ───────────────────────────────────────────────────────

describe('custody double entry', () => {
  let h: Harness;
  afterEach(() => {
    h?.cleanup();
    h = undefined as unknown as Harness;
  });

  it('emits one debit and one credit per movement, balanced to zero', async () => {
    h = await harness('balanced', [BUY_10_BTC, transferOut(), transferIn()]);
    const rows = await entries(h);

    const perMovement = new Map<string, number>();
    for (const row of rows) {
      const key = `${row.spot_transaction_id}|${row.asset_id}`;
      perMovement.set(key, (perMovement.get(key) ?? 0) + Number(row.qty_delta));
    }
    expect(perMovement.size).toBe(2);
    for (const [key, net] of perMovement) {
      expect(Math.abs(net), `${key} is unbalanced`).toBeLessThan(1e-9);
    }

    const outLegs = rows.filter((r) => r.spot_transaction_id === 'tx-out');
    expect(outLegs.map((r) => r.account_id).sort()).toEqual(
      [ACC_A, deriveSyntheticAccountName('BTC')].sort()
    );
    const debit = outLegs.find((r) => r.account_id === ACC_A);
    const credit = outLegs.find((r) => r.account_id === deriveSyntheticAccountName('BTC'));
    expect(Number(debit?.qty_delta)).toBeCloseTo(-4, 9);
    expect(Number(credit?.qty_delta)).toBeCloseTo(4, 9);
  });

  it('resolves an unknown counterparty through the shared synthetic naming contract', async () => {
    h = await harness('synthetic-name', [BUY_10_BTC, transferOut()]);
    const rows = await entries(h);
    const synthetic = rows.filter((r) => isSyntheticAccountName(r.account_id));
    expect(synthetic.length).toBeGreaterThan(0);
    for (const row of synthetic) {
      expect(row.account_id).toBe(deriveSyntheticAccountName(row.asset_id));
    }
    // The engine must not depend on the account pre-existing: nothing seeded it.
    const seeded = h.sqliteDb
      .prepare('SELECT COUNT(*) AS n FROM accounts WHERE is_synthetic = 1')
      .get() as { n: number };
    expect(seeded.n).toBe(0);
  });

  /**
   * The tier `transfer_group_id` exists for. Before ingestion populated it, `v_custody_movements`
   * could only resolve a counterparty through a user-declared override or fall through to the
   * synthetic `ownwallet-<ASSET>` — the ledger's own reference, carried on both legs, was dead
   * weight. No override is set here, so this can only pass through `recorded_counterparty`.
   */
  it('attributes a transfer to the real destination through a shared transfer_group_id, no override needed', async () => {
    h = await harness('recorded-counterparty', [
      BUY_10_BTC,
      transferOut({ transfer_group_id: 'REF-1' }),
      transferIn({ transfer_group_id: 'REF-1' }),
    ]);
    const rows = await entries(h);

    const outLegs = rows.filter((r) => r.spot_transaction_id === 'tx-out');
    const inLegs = rows.filter((r) => r.spot_transaction_id === 'tx-in');
    expect(outLegs.map((r) => r.account_id).sort()).toEqual([ACC_A, ACC_B].sort());
    expect(inLegs.map((r) => r.account_id).sort()).toEqual([ACC_A, ACC_B].sort());
    expect(outLegs.some((r) => isSyntheticAccountName(r.account_id))).toBe(false);
    expect(inLegs.some((r) => isSyntheticAccountName(r.account_id))).toBe(false);
  });

  it('redirects the credit when a destination override names a real account', async () => {
    h = await harness('override', [BUY_10_BTC, transferOut()]);
    h.sqliteDb
      .prepare(
        'INSERT INTO transfer_destination_overrides (id_hash, counterparty_account_id) VALUES (?, ?)'
      )
      .run('hash-tx-out', ACC_B);

    const rows = await entries(h);
    const outLegs = rows.filter((r) => r.spot_transaction_id === 'tx-out');
    expect(outLegs.map((r) => r.account_id).sort()).toEqual([ACC_A, ACC_B].sort());
    expect(outLegs.some((r) => isSyntheticAccountName(r.account_id))).toBe(false);
  });

  it('ignores a soft-deleted destination override', async () => {
    h = await harness('override-deleted', [BUY_10_BTC, transferOut()]);
    h.sqliteDb
      .prepare(
        `INSERT INTO transfer_destination_overrides (id_hash, counterparty_account_id, deleted_at)
         VALUES (?, ?, datetime('now', 'utc'))`
      )
      .run('hash-tx-out', ACC_B);

    const rows = await entries(h);
    const outLegs = rows.filter((r) => r.spot_transaction_id === 'tx-out');
    expect(outLegs.some((r) => r.account_id === deriveSyntheticAccountName('BTC'))).toBe(true);
  });

  // Order independence needs two engines over the same transactions written in opposite orders, so
  // it costs two bootstraps and two binds of the custody chain. Built in a hook rather than in the
  // test body, because setup is setup and the assertion is one comparison.
  describe('order independence', () => {
    let forwardEntries: EntryRow[];
    let reversedEntries: EntryRow[];

    // Two full harness() bootstraps back to back — roughly double the cost the package's 15s
    // hookTimeout was tuned for a single one — so this hook alone gets double the budget rather
    // than raising the ceiling for every test in the package.
    beforeAll(async () => {
      const specs = [BUY_10_BTC, transferOut(), transferIn()];
      const forward = await harness('order-fwd', specs);
      const reversed = await harness('order-rev', [...specs].reverse());
      try {
        forwardEntries = await entries(forward);
        reversedEntries = await entries(reversed);
      } finally {
        forward.cleanup();
        reversed.cleanup();
      }
    }, 30_000);

    it('derives identical entries regardless of the order the ledger was written in', () => {
      expect(forwardEntries.length).toBeGreaterThan(0);
      expect(reversedEntries).toEqual(forwardEntries);
    });
  });

  it('derives byte-identical entries on a repeated read of an unchanged ledger', async () => {
    h = await harness('rerun', [BUY_10_BTC, transferOut(), transferIn()]);
    const first = await entries(h);
    const second = await entries(h);
    expect(first.length).toBeGreaterThan(0);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it('carries no time-window, amount-tolerance or nearest-in-time predicate', async () => {
    h = await harness('hygiene', [BUY_10_BTC, transferOut(), transferIn()]);
    const views = [
      'v_custody_movements',
      'v_lot_custody_timeline',
      'v_lot_custody_allocation',
      'v_custody_entries',
      'v_lot_current_location',
      'v_custody_balances',
    ];
    const rows = (await h.duckDb.queryMany(
      `SELECT view_name, sql FROM duckdb_views()
        WHERE view_name IN (${views.map((v) => `'${v}'`).join(', ')})`
    )) as { view_name: string; sql: string }[];
    expect(rows.length).toBe(views.length);

    for (const row of rows) {
      // Documenting a decision must not fail the test that enforces it.
      const code = row.sql
        .split('\n')
        .filter((line) => !line.trim().startsWith('--'))
        .join('\n');
      for (const pattern of [/INTERVAL/i, /DATE_?DIFF/i, /DATE_?SUB/i, /\bAGE\s*\(/i, /\bABS\s*\(/i]) {
        expect(code, `${row.view_name} must not pair legs by proximity`).not.toMatch(pattern);
      }
    }
  });
});

// ─── custody allocation FIFO ────────────────────────────────────────────────────

describe('custody allocation FIFO', () => {
  let h: Harness;
  afterEach(() => h?.cleanup());

  const TWO_LOTS: readonly TxSpec[] = [
    {
      id: 'tx-buy-old',
      tx_type: 'BUY',
      account_id: ACC_A,
      timestamp: '2024-01-01T10:00:00.000Z',
      asset_in_id: 'BTC',
      amount_in: '100',
      total_fiat: '100000',
      price_fiat: '1000',
    },
    {
      id: 'tx-buy-new',
      tx_type: 'BUY',
      account_id: ACC_A,
      timestamp: '2024-02-01T10:00:00.000Z',
      asset_in_id: 'BTC',
      amount_in: '100',
      total_fiat: '200000',
      price_fiat: '2000',
    },
    transferOut({ amount_out: '50', timestamp: '2024-03-01T10:00:00.000Z' }),
    transferIn({ amount_in: '50', timestamp: '2024-03-01T10:00:00.000Z' }),
  ];

  it('draws the moved quantity from the oldest lot held in that account', async () => {
    h = await harness('alloc-fifo', TWO_LOTS);
    const allocations = (await h.duckDb.queryMany(
      `SELECT tax_lot_id, CAST(qty AS VARCHAR) AS qty, from_account_id, to_account_id
         FROM v_lot_custody_allocation
        WHERE spot_transaction_id = 'tx-out'`
    )) as { tax_lot_id: string; qty: string; from_account_id: string; to_account_id: string }[];

    const lots = (await h.duckDb.queryMany(
      `SELECT id, spot_transaction_id FROM v_calculated_tax_lots`
    )) as { id: string; spot_transaction_id: string }[];
    const oldest = lots.find((l) => l.spot_transaction_id === 'tx-buy-old');
    expect(oldest).toBeDefined();

    expect(allocations).toHaveLength(1);
    expect(allocations[0]?.tax_lot_id).toBe(oldest?.id);
    expect(Number(allocations[0]?.qty)).toBeCloseTo(50, 9);
  });

  it('leaves both lots unsplit, OPEN and at their full remaining quantity', async () => {
    h = await harness('alloc-nosplit', TWO_LOTS);
    const lots = (await h.duckDb.queryMany(
      `SELECT spot_transaction_id, original_qty, remaining_qty, status, exchange_location
         FROM v_calculated_tax_lots ORDER BY acquisition_timestamp`
    )) as {
      spot_transaction_id: string;
      original_qty: string;
      remaining_qty: string;
      status: string;
      exchange_location: string;
    }[];

    expect(lots).toHaveLength(2);
    for (const lot of lots) {
      expect(lot.status).toBe('OPEN');
      expect(Number(lot.remaining_qty)).toBeCloseTo(Number(lot.original_qty), 9);
      expect(lot.exchange_location).toBe('Exchange A');
    }
  });

  it('emits no lot history event for a movement that pays no crypto fee', async () => {
    h = await harness('alloc-noevent', TWO_LOTS);
    const events = await h.duckDb.queryMany('SELECT * FROM v_calculated_lot_history_events');
    expect(events).toEqual([]);
  });

  it('splits custody across two accounts while the lot stays one row', async () => {
    h = await harness('alloc-split', TWO_LOTS);
    const locations = (await h.duckDb.queryMany(
      `SELECT account_id, CAST(SUM(qty) AS VARCHAR) AS qty
         FROM v_lot_current_location WHERE asset_id = 'BTC' GROUP BY 1 ORDER BY 1`
    )) as { account_id: string; qty: string }[];

    const byAccount = new Map(locations.map((l) => [l.account_id, Number(l.qty)]));
    expect(byAccount.get(ACC_A)).toBeCloseTo(150, 9);
    expect(byAccount.get(ACC_B)).toBeCloseTo(50, 9);
    expect(byAccount.get(deriveSyntheticAccountName('BTC')) ?? 0).toBeCloseTo(0, 9);
  });

  it('relocates an entire lot without consuming it', async () => {
    h = await harness('alloc-whole', [
      BUY_10_BTC,
      transferOut({ amount_out: '10' }),
      transferIn({ amount_in: '10' }),
    ]);
    const lots = (await h.duckDb.queryMany(
      `SELECT remaining_qty, status FROM v_calculated_tax_lots`
    )) as { remaining_qty: string; status: string }[];
    expect(lots).toHaveLength(1);
    expect(lots[0]?.status).toBe('OPEN');
    expect(Number(lots[0]?.remaining_qty)).toBeCloseTo(10, 9);

    const locations = (await h.duckDb.queryMany(
      `SELECT account_id, CAST(SUM(qty) AS VARCHAR) AS qty
         FROM v_lot_current_location GROUP BY 1`
    )) as { account_id: string; qty: string }[];
    const byAccount = new Map(locations.map((l) => [l.account_id, Number(l.qty)]));
    expect(byAccount.get(ACC_B)).toBeCloseTo(10, 9);
    expect(byAccount.get(ACC_A)).toBeCloseTo(0, 9);
  });
});

// ─── residual semantics ─────────────────────────────────────────────────────────

describe('custody residual semantics', () => {
  let h: Harness;
  afterEach(() => h?.cleanup());

  /** Prices the crypto fee so the residual assertions are not confounded by MISSING_PRICE. */
  const priceFees = async (harnessed: Harness, symbol: string) =>
    harnessed.duckDb.execute(
      `INSERT INTO _price_seed (symbol, close, date, currency)
       VALUES ('${symbol}', 1000.0, DATE '2023-12-01', 'EUR')`
    );

  it('raises no flag when the residual stays within the asset fee scale', async () => {
    h = await harness('res-within', [
      BUY_10_BTC,
      transferOut({ fee_asset_id: 'BTC', fee_amount: '0.001' }),
      transferIn({ amount_in: '3.999' }),
    ]);
    await priceFees(h, 'BTC');
    const rows = await quality(h);
    expect(rows.filter((r) => r.quality_flag === 'CUSTODY_RESIDUAL')).toEqual([]);
  });

  it('reports CUSTODY_RESIDUAL at low severity beyond the fee scale', async () => {
    h = await harness('res-beyond', [
      BUY_10_BTC,
      transferOut({ fee_asset_id: 'BTC', fee_amount: '0.001' }),
      transferIn({ amount_in: '3' }),
    ]);
    await priceFees(h, 'BTC');
    const rows = await quality(h);
    const residual = rows.filter((r) => r.quality_flag === 'CUSTODY_RESIDUAL');
    expect(residual).toHaveLength(1);
    expect(residual[0]?.severity).toBe('low');
    expect(residual[0]?.account_id).toBe(deriveSyntheticAccountName('BTC'));
    expect(residual[0]?.asset_id).toBe('BTC');
    expect(residual[0]?.detail_key).toBe('fifo_quality.custody_residual');
  });

  it('reports UNTRACKED_INFLOW at high severity when the synthetic balance is negative', async () => {
    h = await harness('res-negative', [
      BUY_10_BTC,
      transferIn({ id: 'tx-in-untracked', amount_in: '5', timestamp: '2024-02-01T10:00:00.000Z' }),
    ]);
    const rows = await quality(h);
    const untracked = rows.filter((r) => r.quality_flag === 'UNTRACKED_INFLOW');
    expect(untracked.length).toBeGreaterThan(0);
    expect(untracked.some((r) => r.account_id === deriveSyntheticAccountName('BTC'))).toBe(true);
    for (const row of untracked) {
      expect(row.severity).toBe('high');
      expect(row.detail_key).toBe('fifo_quality.untracked_inflow');
    }
  });

  it('scales the tolerance per asset rather than by a shared constant', async () => {
    // Identical 0.4 residual on both assets; only the fee scale differs.
    h = await harness('res-scale', [
      BUY_10_BTC,
      transferOut({ fee_asset_id: 'BTC', fee_amount: '0.5' }),
      transferIn({ amount_in: '3.6' }),
      {
        id: 'tx-buy-eth',
        tx_type: 'BUY',
        account_id: ACC_A,
        timestamp: '2024-01-01T11:00:00.000Z',
        asset_in_id: 'ETH',
        amount_in: '10',
        total_fiat: '10000',
        price_fiat: '1000',
      },
      {
        id: 'tx-out-eth',
        tx_type: 'TRANSFER_OUT',
        account_id: ACC_A,
        timestamp: '2024-02-01T11:00:00.000Z',
        asset_out_id: 'ETH',
        amount_out: '4',
        fee_asset_id: 'ETH',
        fee_amount: '0.001',
      },
      {
        id: 'tx-in-eth',
        tx_type: 'TRANSFER_IN',
        account_id: ACC_B,
        timestamp: '2024-02-01T11:00:00.000Z',
        asset_in_id: 'ETH',
        amount_in: '3.6',
      },
    ]);
    await priceFees(h, 'BTC');
    await priceFees(h, 'ETH');

    const rows = await quality(h);
    const residual = rows.filter((r) => r.quality_flag === 'CUSTODY_RESIDUAL');
    expect(residual.map((r) => r.asset_id)).toEqual(['ETH']);
  });
});

// ─── the data-quality surface ───────────────────────────────────────────────────

describe('data quality surface', () => {
  let h: Harness;
  afterEach(() => h?.cleanup());

  it('returns zero rows for a ledger with resolvable values and balanced custody', async () => {
    h = await harness('clean', [
      BUY_10_BTC,
      transferOut(),
      transferIn(),
      {
        id: 'tx-sell',
        tx_type: 'SELL',
        account_id: ACC_A,
        timestamp: '2024-03-01T10:00:00.000Z',
        asset_out_id: 'BTC',
        amount_out: '2',
        total_fiat: '3000',
        price_fiat: '1500',
      },
    ]);
    const rows = await quality(h);
    expect(rows).toEqual([]);
  });

  it('reports each defect with a severity from the canonical map and an i18n detail key', async () => {
    h = await harness('quality-shape', [
      {
        id: 'tx-staking',
        tx_type: 'STAKING',
        account_id: ACC_A,
        timestamp: '2024-01-01T10:00:00.000Z',
        asset_in_id: 'BTC',
        amount_in: '1',
      },
    ]);
    const rows = await quality(h);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(['low', 'medium', 'high']).toContain(row.severity);
      expect(row.detail_key).toBe(`fifo_quality.${row.quality_flag.toLowerCase()}`);
      expect(typeof row.pending_review).toBe('boolean');
    }
    const missing = rows.filter((r) => r.quality_flag === 'MISSING_PRICE');
    expect(missing.length).toBeGreaterThan(0);
    expect(missing[0]?.severity).toBe('medium');
    expect(missing[0]?.pending_review).toBe(true);
    expect(missing[0]?.tx_id).toBe('tx-staking');
  });

  it('reports CUSTODY_IMBALANCE where custody cannot account for the ledger balance', async () => {
    // 5 BTC arrive at an account that holds no lot, so nothing can be attributed to them.
    h = await harness('imbalance', [
      BUY_10_BTC,
      transferIn({ id: 'tx-in-untracked', amount_in: '5' }),
    ]);

    const balances = (await h.duckDb.queryMany(
      `SELECT account_id, CAST(custody_gap AS VARCHAR) AS gap
         FROM v_custody_balances WHERE asset_id = 'BTC' ORDER BY account_id`
    )) as { account_id: string; gap: string }[];
    const gapByAccount = new Map(balances.map((b) => [b.account_id, Number(b.gap)]));
    expect(gapByAccount.get(ACC_A)).toBeCloseTo(0, 9);
    expect(gapByAccount.get(ACC_B)).toBeCloseTo(5, 9);

    const rows = await quality(h);
    const imbalance = rows.filter((r) => r.quality_flag === 'CUSTODY_IMBALANCE');
    expect(imbalance.map((r) => r.account_id)).toEqual([
      ACC_B,
      deriveSyntheticAccountName('BTC'),
    ]);
    for (const row of imbalance) {
      expect(row.severity).toBe('medium');
      expect(row.detail_key).toBe('fifo_quality.custody_imbalance');
      expect(row.pending_review).toBe(false);
    }
    // The account whose custody does reconcile must not be reported.
    expect(imbalance.some((r) => r.account_id === ACC_A)).toBe(false);
  });
});
