import type { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { toPreciseAmount } from '../../domain/value-objects/PreciseAmount.js';
import type {
  ILedgerPort,
  LedgerSpotTransaction,
  LedgerFuturesTransaction,
  LedgerTaxLot,
  LedgerTaxLotEvent,
} from '../../domain/ports/ILedgerPort';

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

  async initialize(): Promise<void> {
    this.applyMigrations();

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
        fiat_currency, timestamp, status
      ) VALUES (
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?
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
      sale_price_fiat: toPreciseAmount(row.sale_price_fiat as string),
      gain_loss_fiat: toPreciseAmount(row.gain_loss_fiat as string),
      fiat_currency: row.fiat_currency as string,
      is_taxable: Boolean(row.is_taxable),
      flag: row.flag as string | null | undefined,
      notes: row.notes as string | undefined,
    }));
  }

  async saveLotHistoryEvent(event: LedgerTaxLotEvent): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO lot_history_events (
        id, tax_lot_id, spot_transaction_id, account_id,
        disposal_date, amount_from_lot, sale_price_fiat, gain_loss_fiat,
        fiat_currency, is_taxable, flag, notes
      ) VALUES (
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?
      )
      ON CONFLICT(id) DO UPDATE SET
        amount_from_lot = excluded.amount_from_lot,
        sale_price_fiat = excluded.sale_price_fiat,
        gain_loss_fiat = excluded.gain_loss_fiat,
        is_taxable = excluded.is_taxable,
        updated_at = datetime('now', 'utc')
    `);

    stmt.run(
      event.id,
      event.tax_lot_id,
      event.spot_transaction_id,
      event.account_id,
      event.disposal_date,
      event.amount_from_lot.toString(),
      event.sale_price_fiat.toString(),
      event.gain_loss_fiat.toString(),
      event.fiat_currency,
      event.is_taxable ? 1 : 0,
      event.flag ?? null,
      event.notes ?? null,
    );
  }

  // ---------------------------------------------------------------------------
  // FK Pre-resolution helpers
  // ---------------------------------------------------------------------------

  async ensureAssetExists(assetId: string, symbol?: string): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO assets (id, symbol, created_at, updated_at)
      VALUES (?, ?, datetime('now', 'utc'), datetime('now', 'utc'))
      ON CONFLICT(id) DO NOTHING
    `);
    // Use provided symbol or fall back to assetId (common in test/ingestion scenarios)
    stmt.run(assetId, symbol ?? assetId);
  }

  async ensureAccountExists(accountId: string, name?: string): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO accounts (id, name, type, created_at, updated_at)
      VALUES (?, ?, 'exchange', datetime('now', 'utc'), datetime('now', 'utc'))
      ON CONFLICT(id) DO NOTHING
    `);
    stmt.run(accountId, name ?? accountId);
  }

  async getAccounts(): Promise<{ id: string; name: string; type: string }[]> {
    const stmt = this.db.prepare(
      'SELECT id, name, type FROM accounts WHERE deleted_at IS NULL ORDER BY name ASC'
    );
    const rows = stmt.all() as { id: string; name: string; type: string }[];
    return rows;
  }

  async upsertTaxLots(lots: LedgerTaxLot[]): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO tax_lots (
        id, spot_transaction_id, asset_id, account_id,
        original_qty, remaining_qty, unit_cost_fiat, total_cost_fiat,
        fiat_currency, acquisition_timestamp, exchange_location, source_tx_id,
        status, updated_at
      ) VALUES (
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, datetime('now', 'utc')
      ) ON CONFLICT(id) DO UPDATE SET
        remaining_qty = excluded.remaining_qty,
        status = excluded.status,
        updated_at = datetime('now', 'utc')
        WHERE remaining_qty != excluded.remaining_qty OR status != excluded.status;
    `);

    for (const lot of lots) {
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
        lot.status
      );
    }
  }

  async upsertLotHistoryEvents(events: LedgerTaxLotEvent[]): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO lot_history_events (
        id, tax_lot_id, spot_transaction_id, account_id,
        amount_from_lot, sale_price_fiat, gain_loss_fiat, fiat_currency,
        is_taxable, flag, notes, disposal_date, updated_at
      ) VALUES (
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, datetime('now', 'utc')
      ) ON CONFLICT(id) DO UPDATE SET
        amount_from_lot = excluded.amount_from_lot,
        sale_price_fiat = excluded.sale_price_fiat,
        gain_loss_fiat = excluded.gain_loss_fiat,
        is_taxable = excluded.is_taxable,
        flag = excluded.flag,
        notes = excluded.notes,
        disposal_date = excluded.disposal_date,
        updated_at = datetime('now', 'utc')
        WHERE amount_from_lot != excluded.amount_from_lot
           OR sale_price_fiat != excluded.sale_price_fiat
           OR gain_loss_fiat != excluded.gain_loss_fiat
           OR is_taxable != excluded.is_taxable
           OR flag IS DISTINCT FROM excluded.flag
           OR notes IS DISTINCT FROM excluded.notes
           OR disposal_date != excluded.disposal_date;
    `);

    for (const event of events) {
      stmt.run(
        event.id,
        event.tax_lot_id,
        event.spot_transaction_id,
        event.account_id,
        event.amount_from_lot.toString(),
        event.sale_price_fiat.toString(),
        event.gain_loss_fiat.toString(),
        event.fiat_currency,
        event.is_taxable ? 1 : 0,
        event.flag ?? null,
        event.notes ?? null,
        event.disposal_date
      );
    }
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

  private applyMigrations(): void {
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
      return;
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
    }
  }
}

