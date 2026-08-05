/**
 * ILedgerPort — Domain Port for the SQLite transactional ledger.
 *
 * DOMAIN ISOLATION RULE: No external library imports allowed here.
 * PreciseAmount is a branded string defined in domain/value-objects.
 * Infrastructure adapters convert TEXT ↔ PreciseAmount at the boundary.
 * Money arithmetic belongs in the Application / Infrastructure layers.
 */
import type {
  SpotTxType,
  FuturesTxType,
  TaxLotStatus,
  DisposalType,
  FifoQualityFlag,
  FiscalClassificationFlag,
  ManualValueProvenance,
} from '@kryptofolio/shared-types';
import type { PreciseAmount } from '../value-objects/PreciseAmount.js';

// ---------------------------------------------------------------------------
// Domain Entity Interfaces (what the Domain sees — never raw SQLite strings)
// ---------------------------------------------------------------------------

export interface LedgerSpotTransaction {
  id: string;
  id_hash: string;
  account_id: string;
  exchange?: string;
  tx_type: SpotTxType;
  asset_in_id?: string;
  amount_in?: PreciseAmount;
  asset_out_id?: string;
  amount_out?: PreciseAmount;
  fee_asset_id?: string;
  fee_amount?: PreciseAmount;
  total_fiat: PreciseAmount;
  price_fiat: PreciseAmount;
  /** ISO-4217 currency code (e.g. 'EUR', 'USD'). Mandatory — never undefined. */
  fiat_currency: string;
  /**
   * Fiscal classification of the operation, when the canonical `tx_type` cannot express it. The
   * derived events inherit it, which is how the AEAT audit trail survives materialisation.
   */
  flag?: FiscalClassificationFlag | null;
  /**
   * Links this leg to the other leg of the same physical custody movement, once ingestion has
   * validated the source's own reference as one — see `withTransferGroupId` in `rowAggregator`.
   * Read by DuckDB's `v_custody_movements` to attribute a transfer to its real counterparty instead
   * of the synthetic `ownwallet-<ASSET>`.
   */
  transfer_group_id?: string | null;
  timestamp: string; // ISO-8601
  status: string;
}

export interface LedgerFuturesTransaction {
  id: string;
  id_hash: string;
  account_id: string;
  exchange?: string;
  tx_type: FuturesTxType;
  symbol: string;
  amount?: PreciseAmount;
  trade_price?: PreciseAmount;
  realized_pnl?: PreciseAmount;
  settlement_asset_id?: string;
  funding_amount?: PreciseAmount;
  fee_asset_id?: string;
  fee_amount?: PreciseAmount;
  /** ISO-4217 currency code (e.g. 'EUR', 'USD'). Mandatory — never undefined. */
  fiat_currency: string;
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
  /** Data-quality defect on this lot's basis, if any. Suppresses gains; never blocks. */
  quality_flag?: FifoQualityFlag | null;
  /** Whether the cost basis was observed from market data or declared by the user. */
  value_provenance?: ManualValueProvenance;
}

export interface LedgerTaxLotEvent {
  id: string;
  tax_lot_id: string;
  spot_transaction_id: string;
  account_id: string;
  disposal_date: string; // ISO-8601
  amount_from_lot: PreciseAmount;
  /**
   * Fiat proceeds per unit, or `null` when no price could be resolved.
   *
   * Nullability is load-bearing: without it the SQL has no way to express "unknown" and resorts to
   * inventing a plausible number.
   */
  sale_price_fiat: PreciseAmount | null;
  /** `null` whenever `sale_price_fiat` is null — no gain is derivable from an unknown price. */
  gain_loss_fiat: PreciseAmount | null;
  fiat_currency: string;
  is_taxable: boolean;
  /** Why the lot was consumed. Never assumed — a network fee is not a sale. */
  disposal_type: DisposalType;
  /**
   * Fiscal classification. `WALLET_ACTIVATION` drives the AEAT audit trail. Distinct from
   * `quality_flag` because the two co-occur.
   */
  flag?: FiscalClassificationFlag | null;
  /** Data-quality defect on this event's valuation, if any. */
  quality_flag?: FifoQualityFlag | null;
  /** Whether the monetary value was observed from market data or declared by the user. */
  value_provenance?: ManualValueProvenance;
  notes?: string;
}

/**
 * One leg of a double-entry custody movement: a signed quantity delta of one lot against one account
 * at a point in time.
 *
 * `qty_delta` is signed, unlike every fiat magnitude in this port. The entries for one movement sum
 * to zero for a given asset, which is what makes custody a balance rather than a pairing heuristic —
 * no time window, no amount tolerance, order-independent.
 */
export interface LedgerCustodyEntry {
  id: string;
  tax_lot_id: string;
  asset_id: string;
  account_id: string;
  /** Negative for an outflow, positive for an inflow. */
  qty_delta: PreciseAmount;
  occurred_at: string; // ISO-8601
  spot_transaction_id: string;
}

/**
 * A user-declared fiat value for a transaction whose market price could not be resolved.
 *
 * A calculation input, never a reconciled output. Keyed on `id_hash` — the deterministic transaction
 * identity — so it survives re-ingestion of the same source file.
 */
export interface LedgerManualPriceOverride {
  id_hash: string;
  price_fiat: PreciseAmount;
  /** Required: a declared value without its currency is not interpretable. */
  fiat_currency: string;
  note?: string;
}

/**
 * A user-declared counterparty for a custody movement, replacing the synthetic
 * `ownwallet-<ASSET>` account with a real one. Also a calculation INPUT.
 */
