/**
 * Set reconciliation of the three derived tables.
 *
 * Exercised against the real DuckDB engine rather than a stub because the properties under test are
 * about identity and absence: a recomputed ID set that a mock produces by hand cannot demonstrate
 * that the engine's IDs are stable, nor that a row disappears when its source does.
 */
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DuckDbAdapter } from '@kryptofolio/database';
import { deriveSyntheticAccountName } from '@kryptofolio/shared-types';
import { SQLiteLedgerAdapter } from '../../../infrastructure/adapters/SQLiteLedgerAdapter.js';
import { DuckDbTaxCalculatorAdapter } from '../../../infrastructure/adapters/DuckDbTaxCalculatorAdapter.js';
import { FifoMaterializerService } from '../FifoMaterializerService.js';
import type { IUserSettingsPort } from '../../../domain/ports/IUserSettingsPort.js';

const ACCOUNTS = {
  kraken: 'acc-kraken',
  ledger: 'acc-ledger',
} as const;

const TX = {
  buy: 'tx-buy',
  withdrawalUnknownDest: 'tx-withdrawal-unknown',
  buyLater: 'tx-buy-later',
  sell: 'tx-sell',
  cryptoDeposit: 'tx-crypto-deposit',
} as const;

const DERIVED_TABLES = ['tax_lots', 'lot_history_events', 'lot_custody_entries'] as const;

interface SpotRow {
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
  total_fiat: string;
  price_fiat: string;
}

function insertSpot(db: DatabaseSync, row: SpotRow): void {
  db.prepare(
    `INSERT INTO spot_transactions (
       id, id_hash, account_id, tx_type,
       asset_in_id, amount_in, asset_out_id, amount_out,
       fee_asset_id, fee_amount,
       total_fiat, price_fiat, fiat_currency,
       timestamp, status
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'EUR', ?, 'COMPLETED')`,
  ).run(
    row.id,
    `hash-${row.id}`,
    row.account_id,
    row.tx_type,
    row.asset_in_id ?? null,
    row.amount_in ?? null,
    row.asset_out_id ?? null,
    row.amount_out ?? null,
    row.fee_asset_id ?? null,
    row.fee_amount ?? null,
    row.total_fiat,
    row.price_fiat,
    row.timestamp,
  );
}

/**
 * A deliberately small ledger: one lot that a later disposal consumes, one transfer to an unknown
 * destination so the synthetic counterparty is exercised, and one crypto deposit that the corrected
 * policy must NOT turn into a lot — which is what makes a planted phantom row provably absent from
 * the recomputed set.
 */
function seedLedger(db: DatabaseSync): void {
  const asset = db.prepare('INSERT INTO assets (id, symbol, is_fiat) VALUES (?, ?, ?)');
  asset.run('XRP', 'XRP', 0);
  asset.run('EUR', 'EUR', 1);

  const account = db.prepare('INSERT INTO accounts (id, name, type) VALUES (?, ?, ?)');
  account.run(ACCOUNTS.kraken, 'Kraken', 'exchange');
  account.run(ACCOUNTS.ledger, 'Ledger', 'wallet');

  insertSpot(db, {
    id: TX.buy,
    tx_type: 'BUY',
    account_id: ACCOUNTS.kraken,
    timestamp: '2025-12-15T10:00:00.000Z',
    asset_in_id: 'XRP',
    amount_in: '179.11',
    total_fiat: '300.00',
    price_fiat: '1.6724',
  });

  insertSpot(db, {
    id: TX.withdrawalUnknownDest,
    tx_type: 'WITHDRAWAL',
    account_id: ACCOUNTS.kraken,
    timestamp: '2026-01-04T10:00:00.000Z',
    asset_out_id: 'XRP',
    amount_out: '179.11',
    fee_asset_id: 'XRP',
    fee_amount: '0.20',
    total_fiat: '0',
    price_fiat: '0',
  });

  insertSpot(db, {
    id: TX.cryptoDeposit,
    tx_type: 'DEPOSIT',
    account_id: ACCOUNTS.ledger,
    timestamp: '2026-01-05T10:00:00.000Z',
    asset_in_id: 'XRP',
    amount_in: '100.00',
    total_fiat: '0',
    price_fiat: '0',
  });

  insertSpot(db, {
    id: TX.buyLater,
    tx_type: 'BUY',
    account_id: ACCOUNTS.kraken,
    timestamp: '2026-01-25T10:00:00.000Z',
    asset_in_id: 'XRP',
    amount_in: '192.44',
    total_fiat: '299.89',
    price_fiat: '1.5583',
  });

  insertSpot(db, {
    id: TX.sell,
    tx_type: 'SELL',
    account_id: ACCOUNTS.kraken,
    timestamp: '2026-03-01T10:00:00.000Z',
    asset_out_id: 'XRP',
    amount_out: '100.00',
    total_fiat: '200.00',
    price_fiat: '2.00',
  });
}

