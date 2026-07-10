/**
 * ILedgerPort — Domain Port for the SQLite transactional ledger.
 *
 * DOMAIN ISOLATION RULE: No external library imports allowed here.
 * Decimal.js lives in Infrastructure. The domain uses `PreciseAmount`
 * as an opaque branded string type that Infrastructure adapters
 * convert to/from Decimal at the boundary.
 *
 * Money arithmetic belongs in the Application / Infrastructure layers.
 */
import type { SpotTxType, FuturesTxType, TaxLotStatus } from '@kryptofolio/shared-types';
import Decimal from 'decimal.js';

// ---------------------------------------------------------------------------
// Domain value aliases
// These are the only numeric representations visible to the Domain Port.
// The Adapter converts TEXT from SQLite → Decimal before returning,
// and Decimal → TEXT before writing.
// ---------------------------------------------------------------------------

/** Opaque alias: a Decimal.js instance holding a financial value with full precision. */
export type PreciseAmount = Decimal;

// ---------------------------------------------------------------------------
// Domain Entity Interfaces (what the Domain sees — never raw SQLite strings)
// ---------------------------------------------------------------------------

export interface LedgerSpotTransaction {
  id: string;
  id_hash: string;
  account_id: string;
  tx_type: SpotTxType;
  asset_in_id?: string;
  amount_in?: PreciseAmount;
  asset_out_id?: string;
  amount_out?: PreciseAmount;
  fee_asset_id?: string;
  fee_amount?: PreciseAmount;
  total_fiat: PreciseAmount;
  price_fiat: PreciseAmount;
  timestamp: string; // ISO-8601
  status: string;
}

export interface LedgerFuturesTransaction {
  id: string;
  id_hash: string;
  account_id: string;
  tx_type: FuturesTxType;
  symbol: string;
  amount?: PreciseAmount;
  trade_price?: PreciseAmount;
  realized_pnl?: PreciseAmount;
  settlement_asset_id?: string;
  funding_amount?: PreciseAmount;
  fee_asset_id?: string;
  fee_amount?: PreciseAmount;
  timestamp: string; // ISO-8601
  status: string;
}

export interface LedgerTaxLot {
  id: string;
  spot_transaction_id: string;
  asset_id: string;
  account_id: string;
  original_qty: PreciseAmount;
  remaining_qty: PreciseAmount;
  unit_cost_fiat: PreciseAmount;
  total_cost_fiat: PreciseAmount;
  fiat_currency: string;
  acquisition_timestamp: string; // ISO-8601
  exchange_location: string;
  source_tx_id?: string;
  status: TaxLotStatus;
}

export interface LedgerTaxLotEvent {
  id: string;
  tax_lot_id: string;
  spot_transaction_id: string;
  account_id: string;
  disposal_date: string; // ISO-8601
  amount_from_lot: PreciseAmount;
  sale_price_fiat: PreciseAmount;
  gain_loss_fiat: PreciseAmount;
  fiat_currency: string;
  is_taxable: boolean;
  flag?: string | null;
  notes?: string;
}

// ---------------------------------------------------------------------------
// Port Interface
// ---------------------------------------------------------------------------

export interface ILedgerPort {
  /** Runs DDL migrations to ensure all tables exist. Call once at server startup. */
  initialize(): Promise<void>;

  // Spot Transactions
  getSpotTransactions(accountId: string): Promise<LedgerSpotTransaction[]>;
  saveSpotTransaction(tx: LedgerSpotTransaction): Promise<void>;

  // Futures Transactions
  getFuturesTransactions(accountId: string): Promise<LedgerFuturesTransaction[]>;
  saveFuturesTransaction(tx: LedgerFuturesTransaction): Promise<void>;

  // Tax Lots
  getTaxLots(accountId: string): Promise<LedgerTaxLot[]>;
  createTaxLot(lot: LedgerTaxLot): Promise<void>;
  upsertTaxLots(lots: LedgerTaxLot[]): Promise<void>;

  // Lot History Events (S-3: previously missing)
  getLotHistoryEvents(accountId: string): Promise<LedgerTaxLotEvent[]>;
  saveLotHistoryEvent(event: LedgerTaxLotEvent): Promise<void>;
  upsertLotHistoryEvents(events: LedgerTaxLotEvent[]): Promise<void>;

  // FK pre-resolution
  getAccounts(): Promise<{ id: string; name: string; type: string }[]>;
  ensureAssetExists(assetId: string, symbol?: string): Promise<void>;
  ensureAccountExists(accountId: string, name?: string): Promise<void>;

  /**
   * Returns all unique (assetId, symbol) pairs that are currently tracked
   * in the ledger (i.e. appear in the assets table).
   * Used by IngestDailyPricesUseCase to discover which assets need price ingestion.
   */
  getTrackedAssets(): Promise<{ assetId: string; symbol: string }[]>;
}