export interface LedgerTransferDestinationOverride {
  id_hash: string;
  counterparty_account_id: string;
  note?: string;
}

/**
 * Outcome of reconciling one derived table against a recomputed set.
 *
 * `retired` is the arm an upsert cannot express. Without it materialisation is monotonic — able only
 * to grow — so rows whose source disappeared survive indefinitely.
 */
export interface ReconciliationSummary {
  inserted: number;
  updated: number;
  retired: number;
  reactivated: number;
}

/**
 * `wallet` carries the source's sub-wallet designation (Kraken's `spot / main`, `earn`, …) so a child
 * account can be resolved; absent it, the venue account is used and no child is fabricated.
 */
export interface EnsureAccountInput {
  accountId: string;
  name?: string;
  type?: string;
  /** Sub-wallet designation from the source export, if any. */
  wallet?: string | null;
  /** Venue parent for a sub-wallet account. */
  parentAccountId?: string | null;
  /** True for system-created custody counterparties (`ownwallet-<ASSET>`). */
  isSynthetic?: boolean;
}

/** Input for resolving an asset, including whether it is a unit of account rather than a holding. */
export interface EnsureAssetInput {
  assetId: string;
  symbol?: string;
  /** Fiat assets are excluded from FIFO lot tracking entirely. */
  isFiat?: boolean;
}

/** What `initialize` changed, so the caller can react to a schema that moved under it. */
export interface LedgerInitializationSummary {
  /**
   * Migrations applied by this call, empty when the schema was already current.
   *
   * Reported rather than acted upon: a migration invalidates the derived tables, but the flag that
   * records that fact lives in the settings database, which this port cannot reach.
   */
  readonly appliedMigrations: readonly string[];
}

// ---------------------------------------------------------------------------
// Port Interface
// ---------------------------------------------------------------------------

export interface ILedgerPort {
  /** Runs DDL migrations to ensure all tables exist. Call once at server startup. */
  initialize(): Promise<LedgerInitializationSummary>;

  /**
   * Runs `work` as one unit: either every write inside it lands or none does.
   *
   * Declared on the port because atomicity is a requirement the caller must be able to state, and
   * the three reconciliation methods below are individually insufficient — a half-reconciled ledger
   * presents events referencing lots that no longer exist. The caller never sees a transaction
   * handle, so no SQL vocabulary leaks out of the adapter.
   */
  runInTransaction<T>(work: () => Promise<T>): Promise<T>;

  // Spot Transactions
  getSpotTransactions(accountId?: string): Promise<LedgerSpotTransaction[]>;
  saveSpotTransaction(tx: LedgerSpotTransaction): Promise<void>;

  // Futures Transactions
  getFuturesTransactions(accountId?: string): Promise<LedgerFuturesTransaction[]>;
  saveFuturesTransaction(tx: LedgerFuturesTransaction): Promise<void>;

  // Tax Lots
  getTaxLots(accountId: string): Promise<LedgerTaxLot[]>;
  createTaxLot(lot: LedgerTaxLot): Promise<void>;

  // Lot History Events (S-3: previously missing)
  getLotHistoryEvents(accountId: string): Promise<LedgerTaxLotEvent[]>;
  saveLotHistoryEvent(event: LedgerTaxLotEvent): Promise<void>;

  // ---------------------------------------------------------------------------
  // Reconciliation of derived tables
  //
  // Each method takes the COMPLETE recomputed set and brings the table into agreement with it:
  // insert, update, soft-delete the absent, reactivate the returning. An upsert cannot retire an
  // absent row, which is why these replace one.
  //
  // Scope is strictly derived data. The override tables below are calculation inputs and are never
  // touched here.
  // ---------------------------------------------------------------------------

  reconcileTaxLots(lots: LedgerTaxLot[]): Promise<ReconciliationSummary>;
  reconcileLotHistoryEvents(events: LedgerTaxLotEvent[]): Promise<ReconciliationSummary>;
  reconcileCustodyEntries(entries: LedgerCustodyEntry[]): Promise<ReconciliationSummary>;

  getCustodyEntries(accountId?: string): Promise<LedgerCustodyEntry[]>;

  // ---------------------------------------------------------------------------
  // User-authored overrides — calculation inputs, exempt from reconciliation
  // ---------------------------------------------------------------------------

  getManualPriceOverrides(): Promise<LedgerManualPriceOverride[]>;
  setManualPriceOverride(override: LedgerManualPriceOverride): Promise<void>;
  removeManualPriceOverride(idHash: string): Promise<void>;

  getTransferDestinationOverrides(): Promise<LedgerTransferDestinationOverride[]>;
  setTransferDestinationOverride(override: LedgerTransferDestinationOverride): Promise<void>;
  removeTransferDestinationOverride(idHash: string): Promise<void>;

  // FK pre-resolution
  getAccounts(): Promise<
    {
      id: string;
      name: string;
      type: string;
      parentAccountId?: string | null;
      isSynthetic: boolean;
    }[]
  >;
  ensureAssetExists(input: EnsureAssetInput): Promise<void>;
  /** Returns the resolved account id, which may be a child account derived from `wallet`. */
  ensureAccountExists(input: EnsureAccountInput): Promise<string>;

  /**
   * Returns all unique (assetId, symbol) pairs that are currently tracked
   * in the ledger (i.e. appear in the assets table).
   * Used by IngestDailyPricesUseCase to discover which assets need price ingestion.
   */
  getTrackedAssets(): Promise<{ assetId: string; symbol: string }[]>;
}
