import type { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { toPreciseAmount } from '../../domain/value-objects/PreciseAmount.js';
import type {
  ILedgerPort,
  LedgerInitializationSummary,
  LedgerSpotTransaction,
  LedgerFuturesTransaction,
  LedgerTaxLot,
  LedgerTaxLotEvent,
  LedgerCustodyEntry,
  LedgerManualPriceOverride,
  LedgerTransferDestinationOverride,
  ReconciliationSummary,
  EnsureAccountInput,
  EnsureAssetInput,
} from '../../domain/ports/ILedgerPort';
import { deriveSubAccountId } from '@kryptofolio/shared-types';

/** A value as SQLite accepts it. `null` is a first-class value here, not a missing one. */
type SqlValue = string | number | null;

/**
 * How one derived table is projected onto its columns.
 *
 * The three derived tables differ only in their column list and their projection, so the
 * insert/update/retire/reactivate logic exists once. A per-table copy is how the fee-disposal
 * predicate drifted away from the principal one in the first place.
 */
interface DerivedTableSpec<T> {
  table: string;
  /** Value columns, `id` excluded: it is the reconciliation key, never an updatable value. */
  columns: readonly string[];
  identify: (row: T) => string;
  project: (row: T) => readonly SqlValue[];
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * SQLiteLedgerAdapter — Anti-Corruption Layer between SQLite TEXT storage and Domain entities.
 *
 * Responsibility: convert TEXT ↔ Decimal.js at the DB boundary.
 * All monetary columns stored as TEXT in SQLite; returned as Decimal to the domain.
 */
export class SQLiteLedgerAdapter implements ILedgerPort {
  private db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  async initialize(): Promise<LedgerInitializationSummary> {
    const appliedMigrations = this.applyMigrations();

    // Seed default accounts
    const insertAccount = this.db.prepare(`
      INSERT INTO accounts (id, name, type, created_at, updated_at)
      VALUES (?, ?, ?, datetime('now', 'utc'), datetime('now', 'utc'))
      ON CONFLICT(id) DO NOTHING
    `);

    const defaultAccounts = [
      { id: "10000000-0000-0000-0000-000000000001", name: "Binance", type: "exchange" },
      { id: "10000000-0000-0000-0000-000000000002", name: "Kraken", type: "exchange" },
      { id: "10000000-0000-0000-0000-000000000003", name: "Bit2Me", type: "exchange" },
      { id: "10000000-0000-0000-0000-000000000004", name: "Ledger", type: "wallet" },
      { id: "10000000-0000-0000-0000-000000000005", name: "Coinbase", type: "exchange" },
      { id: "10000000-0000-0000-0000-000000000006", name: "Revolut", type: "bank" },
      { id: "10000000-0000-0000-0000-000000000007", name: "Bitvavo", type: "exchange" },
      { id: "10000000-0000-0000-0000-000000000008", name: "Bitunix", type: "exchange" },
    ];

    for (const acc of defaultAccounts) {
      insertAccount.run(acc.id, acc.name, acc.type);
    }

    return { appliedMigrations };
  }

  async runInTransaction<T>(work: () => Promise<T>): Promise<T> {
    this.db.exec('BEGIN');
    try {
      const result = await work();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // Spot Transactions
  // ---------------------------------------------------------------------------

  async getSpotTransactions(accountId?: string): Promise<LedgerSpotTransaction[]> {
    const query = accountId
      ? `SELECT t.*, acc.name AS exchange, COALESCE(ain.symbol, t.asset_in_id) AS asset_in_symbol, COALESCE(aout.symbol, t.asset_out_id) AS asset_out_symbol
         FROM spot_transactions t
         LEFT JOIN accounts acc ON t.account_id = acc.id
         LEFT JOIN assets ain ON (t.asset_in_id = ain.id OR t.asset_in_id = ain.symbol)
         LEFT JOIN assets aout ON (t.asset_out_id = aout.id OR t.asset_out_id = aout.symbol)
         WHERE t.account_id = ? AND t.deleted_at IS NULL
         ORDER BY t.timestamp ASC`
      : `SELECT t.*, acc.name AS exchange, COALESCE(ain.symbol, t.asset_in_id) AS asset_in_symbol, COALESCE(aout.symbol, t.asset_out_id) AS asset_out_symbol
         FROM spot_transactions t
         LEFT JOIN accounts acc ON t.account_id = acc.id
         LEFT JOIN assets ain ON (t.asset_in_id = ain.id OR t.asset_in_id = ain.symbol)
         LEFT JOIN assets aout ON (t.asset_out_id = aout.id OR t.asset_out_id = aout.symbol)
         WHERE t.deleted_at IS NULL
         ORDER BY t.timestamp ASC`;
    const stmt = this.db.prepare(query);
    const rows = (accountId ? stmt.all(accountId) : stmt.all()) as Record<string, unknown>[];

    return rows.map(row => ({
      id: row.id as string,
      id_hash: row.id_hash as string,
      account_id: row.account_id as string,
      exchange: (row.exchange as string) || (row.account_id as string),
      tx_type: row.tx_type as LedgerSpotTransaction['tx_type'],
      asset_in_id: (row.asset_in_symbol as string) || (row.asset_in_id as string) || undefined,
      amount_in: row.amount_in ? toPreciseAmount(row.amount_in as string) : undefined,
      asset_out_id: (row.asset_out_symbol as string) || (row.asset_out_id as string) || undefined,
      amount_out: row.amount_out ? toPreciseAmount(row.amount_out as string) : undefined,
      fee_asset_id: row.fee_asset_id as string | undefined,
      fee_amount: row.fee_amount ? toPreciseAmount(row.fee_amount as string) : undefined,
      total_fiat: toPreciseAmount(row.total_fiat as string),
      price_fiat: toPreciseAmount(row.price_fiat as string),
      fiat_currency: (row.fiat_currency as string) ?? 'USD',
      flag: (row.flag as LedgerSpotTransaction['flag']) ?? undefined,
      timestamp: row.timestamp as string,
      status: row.status as string,
    }));
  }

  async saveSpotTransaction(tx: LedgerSpotTransaction): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO spot_transactions (
        id, id_hash, account_id, tx_type,
        asset_in_id, amount_in, asset_out_id, amount_out,
        fee_asset_id, fee_amount, total_fiat, price_fiat,
        fiat_currency, timestamp, status, flag
      ) VALUES (
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?
      )
      ON CONFLICT(id_hash) DO UPDATE SET
        account_id = excluded.account_id,
        tx_type = excluded.tx_type,
        asset_in_id = excluded.asset_in_id,
        amount_in = excluded.amount_in,
        asset_out_id = excluded.asset_out_id,
        amount_out = excluded.amount_out,
        fee_asset_id = excluded.fee_asset_id,
        fee_amount = excluded.fee_amount,
        total_fiat = excluded.total_fiat,
        price_fiat = excluded.price_fiat,
        fiat_currency = excluded.fiat_currency,
        timestamp = excluded.timestamp,
        status = excluded.status,
        flag = excluded.flag,
        updated_at = datetime('now', 'utc'),
        deleted_at = NULL
    `);

    stmt.run(
      tx.id,
      tx.id_hash,
      tx.account_id,
      tx.tx_type,
      tx.asset_in_id ?? null,
      tx.amount_in ? tx.amount_in.toString() : null,
      tx.asset_out_id ?? null,
      tx.amount_out ? tx.amount_out.toString() : null,
      tx.fee_asset_id ?? null,
      tx.fee_amount ? tx.fee_amount.toString() : null,
      tx.total_fiat.toString(),
      tx.price_fiat.toString(),
      tx.fiat_currency,
      tx.timestamp,
      tx.status,
      tx.flag ?? null,
    );
  }

  // ---------------------------------------------------------------------------
  // Futures Transactions
  // ---------------------------------------------------------------------------

  async getFuturesTransactions(accountId?: string): Promise<LedgerFuturesTransaction[]> {
    const query = accountId
      ? 'SELECT t.*, acc.name AS exchange FROM futures_transactions t LEFT JOIN accounts acc ON t.account_id = acc.id WHERE t.account_id = ? AND t.deleted_at IS NULL ORDER BY t.timestamp ASC'
      : 'SELECT t.*, acc.name AS exchange FROM futures_transactions t LEFT JOIN accounts acc ON t.account_id = acc.id WHERE t.deleted_at IS NULL ORDER BY t.timestamp ASC';
    const stmt = this.db.prepare(query);
    const rows = (accountId ? stmt.all(accountId) : stmt.all()) as Record<string, unknown>[];

    return rows.map(row => ({
      id: row.id as string,
      id_hash: row.id_hash as string,
      account_id: row.account_id as string,
      exchange: (row.exchange as string) || (row.account_id as string),
      tx_type: row.tx_type as LedgerFuturesTransaction['tx_type'],
      symbol: row.symbol as string,
      amount: row.amount ? toPreciseAmount(row.amount as string) : undefined,
      trade_price: row.trade_price ? toPreciseAmount(row.trade_price as string) : undefined,
      realized_pnl: row.realized_pnl ? toPreciseAmount(row.realized_pnl as string) : undefined,
      settlement_asset_id: row.settlement_asset_id as string | undefined,
      funding_amount: row.funding_amount ? toPreciseAmount(row.funding_amount as string) : undefined,
      fee_asset_id: row.fee_asset_id as string | undefined,
      fee_amount: row.fee_amount ? toPreciseAmount(row.fee_amount as string) : undefined,
      fiat_currency: (row.fiat_currency as string) ?? 'USD',
      timestamp: row.timestamp as string,
      status: row.status as string,
    }));
  }

  async saveFuturesTransaction(tx: LedgerFuturesTransaction): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO futures_transactions (
        id, id_hash, account_id, tx_type, symbol,
        amount, trade_price, realized_pnl, settlement_asset_id,
        funding_amount, fee_asset_id, fee_amount,
        fiat_currency, timestamp, status
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?
      )
      ON CONFLICT(id_hash) DO UPDATE SET
        account_id = excluded.account_id,
        tx_type = excluded.tx_type,
        symbol = excluded.symbol,
        amount = excluded.amount,
        trade_price = excluded.trade_price,
        realized_pnl = excluded.realized_pnl,
        settlement_asset_id = excluded.settlement_asset_id,
        funding_amount = excluded.funding_amount,
        fee_asset_id = excluded.fee_asset_id,
        fee_amount = excluded.fee_amount,
        fiat_currency = excluded.fiat_currency,
        timestamp = excluded.timestamp,
        status = excluded.status,
        updated_at = datetime('now', 'utc'),
        deleted_at = NULL
    `);

    stmt.run(
      tx.id,
      tx.id_hash,
      tx.account_id,
      tx.tx_type,
      tx.symbol,
      tx.amount?.toString() ?? null,
      tx.trade_price?.toString() ?? null,
      tx.realized_pnl?.toString() ?? null,
      tx.settlement_asset_id ?? null,
      tx.funding_amount?.toString() ?? null,
      tx.fee_asset_id ?? null,
      tx.fee_amount?.toString() ?? null,
      tx.fiat_currency,
      tx.timestamp,
      tx.status,
    );
  }

  // ---------------------------------------------------------------------------
  // Tax Lots — fully aligned with SQL schema (C-2c, W-2)
  // ---------------------------------------------------------------------------

  async getTaxLots(accountId: string): Promise<LedgerTaxLot[]> {
    // W-2 fix: filter by account_id which now exists in the tax_lots table
    const stmt = this.db.prepare(
      'SELECT * FROM tax_lots WHERE account_id = ? AND deleted_at IS NULL ORDER BY acquisition_timestamp ASC'
    );
    const rows = stmt.all(accountId) as Record<string, unknown>[];

    return rows.map(row => ({
      id: row.id as string,
      spot_transaction_id: row.spot_transaction_id as string,
      asset_id: row.asset_id as string,
      account_id: row.account_id as string,
      original_qty: toPreciseAmount(row.original_qty as string),
      remaining_qty: toPreciseAmount(row.remaining_qty as string),
      unit_cost_fiat: toPreciseAmount(row.unit_cost_fiat as string),
      total_cost_fiat: toPreciseAmount(row.total_cost_fiat as string),
      fiat_currency: row.fiat_currency as string,
      acquisition_timestamp: row.acquisition_timestamp as string,
      exchange_location: row.exchange_location as string,
      source_tx_id: row.source_tx_id as string | undefined,
      status: row.status as LedgerTaxLot['status'],
      quality_flag: row.quality_flag as LedgerTaxLot['quality_flag'],
      value_provenance: row.value_provenance as LedgerTaxLot['value_provenance'],
    }));
  }

  async createTaxLot(lot: LedgerTaxLot): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO tax_lots (
        id, spot_transaction_id, asset_id, account_id,
        original_qty, remaining_qty,
        unit_cost_fiat, total_cost_fiat, fiat_currency,
        acquisition_timestamp, exchange_location, source_tx_id, status
      ) VALUES (
        ?, ?, ?, ?,
        ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?
      )
      ON CONFLICT(id) DO UPDATE SET
        remaining_qty = excluded.remaining_qty,
        unit_cost_fiat = excluded.unit_cost_fiat,
        total_cost_fiat = excluded.total_cost_fiat,
        status = excluded.status,
        updated_at = datetime('now', 'utc'),
        deleted_at = NULL
    `);

    stmt.run(
      lot.id,
      lot.spot_transaction_id,
      lot.asset_id,
      lot.account_id,
      lot.original_qty.toString(),
      lot.remaining_qty.toString(),
      lot.unit_cost_fiat.toString(),
      lot.total_cost_fiat.toString(),
      lot.fiat_currency,
      lot.acquisition_timestamp,
      lot.exchange_location,
      lot.source_tx_id ?? null,
      lot.status,
    );
  }

  // ---------------------------------------------------------------------------
  // Lot History Events (S-3: previously missing from port and adapter)
  // ---------------------------------------------------------------------------

  async getLotHistoryEvents(accountId: string): Promise<LedgerTaxLotEvent[]> {
    const stmt = this.db.prepare(
      'SELECT * FROM lot_history_events WHERE account_id = ? AND deleted_at IS NULL ORDER BY disposal_date ASC'
    );
    const rows = stmt.all(accountId) as Record<string, unknown>[];

    return rows.map(row => ({
      id: row.id as string,
      tax_lot_id: row.tax_lot_id as string,
      spot_transaction_id: row.spot_transaction_id as string,
      account_id: row.account_id as string,
      disposal_date: row.disposal_date as string,
      amount_from_lot: toPreciseAmount(row.amount_from_lot as string),
      // Null survives the boundary: an unresolved price is not a price of zero.
      sale_price_fiat:
        row.sale_price_fiat === null ? null : toPreciseAmount(row.sale_price_fiat as string),
      gain_loss_fiat:
        row.gain_loss_fiat === null ? null : toPreciseAmount(row.gain_loss_fiat as string),
      fiat_currency: row.fiat_currency as string,
      is_taxable: Boolean(row.is_taxable),
      disposal_type: row.disposal_type as LedgerTaxLotEvent['disposal_type'],
      flag: row.flag as LedgerTaxLotEvent['flag'],
      quality_flag: row.quality_flag as LedgerTaxLotEvent['quality_flag'],
      value_provenance: row.value_provenance as LedgerTaxLotEvent['value_provenance'],
      notes: row.notes as string | undefined,
    }));
  }

  async saveLotHistoryEvent(event: LedgerTaxLotEvent): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO lot_history_events (
        id, tax_lot_id, spot_transaction_id, account_id,
        disposal_date, amount_from_lot, sale_price_fiat, gain_loss_fiat,
        fiat_currency, is_taxable, disposal_type, flag, quality_flag, value_provenance, notes
      ) VALUES (
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?
      )
      ON CONFLICT(id) DO UPDATE SET
        amount_from_lot = excluded.amount_from_lot,
        sale_price_fiat = excluded.sale_price_fiat,
        gain_loss_fiat = excluded.gain_loss_fiat,
        is_taxable = excluded.is_taxable,
        disposal_type = excluded.disposal_type,
        quality_flag = excluded.quality_flag,
        value_provenance = excluded.value_provenance,
        updated_at = datetime('now', 'utc')
    `);

    stmt.run(
      event.id,
      event.tax_lot_id,
      event.spot_transaction_id,
      event.account_id,
      event.disposal_date,
      event.amount_from_lot.toString(),
      event.sale_price_fiat === null ? null : event.sale_price_fiat.toString(),
      event.gain_loss_fiat === null ? null : event.gain_loss_fiat.toString(),
      event.fiat_currency,
      event.is_taxable ? 1 : 0,
      event.disposal_type,
      event.flag ?? null,
      event.quality_flag ?? null,
      event.value_provenance ?? 'MARKET',
      event.notes ?? null,
    );
  }

  // ---------------------------------------------------------------------------
  // FK Pre-resolution helpers
  // ---------------------------------------------------------------------------

  async ensureAssetExists(input: EnsureAssetInput): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO assets (id, symbol, is_fiat, created_at, updated_at)
      VALUES (?, ?, ?, datetime('now', 'utc'), datetime('now', 'utc'))
      ON CONFLICT(id) DO NOTHING
    `);
    // Use provided symbol or fall back to assetId (common in test/ingestion scenarios)
    stmt.run(input.assetId, input.symbol ?? input.assetId, input.isFiat ? 1 : 0);
  }

  async ensureAccountExists(input: EnsureAccountInput): Promise<string> {
    if (input.parentAccountId && input.parentAccountId !== input.accountId) {
      this.insertAccount(input.parentAccountId, input.parentAccountId, 'exchange', null, false);
    }

    // A synthetic custody counterparty is a wallet, not a venue: nothing can be imported into it
    // and it has no credentials.
    const type = input.isSynthetic === true ? 'wallet' : 'exchange';
    this.insertAccount(
      input.accountId,
      input.name ?? input.accountId,
      type,
      input.parentAccountId ?? null,
      input.isSynthetic === true,
    );

    const subAccountId = deriveSubAccountId(input.accountId, input.wallet);
    if (subAccountId === input.accountId) return input.accountId;

    // The identifier is derived from the venue's id so it stays stable across imports, but the
    // name is derived from the venue's *name*, which is the part a user reads.
    const venueName = this.readAccountName(input.accountId) ?? input.name ?? input.accountId;
    this.insertAccount(
      subAccountId,
      deriveSubAccountId(venueName, input.wallet),
      type,
      input.accountId,
      false,
    );

    return subAccountId;
  }

  private readAccountName(accountId: string): string | undefined {
    const row = this.db.prepare('SELECT name FROM accounts WHERE id = ?').get(accountId) as
      | { name: string }
      | undefined;
    return row?.name;
  }

  /**
   * `DO NOTHING` rather than `DO UPDATE`: an account that already exists as a real venue must not be
   * demoted to synthetic, and reconciliation must not rewrite user-visible account metadata.
   */
  private insertAccount(
    id: string,
    name: string,
    type: string,
    parentAccountId: string | null,
    isSynthetic: boolean,
  ): void {
    this.db
      .prepare(
        `INSERT INTO accounts (id, name, type, parent_account_id, is_synthetic, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, datetime('now', 'utc'), datetime('now', 'utc'))
         ON CONFLICT(id) DO NOTHING`,
      )
      .run(id, name, type, parentAccountId, isSynthetic ? 1 : 0);
  }

  async getAccounts(): Promise<
    {
      id: string;
      name: string;
      type: string;
      parentAccountId?: string | null;
      isSynthetic: boolean;
    }[]
  > {
    const rows = this.db
      .prepare(
        `SELECT id, name, type, parent_account_id, is_synthetic
           FROM accounts WHERE deleted_at IS NULL ORDER BY name ASC`,
      )
      .all() as {
      id: string;
      name: string;
      type: string;
      parent_account_id: string | null;
      is_synthetic: number;
    }[];

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      type: row.type,
      parentAccountId: row.parent_account_id,
      isSynthetic: row.is_synthetic === 1,
    }));
  }

  // ---------------------------------------------------------------------------
  // Reconciliation of the derived tables
  // ---------------------------------------------------------------------------

  async reconcileTaxLots(lots: LedgerTaxLot[]): Promise<ReconciliationSummary> {
    return this.reconcile<LedgerTaxLot>(
      {
        table: 'tax_lots',
        columns: [
          'spot_transaction_id',
          'asset_id',
          'account_id',
          'original_qty',
          'remaining_qty',
          'unit_cost_fiat',
          'total_cost_fiat',
          'fiat_currency',
          'acquisition_timestamp',
          'exchange_location',
          'source_tx_id',
          'status',
          'quality_flag',
          'value_provenance',
        ],
        identify: (lot) => lot.id,
        project: (lot) => [
          lot.spot_transaction_id,
          lot.asset_id,
          lot.account_id,
          lot.original_qty.toString(),
          lot.remaining_qty.toString(),
          lot.unit_cost_fiat.toString(),
          lot.total_cost_fiat.toString(),
          lot.fiat_currency,
          lot.acquisition_timestamp,
          lot.exchange_location,
          lot.source_tx_id ?? null,
          lot.status,
          lot.quality_flag ?? null,
          lot.value_provenance ?? 'MARKET',
        ],
      },
      lots,
    );
  }

  async reconcileLotHistoryEvents(
    events: LedgerTaxLotEvent[],
  ): Promise<ReconciliationSummary> {
    return this.reconcile<LedgerTaxLotEvent>(
      {
        table: 'lot_history_events',
        columns: [
          'tax_lot_id',
          'spot_transaction_id',
          'account_id',
          'disposal_date',
          'amount_from_lot',
          'sale_price_fiat',
          'gain_loss_fiat',
          'fiat_currency',
          'is_taxable',
          'disposal_type',
          'flag',
          'quality_flag',
          'value_provenance',
          'notes',
        ],
        identify: (event) => event.id,
        project: (event) => [
          event.tax_lot_id,
          event.spot_transaction_id,
          event.account_id,
          event.disposal_date,
          event.amount_from_lot.toString(),
          event.sale_price_fiat === null ? null : event.sale_price_fiat.toString(),
          event.gain_loss_fiat === null ? null : event.gain_loss_fiat.toString(),
          event.fiat_currency,
          event.is_taxable ? 1 : 0,
          event.disposal_type,
          event.flag ?? null,
          event.quality_flag ?? null,
          event.value_provenance ?? 'MARKET',
          event.notes ?? null,
        ],
      },
      events,
    );
  }

  async reconcileCustodyEntries(
    entries: LedgerCustodyEntry[],
  ): Promise<ReconciliationSummary> {
    return this.reconcile<LedgerCustodyEntry>(
      {
        table: 'lot_custody_entries',
        columns: [
          'tax_lot_id',
          'asset_id',
          'account_id',
          'qty_delta',
          'occurred_at',
          'spot_transaction_id',
        ],
        identify: (entry) => entry.id,
        project: (entry) => [
          entry.tax_lot_id,
          entry.asset_id,
          entry.account_id,
          entry.qty_delta.toString(),
          entry.occurred_at,
          entry.spot_transaction_id,
        ],
      },
      entries,
    );
  }

  /**
   * Brings one derived table into agreement with the complete recomputed set.
   *
   * Soft-deleted rows are read alongside the live ones: without them a returning row would be
   * inserted as a duplicate against a primary key that already holds it.
   *
   * A row whose values are unchanged is skipped entirely rather than written with identical
   * content. That is not an optimisation — the audit trigger fires on every UPDATE, so a no-op
   * write would record a change that did not happen and make an idempotent rebuild indistinguishable
   * from a real one.
   */
  private reconcile<T>(
    spec: DerivedTableSpec<T>,
    rows: readonly T[],
  ): ReconciliationSummary {
    const { table, columns } = spec;

    const persisted = new Map<string, { values: string; retired: boolean }>();
    for (const row of this.db
      .prepare(`SELECT id, ${columns.join(', ')}, deleted_at FROM ${table}`)
      .all() as Record<string, unknown>[]) {
      persisted.set(row.id as string, {
        values: this.fingerprint(columns.map((column) => row[column] as SqlValue)),
        retired: row.deleted_at !== null,
      });
    }

    const insert = this.db.prepare(
      `INSERT INTO ${table} (id, ${columns.join(', ')})
       VALUES (${['?', ...columns.map(() => '?')].join(', ')})`,
    );
    const update = this.db.prepare(
      `UPDATE ${table}
          SET ${columns.map((column) => `${column} = ?`).join(', ')},
              deleted_at = NULL,
              updated_at = datetime('now', 'utc')
        WHERE id = ?`,
    );
    const retire = this.db.prepare(
      `UPDATE ${table}
          SET deleted_at = datetime('now', 'utc'), updated_at = datetime('now', 'utc')
        WHERE id = ? AND deleted_at IS NULL`,
    );

    const summary: ReconciliationSummary = {
      inserted: 0,
      updated: 0,
      retired: 0,
      reactivated: 0,
    };

    const recomputedIds = new Set<string>();
    for (const row of rows) {
      const id = spec.identify(row);
      recomputedIds.add(id);

      const values = spec.project(row);
      const existing = persisted.get(id);

      if (existing === undefined) {
        insert.run(id, ...values);
        summary.inserted += 1;
        continue;
      }

      const changed = this.fingerprint(values) !== existing.values;
      if (existing.retired) {
        update.run(...values, id);
        summary.reactivated += 1;
      } else if (changed) {
        update.run(...values, id);
        summary.updated += 1;
      }
    }

    for (const [id, existing] of persisted) {
      if (existing.retired || recomputedIds.has(id)) {
        continue;
      }
      retire.run(id);
      summary.retired += 1;
    }

    return summary;
  }

  /**
   * A comparable rendering of one row's values.
   *
   * SQLite returns an INTEGER column as a number and TEXT as a string, so both sides are rendered
   * before comparison. The separator is a unit separator and the null marker is a control character:
   * neither can occur in a decimal string, an ISO timestamp or an enum member, so no pair of
   * distinct rows can collide onto one fingerprint.
   */
  private fingerprint(values: readonly SqlValue[]): string {
    return values
      .map((value) => (value === null ? '\u0000' : String(value)))
      .join('\u001F');
  }

  async getCustodyEntries(accountId?: string): Promise<LedgerCustodyEntry[]> {
    const rows = (
      accountId
        ? this.db
            .prepare(
              `SELECT * FROM lot_custody_entries
                WHERE account_id = ? AND deleted_at IS NULL
                ORDER BY occurred_at ASC`,
            )
            .all(accountId)
        : this.db
            .prepare(
              'SELECT * FROM lot_custody_entries WHERE deleted_at IS NULL ORDER BY occurred_at ASC',
            )
            .all()
    ) as Record<string, unknown>[];

    return rows.map((row) => ({
      id: row.id as string,
      tax_lot_id: row.tax_lot_id as string,
      asset_id: row.asset_id as string,
      account_id: row.account_id as string,
      qty_delta: toPreciseAmount(row.qty_delta as string),
      occurred_at: row.occurred_at as string,
      spot_transaction_id: row.spot_transaction_id as string,
    }));
  }

  // ---------------------------------------------------------------------------
  // User-authored overrides — calculation inputs, never reconciled
  // ---------------------------------------------------------------------------

  async getManualPriceOverrides(): Promise<LedgerManualPriceOverride[]> {
    const rows = this.db
      .prepare(
        `SELECT id_hash, price_fiat, fiat_currency, note
           FROM manual_price_overrides WHERE deleted_at IS NULL ORDER BY id_hash ASC`,
      )
      .all() as Record<string, unknown>[];

    return rows.map((row) => ({
      id_hash: row.id_hash as string,
      price_fiat: toPreciseAmount(row.price_fiat as string),
      fiat_currency: row.fiat_currency as string,
      note: (row.note as string | null) ?? undefined,
    }));
  }

  async setManualPriceOverride(override: LedgerManualPriceOverride): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO manual_price_overrides (id_hash, price_fiat, fiat_currency, note)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(id_hash) DO UPDATE SET
           price_fiat = excluded.price_fiat,
           fiat_currency = excluded.fiat_currency,
           note = excluded.note,
           deleted_at = NULL,
           updated_at = datetime('now', 'utc')`,
      )
      .run(
        override.id_hash,
        override.price_fiat.toString(),
        override.fiat_currency,
        override.note ?? null,
      );
  }

  async removeManualPriceOverride(idHash: string): Promise<void> {
    this.db
      .prepare(
        `UPDATE manual_price_overrides
            SET deleted_at = datetime('now', 'utc'), updated_at = datetime('now', 'utc')
          WHERE id_hash = ? AND deleted_at IS NULL`,
      )
      .run(idHash);
  }

  async getTransferDestinationOverrides(): Promise<LedgerTransferDestinationOverride[]> {
    const rows = this.db
      .prepare(
        `SELECT id_hash, counterparty_account_id, note
           FROM transfer_destination_overrides WHERE deleted_at IS NULL ORDER BY id_hash ASC`,
      )
      .all() as Record<string, unknown>[];

    return rows.map((row) => ({
      id_hash: row.id_hash as string,
      counterparty_account_id: row.counterparty_account_id as string,
      note: (row.note as string | null) ?? undefined,
    }));
  }

  async setTransferDestinationOverride(
    override: LedgerTransferDestinationOverride,
  ): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO transfer_destination_overrides (id_hash, counterparty_account_id, note)
         VALUES (?, ?, ?)
         ON CONFLICT(id_hash) DO UPDATE SET
           counterparty_account_id = excluded.counterparty_account_id,
           note = excluded.note,
           deleted_at = NULL,
           updated_at = datetime('now', 'utc')`,
      )
      .run(override.id_hash, override.counterparty_account_id, override.note ?? null);
  }

  async removeTransferDestinationOverride(idHash: string): Promise<void> {
    this.db
      .prepare(
        `UPDATE transfer_destination_overrides
            SET deleted_at = datetime('now', 'utc'), updated_at = datetime('now', 'utc')
          WHERE id_hash = ? AND deleted_at IS NULL`,
      )
      .run(idHash);
  }

  async getTrackedAssets(): Promise<{ assetId: string; symbol: string }[]> {
    const stmt = this.db.prepare(`
      SELECT id, symbol
      FROM assets
      WHERE deleted_at IS NULL
        AND symbol IS NOT NULL
      ORDER BY symbol ASC
    `);

    const rows = stmt.all() as { id: string; symbol: string }[];
    return rows.map((row) => ({ assetId: row.id, symbol: row.symbol }));
  }

  private applyMigrations(): string[] {
    // 1. Create schema tracking table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS _schema_migrations (
          filename TEXT PRIMARY KEY,
          applied_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
      );
    `);

    // 2. Discover all .sql files in packages/database/migrations/sqlite in sorted numeric order
    const migrationsDir = path.resolve(
      __dirname,
      '../../../../../../packages/database/migrations/sqlite',
    );

    if (!fs.existsSync(migrationsDir)) {
      return [];
    }

    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    const applied = new Set(
      (
        this.db.prepare('SELECT filename FROM _schema_migrations').all() as {
          filename: string;
        }[]
      ).map((r) => r.filename),
    );

    // Legacy database compatibility guard: if spot_transactions already has fiat_currency,
    // mark 003_currency_schema.sql as applied to prevent duplicate column error on pre-existing DBs
    const tables = this.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='spot_transactions'")
      .all() as { name: string }[];
    if (tables.length > 0) {
      const spotColumns = (
        this.db.prepare('PRAGMA table_info(spot_transactions)').all() as { name: string }[]
      ).map((c) => c.name);
      if (spotColumns.includes('fiat_currency') && !applied.has('003_currency_schema.sql')) {
        this.db
          .prepare('INSERT OR IGNORE INTO _schema_migrations (filename) VALUES (?)')
          .run('003_currency_schema.sql');
        applied.add('003_currency_schema.sql');
      }
    }

    const newlyApplied: string[] = [];

    for (const file of files) {
      if (applied.has(file)) {
        continue;
      }

      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf-8');

      this.db.exec(sql);

      this.db
        .prepare('INSERT INTO _schema_migrations (filename) VALUES (?)')
        .run(file);
      applied.add(file);
      newlyApplied.push(file);
    }

    return newlyApplied;
  }
}