describe('FifoMaterializerService — set reconciliation of the derived tables', () => {
  let sqliteDb: DatabaseSync;
  let sqliteDbPath: string;
  let ledgerAdapter: SQLiteLedgerAdapter;
  let duckDbAdapter: DuckDbAdapter;
  let taxCalculator: DuckDbTaxCalculatorAdapter;
  let userSettings: IUserSettingsPort;
  let service: FifoMaterializerService;

  /** Every column of a table, soft-deleted rows included, ordered so two runs are comparable. */
  function snapshot(table: string, key = 'id'): Record<string, unknown>[] {
    return sqliteDb
      .prepare(`SELECT * FROM ${table} ORDER BY ${key}`)
      .all() as Record<string, unknown>[];
  }

  /** Column set excluding the timestamps a rebuild is allowed to touch. */
  function stableSnapshot(table: string, key = 'id'): Record<string, unknown>[] {
    return snapshot(table, key).map((row) => {
      const { created_at: _created, updated_at: _updated, ...rest } = row;
      return rest;
    });
  }

  function auditCount(table: string): number {
    const row = sqliteDb
      .prepare('SELECT COUNT(*) AS count FROM audit_log WHERE table_name = ?')
      .get(table) as { count: number };
    return row.count;
  }

  beforeEach(async () => {
    sqliteDbPath = path.join(
      os.tmpdir(),
      `reconcile_${Date.now()}_${Math.random().toString(36).slice(2)}.db`,
    );
    sqliteDb = new DatabaseSync(sqliteDbPath);
    sqliteDb.exec('PRAGMA foreign_keys = ON;');

    ledgerAdapter = new SQLiteLedgerAdapter(sqliteDb);
    await ledgerAdapter.initialize();

    seedLedger(sqliteDb);

    process.env.MOCK_MODE = 'false';
    process.env.DUCKDB_PATH = ':memory:';
    duckDbAdapter = new DuckDbAdapter();
    await duckDbAdapter.initialize(sqliteDbPath);
    taxCalculator = new DuckDbTaxCalculatorAdapter(duckDbAdapter);

    let needsRecalculation = 'true';
    userSettings = {
      getSetting: async (key: string) =>
        key === 'needs_recalculation' ? needsRecalculation : null,
      setSetting: async (key: string, value: string) => {
        if (key === 'needs_recalculation') needsRecalculation = value;
      },
    };

    service = new FifoMaterializerService(ledgerAdapter, taxCalculator, userSettings);
  });

  afterEach(() => {
    sqliteDb.close();
    if (fs.existsSync(sqliteDbPath)) {
      fs.unlinkSync(sqliteDbPath);
    }
  });

  it('creates the synthetic ownwallet counterparty on demand with is_synthetic = 1', async () => {
    await service.recalculate(true);

    const syntheticId = deriveSyntheticAccountName('XRP');
    const account = sqliteDb
      .prepare('SELECT id, is_synthetic, parent_account_id FROM accounts WHERE id = ?')
      .get(syntheticId) as
      | { id: string; is_synthetic: number; parent_account_id: string | null }
      | undefined;

    expect(account).toBeDefined();
    expect(account?.is_synthetic).toBe(1);
    expect(account?.parent_account_id).toBeNull();

    const custodied = sqliteDb
      .prepare('SELECT COUNT(*) AS count FROM lot_custody_entries WHERE account_id = ?')
      .get(syntheticId) as { count: number };
    expect(custodied.count).toBeGreaterThan(0);
  });

  it('persists disposal_type, provenance and quality flags for every derived row', async () => {
    await service.recalculate(true);

    const events = sqliteDb
      .prepare(
        `SELECT disposal_type, value_provenance, quality_flag, is_taxable
           FROM lot_history_events WHERE deleted_at IS NULL`,
      )
      .all() as {
      disposal_type: string;
      value_provenance: string;
      quality_flag: string | null;
      is_taxable: number;
    }[];

    expect(events.length).toBeGreaterThan(0);
    expect(events.every((e) => e.disposal_type !== null)).toBe(true);
    expect(events.some((e) => e.disposal_type === 'SELL')).toBe(true);
    expect(events.some((e) => e.disposal_type === 'FEE')).toBe(true);
    expect(events.every((e) => e.value_provenance === 'MARKET' || e.value_provenance === 'MANUAL'))
      .toBe(true);

    const lots = sqliteDb
      .prepare('SELECT value_provenance FROM tax_lots WHERE deleted_at IS NULL')
      .all() as { value_provenance: string }[];
    expect(lots.length).toBeGreaterThan(0);
    expect(lots.every((l) => l.value_provenance === 'MARKET' || l.value_provenance === 'MANUAL'))
      .toBe(true);
  });

  it('returns per-table counts plus the flagged and pending-review totals', async () => {
    const summary = await service.recalculate(true);

    for (const table of ['taxLots', 'lotHistoryEvents', 'custodyEntries'] as const) {
      expect(summary[table].inserted).toBeGreaterThan(0);
      expect(summary[table].updated).toBe(0);
      expect(summary[table].retired).toBe(0);
      expect(summary[table].reactivated).toBe(0);
    }

    expect(typeof summary.flagged).toBe('number');
    expect(typeof summary.pendingReview).toBe('number');
    expect(summary.pendingReview).toBeLessThanOrEqual(summary.flagged);
  });

  it('produces zero writes and no audit rows on an unchanged second run', async () => {
    await service.recalculate(true);

    const before = {
      tax_lots: stableSnapshot('tax_lots'),
      lot_history_events: stableSnapshot('lot_history_events'),
      lot_custody_entries: stableSnapshot('lot_custody_entries'),
    };
    const auditBefore = DERIVED_TABLES.map(auditCount);

    const summary = await service.recalculate(true);

    for (const table of ['taxLots', 'lotHistoryEvents', 'custodyEntries'] as const) {
      expect(summary[table]).toEqual({
        inserted: 0,
        updated: 0,
        retired: 0,
        reactivated: 0,
      });
    }

    expect(stableSnapshot('tax_lots')).toEqual(before.tax_lots);
    expect(stableSnapshot('lot_history_events')).toEqual(before.lot_history_events);
    expect(stableSnapshot('lot_custody_entries')).toEqual(before.lot_custody_entries);
    expect(DERIVED_TABLES.map(auditCount)).toEqual(auditBefore);
  });

  it('records a changed quantity as one in-place update, not a delete and an insert', async () => {
    await service.recalculate(true);

    const lotId = (
      sqliteDb
        .prepare('SELECT id FROM tax_lots WHERE spot_transaction_id = ?')
        .get(TX.buy) as { id: string }
    ).id;
    const before = sqliteDb
      .prepare('SELECT remaining_qty, status FROM tax_lots WHERE id = ?')
      .get(lotId) as { remaining_qty: string; status: string };

    // A larger sale consumes more of the same lot while leaving it PARTIAL, so `remaining_qty` is
    // the only column that moves.
    sqliteDb
      .prepare("UPDATE spot_transactions SET amount_out = '120.00', total_fiat = '240.00' WHERE id = ?")
      .run(TX.sell);

    const summary = await service.recalculate(true);
    expect(summary.taxLots.updated).toBe(1);
    expect(summary.taxLots.retired).toBe(0);
    expect(summary.taxLots.inserted).toBe(0);

    const after = sqliteDb
      .prepare('SELECT remaining_qty, status FROM tax_lots WHERE id = ?')
      .get(lotId) as { remaining_qty: string; status: string };
    expect(after.status).toBe(before.status);
    expect(after.remaining_qty).not.toBe(before.remaining_qty);

    const trail = sqliteDb
      .prepare(
        `SELECT action, old_values, new_values FROM audit_log
          WHERE table_name = 'tax_lots' AND record_id = ?`,
      )
      .all(lotId) as { action: string; old_values: string; new_values: string }[];

    expect(trail).toHaveLength(1);
    expect(trail[0].action).toBe('UPDATE');

    const old = JSON.parse(trail[0].old_values) as Record<string, unknown>;
    const now = JSON.parse(trail[0].new_values) as Record<string, unknown>;
    const differing = Object.keys(now).filter((key) => now[key] !== old[key]);
    expect(differing).toEqual(['remaining_qty']);
  });

  it('retires the lot of a soft-deleted transaction without removing the row', async () => {
    await service.recalculate(true);

    const lotId = (
      sqliteDb
        .prepare('SELECT id FROM tax_lots WHERE spot_transaction_id = ?')
        .get(TX.buy) as { id: string }
    ).id;

    sqliteDb
      .prepare("UPDATE spot_transactions SET deleted_at = datetime('now','utc') WHERE id = ?")
      .run(TX.buy);

    const summary = await service.recalculate(true);

    expect(summary.taxLots.retired).toBeGreaterThan(0);

    const row = sqliteDb
      .prepare('SELECT deleted_at FROM tax_lots WHERE id = ?')
      .get(lotId) as { deleted_at: string | null };
    expect(row.deleted_at).not.toBeNull();

    const active = sqliteDb
      .prepare('SELECT COUNT(*) AS count FROM v_active_tax_lots WHERE id = ?')
      .get(lotId) as { count: number };
    expect(active.count).toBe(0);
  });

  it('retires a phantom lot together with the events and custody entries referencing it', async () => {
    await service.recalculate(true);

    // A zero-cost lot derived from a crypto DEPOSIT: what the pre-policy engine materialised and
    // what the recomputed set no longer contains.
    sqliteDb
      .prepare(
        `INSERT INTO tax_lots (
           id, spot_transaction_id, asset_id, account_id,
           original_qty, remaining_qty, unit_cost_fiat, total_cost_fiat,
           fiat_currency, acquisition_timestamp, exchange_location, status
         ) VALUES (
           'phantom-lot', ?, 'XRP', ?,
           '100.00', '100.00', '0', '0',
           'EUR', '2026-01-05T10:00:00.000Z', 'Ledger', 'OPEN'
         )`,
      )
      .run(TX.cryptoDeposit, ACCOUNTS.ledger);

    sqliteDb
      .prepare(
        `INSERT INTO lot_history_events (
           id, tax_lot_id, spot_transaction_id, account_id,
           amount_from_lot, sale_price_fiat, gain_loss_fiat, fiat_currency,
           is_taxable, disposal_type, disposal_date
         ) VALUES (
           'phantom-event', 'phantom-lot', ?, ?,
           '100.00', '1.0', '100.00', 'EUR',
           1, 'SELL', '2026-01-05T10:00:00.000Z'
         )`,
      )
      .run(TX.cryptoDeposit, ACCOUNTS.ledger);

    sqliteDb
      .prepare(
        `INSERT INTO lot_custody_entries (
           id, tax_lot_id, asset_id, account_id, qty_delta, occurred_at, spot_transaction_id
         ) VALUES (
           'phantom-custody', 'phantom-lot', 'XRP', ?, '-100.00', '2026-01-05T10:00:00.000Z', ?
         )`,
      )
      .run(ACCOUNTS.ledger, TX.cryptoDeposit);

    const summary = await service.recalculate(true);

    expect(summary.taxLots.retired).toBe(1);
    expect(summary.lotHistoryEvents.retired).toBe(1);
    expect(summary.custodyEntries.retired).toBe(1);

    for (const [table, id] of [
      ['tax_lots', 'phantom-lot'],
      ['lot_history_events', 'phantom-event'],
      ['lot_custody_entries', 'phantom-custody'],
    ] as const) {
      const row = sqliteDb
        .prepare(`SELECT deleted_at FROM ${table} WHERE id = ?`)
        .get(id) as { deleted_at: string | null } | undefined;
      expect(row, `${table}/${id} must still exist physically`).toBeDefined();
      expect(row?.deleted_at, `${table}/${id} must be soft-deleted`).not.toBeNull();
    }
  });

  // Reaching a retired row takes two materialisations before the one under test. Setup belongs in
  // setup: a hook has its own budget, whereas three full rebuilds in one body sit close enough to
  // the per-test ceiling to fail on machine load rather than on behaviour.
  describe('with an already-retired lot', () => {
    let retiredLotId: string;

    beforeEach(async () => {
      await service.recalculate(true);
      retiredLotId = (
        sqliteDb
          .prepare('SELECT id FROM tax_lots WHERE spot_transaction_id = ?')
          .get(TX.buy) as { id: string }
      ).id;

      sqliteDb
        .prepare("UPDATE spot_transactions SET deleted_at = datetime('now','utc') WHERE id = ?")
        .run(TX.buy);
      await service.recalculate(true);
    });

    it('reactivates the existing row when a retired transaction is restored', async () => {
      sqliteDb.prepare('UPDATE spot_transactions SET deleted_at = NULL WHERE id = ?').run(TX.buy);
      const summary = await service.recalculate(true);

      expect(summary.taxLots.reactivated).toBeGreaterThan(0);
      expect(summary.taxLots.inserted).toBe(0);

      const rows = sqliteDb
        .prepare('SELECT id, deleted_at FROM tax_lots WHERE spot_transaction_id = ?')
        .all(TX.buy) as { id: string; deleted_at: string | null }[];
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe(retiredLotId);
      expect(rows[0].deleted_at).toBeNull();
    });
  });

  it('rolls back and leaves needs_recalculation true when a derived write fails', async () => {
    await service.recalculate(true);
    const before = stableSnapshot('tax_lots');

    const honest = taxCalculator.calculateLotsAndEvents.bind(taxCalculator);
    taxCalculator.calculateLotsAndEvents = async (accountId?: string) => {
      const { lots, events } = await honest(accountId);
      return {
        lots: lots.map((lot) => ({ ...lot, remaining_qty: '0.5' })),
        // A dangling tax_lot_id: the FK rejects it, so lot_history_events fails after tax_lots
        // has already been written inside the transaction.
        events: [...events, { ...events[0], id: 'orphan-event', tax_lot_id: 'no-such-lot' }],
      };
    };

    await userSettings.setSetting('needs_recalculation', 'true');
    await expect(service.recalculate(true)).rejects.toThrow();

    expect(stableSnapshot('tax_lots')).toEqual(before);
    expect(await userSettings.getSetting('needs_recalculation')).toBe('true');
    const orphan = sqliteDb
      .prepare("SELECT COUNT(*) AS count FROM lot_history_events WHERE id = 'orphan-event'")
      .get() as { count: number };
    expect(orphan.count).toBe(0);
  });

  it('clears needs_recalculation only after a successful run', async () => {
    await userSettings.setSetting('needs_recalculation', 'true');
    await service.recalculate();
    expect(await userSettings.getSetting('needs_recalculation')).toBe('false');
  });

  it('leaves the user-authored override tables byte-identical across a rebuild', async () => {
    sqliteDb
      .prepare(
        `INSERT INTO manual_price_overrides (id_hash, price_fiat, fiat_currency, note)
         VALUES (?, '0.42', 'EUR', 'declared by hand')`,
      )
      .run(`hash-${TX.withdrawalUnknownDest}`);
    sqliteDb
      .prepare(
        `INSERT INTO transfer_destination_overrides (id_hash, counterparty_account_id, note)
         VALUES (?, ?, 'went to my Ledger')`,
      )
      .run(`hash-${TX.withdrawalUnknownDest}`, ACCOUNTS.ledger);

    const before = {
      prices: snapshot('manual_price_overrides', 'id_hash'),
      destinations: snapshot('transfer_destination_overrides', 'id_hash'),
    };
    const auditBefore = [
      auditCount('manual_price_overrides'),
      auditCount('transfer_destination_overrides'),
    ];

    await service.recalculate(true);

    expect(snapshot('manual_price_overrides', 'id_hash')).toEqual(before.prices);
    expect(snapshot('transfer_destination_overrides', 'id_hash')).toEqual(before.destinations);
    expect([
      auditCount('manual_price_overrides'),
      auditCount('transfer_destination_overrides'),
    ]).toEqual(auditBefore);
  });

  describe('with derived tables reached incrementally', () => {
    let incremental: Record<string, Record<string, unknown>[]>;
    let amendedTheEarlierRun: boolean;
    let differedFromPartial: boolean;

    // The incremental path has to reach its result by amending rows it wrote earlier, otherwise
    // "incremental" and "from scratch" are the same run and the comparison proves nothing.
    beforeEach(async () => {
      sqliteDb
        .prepare(
          "UPDATE spot_transactions SET deleted_at = datetime('now','utc') WHERE id IN (?, ?)",
        )
        .run(TX.sell, TX.buyLater);
      await service.recalculate(true);
      const partial = stableSnapshot('tax_lots');

      sqliteDb
        .prepare('UPDATE spot_transactions SET deleted_at = NULL WHERE id IN (?, ?)')
        .run(TX.sell, TX.buyLater);
      const amended = await service.recalculate(true);

      amendedTheEarlierRun = amended.taxLots.inserted + amended.taxLots.updated > 0;
      differedFromPartial =
        JSON.stringify(stableSnapshot('tax_lots')) !== JSON.stringify(partial);

      incremental = {
        tax_lots: stableSnapshot('tax_lots'),
        lot_history_events: stableSnapshot('lot_history_events'),
        lot_custody_entries: stableSnapshot('lot_custody_entries'),
      };
    });

    it('rebuilds from empty derived tables to the same state as an incremental run', async () => {
      expect(amendedTheEarlierRun).toBe(true);
      expect(differedFromPartial).toBe(true);

      sqliteDb.exec('DELETE FROM lot_custody_entries');
      sqliteDb.exec('DELETE FROM lot_history_events');
      sqliteDb.exec('DELETE FROM tax_lots');

      await service.recalculate(true);

      expect(stableSnapshot('tax_lots')).toEqual(incremental.tax_lots);
      expect(stableSnapshot('lot_history_events')).toEqual(incremental.lot_history_events);
      expect(stableSnapshot('lot_custody_entries')).toEqual(incremental.lot_custody_entries);
    });
  });
});
