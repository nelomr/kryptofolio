import { z } from "zod";
import { preciseAmountSchema, nonNegativePreciseAmountSchema } from "./transactions.js";
import {
  DISPOSAL_TYPES,
  FIFO_QUALITY_FLAGS,
  FISCAL_CLASSIFICATION_FLAGS,
  MANUAL_VALUE_PROVENANCE,
} from "./fifo-policy.js";
import { SPOT_TX_TYPES, type SpotTxType } from './spot-tx-types.js';

// ---------------------------------------------------------------------------
// Canonical Enums — Single Source of Truth for all tx_type values.
// These MUST match the SQL CHECK constraints in 002_ledger_schema.sql exactly.
// ---------------------------------------------------------------------------

export { SPOT_TX_TYPES, type SpotTxType };

export const FUTURES_TX_TYPES = [
  'TRADE',
  'FUNDING_FEE',
  'SETTLEMENT',
  'LIQUIDATION',
] as const;

export type FuturesTxType = typeof FUTURES_TX_TYPES[number];

export const TAX_LOT_STATUSES = ['OPEN', 'PARTIAL', 'CLOSED'] as const;
export type TaxLotStatus = typeof TAX_LOT_STATUSES[number];

// ---------------------------------------------------------------------------
// Zod Schemas — Aligned with canonical enums & SQL schema
// ---------------------------------------------------------------------------

export const SpotTransactionSchema = z.object({
  tx_id: z.string().optional(),
  account_id: z.string().uuid('account_id must be a valid UUID'),
  timestamp: z.string().datetime(),
  tx_type: z.enum(SPOT_TX_TYPES),
  asset_in_id: z.string().optional(),
  amount_in: preciseAmountSchema.optional(),
  asset_out_id: z.string().optional(),
  amount_out: preciseAmountSchema.optional(),
  fee_asset_id: z.string().optional(),
  fee_amount: preciseAmountSchema.optional(),
  /**
   * `null` when the source stated neither a total nor a price and no market price could be
   * resolved either — genuinely unknown. A source-stated `0` (a promotional credit, a free
   * acquisition) is a fact and stays `0`; only its absence becomes `null`. Same distinction as
   * `fee_amount`, one layer down.
   */
  total_fiat: nonNegativePreciseAmountSchema.nullable(),
  price_fiat: nonNegativePreciseAmountSchema.nullable(),
  /** ISO-4217 currency code — required. Resolution: CSV field → base_currency setting → 'USD'. */
  fiat_currency: z.string().min(3).max(3),
  exchange: z.string().optional(),
  status: z.string().default('COMPLETED'),
}).refine(
  (d) => (d.amount_in === undefined) === (d.asset_in_id === undefined),
  { message: 'amount_in and asset_in_id must both be present or both absent' }
).refine(
  (d) => (d.amount_out === undefined) === (d.asset_out_id === undefined),
  { message: 'amount_out and asset_out_id must both be present or both absent' }
).refine(
  (d) => (d.fee_amount === undefined) === (d.fee_asset_id === undefined),
  { message: 'fee_amount and fee_asset_id must both be present or both absent' }
);

export const FuturesTransactionSchema = z.object({
  tx_id: z.string().optional(),
  account_id: z.string().uuid('account_id must be a valid UUID'),
  timestamp: z.string().datetime(),
  tx_type: z.enum(FUTURES_TX_TYPES),
  symbol: z.string().min(1),
  amount: preciseAmountSchema.optional(),
  trade_price: preciseAmountSchema.optional(),
  realized_pnl: preciseAmountSchema.optional(),
  settlement_asset_id: z.string().optional(),
  funding_amount: preciseAmountSchema.optional(),
  fee_asset_id: z.string().optional(),
  fee_amount: preciseAmountSchema.optional(),
  /** ISO-4217 currency code — required. Resolution: CSV field → base_currency setting → 'USD'. */
  fiat_currency: z.string().min(3).max(3),
  exchange: z.string().optional(),
  status: z.string().default('COMPLETED'),
});

export const TaxLotSchema = z.object({
  id: z.string().uuid().optional(),
  spot_transaction_id: z.string(),
  asset_id: z.string(),
  /** Resolved asset symbol (e.g. 'BTC') — populated by v_calculated_tax_lots JOIN */
  symbol: z.string().optional(),
  account_id: z.string(),
  original_qty: preciseAmountSchema,
  remaining_qty: preciseAmountSchema,
  unit_cost_fiat: nonNegativePreciseAmountSchema,
  total_cost_fiat: nonNegativePreciseAmountSchema,
  /** ISO-4217 currency code — required (no default). SQL DEFAULT 'USD' is a safety net only. */
  fiat_currency: z.string(),
  acquisition_timestamp: z.string().datetime(),
  exchange_location: z.string(),
  source_tx_id: z.string().optional(),
  status: z.enum(TAX_LOT_STATUSES),
  /** Data-quality defect on this lot's basis, if any. Suppresses gains rather than blocking. */
  quality_flag: z.enum(FIFO_QUALITY_FLAGS).nullable().optional(),
  /** Whether the cost basis was observed from market data or declared by the user. */
  value_provenance: z.enum(MANUAL_VALUE_PROVENANCE).optional(),
});

// ---------------------------------------------------------------------------
// Custody & override schemas
// ---------------------------------------------------------------------------

/**
 * One leg of a double-entry custody movement.
 *
 * `qty_delta` is intentionally SIGNED — negative for an outflow, positive for an inflow — unlike
 * the fiat magnitude columns, which are non-negative by construction. The entries for a single
 * movement always sum to zero for a given asset, which is what removes the need for any
 * time-window or amount-matching heuristic.
 */
export const LotCustodyEntrySchema = z.object({
  id: z.string(),
  tax_lot_id: z.string(),
  asset_id: z.string(),
  account_id: z.string(),
  qty_delta: preciseAmountSchema,
  occurred_at: z.string().datetime(),
  spot_transaction_id: z.string(),
});

/**
 * A user-declared fiat value for a transaction whose market price could not be resolved.
 *
 * Keyed by `id_hash`, the deterministic transaction identity, so the override survives
 * re-ingestion of the same source file. This is a calculation INPUT: reconciliation never writes
 * or deletes it.
 */
export const ManualPriceOverrideSchema = z.object({
  id_hash: z.string(),
  price_fiat: nonNegativePreciseAmountSchema,
  /** Required: a declared value without its currency is not interpretable. */
  fiat_currency: z.string().min(3).max(3),
  note: z.string().optional(),
});

/**
 * A user-declared counterparty for a custody movement, replacing the synthetic
 * `ownwallet-<ASSET>` account with a real one. Also a calculation INPUT.
 */
export const TransferDestinationOverrideSchema = z.object({
  id_hash: z.string(),
  counterparty_account_id: z.string(),
  note: z.string().optional(),
});

export const TaxLotEventSchema = z.object({
  id: z.string().uuid().optional(),
  tax_lot_id: z.string(),
  spot_transaction_id: z.string(),
  account_id: z.string(),
  disposal_date: z.string().datetime(),
  amount_from_lot: nonNegativePreciseAmountSchema,
  /**
   * Fiat proceeds per unit. Nullable: when no historical price can be resolved the value is
   * UNKNOWN, and must propagate as null rather than being coerced to 0 (which the engine would
   * otherwise read as a genuine sale at zero) or to 1.0.
   */
  sale_price_fiat: nonNegativePreciseAmountSchema.nullable(),
  /** Null whenever `sale_price_fiat` is null — a gain cannot be computed from an unknown price. */
  gain_loss_fiat: preciseAmountSchema.nullable(),
  /** ISO-4217 currency code — required (no default). SQL DEFAULT 'USD' is a safety net only. */
  fiat_currency: z.string(),
  is_taxable: z.union([z.boolean(), z.number()]).transform(val => Boolean(val)),
  /** Why the lot was consumed. Never assumed — a fee disposal is not a sale. */
  disposal_type: z.enum(DISPOSAL_TYPES),
  /**
   * Fiscal classification of the operation ("what kind of event is this").
   * Live and load-bearing: `WALLET_ACTIVATION` drives the AEAT audit trail.
   */
  flag: z.enum(FISCAL_CLASSIFICATION_FLAGS).nullable().optional(),
  /**
   * Data-quality defect ("what is wrong with this row's numbers"). A separate column from `flag`
   * because the two co-occur — a wallet activation with an unresolvable price carries one value
   * from each vocabulary, and merging them would force a lossy precedence rule.
   */
  quality_flag: z.enum(FIFO_QUALITY_FLAGS).nullable().optional(),
  /** Whether the monetary value was observed from market data or declared by the user. */
  value_provenance: z.enum(MANUAL_VALUE_PROVENANCE).optional(),
  notes: z.string().optional(),
  /** Resolved asset ticker symbol (e.g. 'BTC') — populated by v_calculated_lot_history_events JOIN */
  asset_symbol: z.string().optional(),
  /** Resolved exchange/account name (e.g. 'Binance') — populated by v_calculated_lot_history_events JOIN */
  exchange_name: z.string().optional(),
});

// TypeScript types inferred from schemas
export type SpotTransactionType = z.infer<typeof SpotTransactionSchema>;
export type FuturesTransactionType = z.infer<typeof FuturesTransactionSchema>;
export type TaxLotType = z.infer<typeof TaxLotSchema>;
export type TaxLotEventType = z.infer<typeof TaxLotEventSchema>;

// ---------------------------------------------------------------------------
// Branded Types — Strong nominal typing for all entity identifiers.
// Use the factory functions below to safely create branded values.
// ---------------------------------------------------------------------------

export type TransactionId = string & { readonly __brand: 'TransactionId' };
export type FuturesTransactionId = string & { readonly __brand: 'FuturesTransactionId' };
export type TaxLotId = string & { readonly __brand: 'TaxLotId' };
export type AccountId = string & { readonly __brand: 'AccountId' };
export type AssetId = string & { readonly __brand: 'AssetId' };
export type LotHistoryEventId = string & { readonly __brand: 'LotHistoryEventId' };

/**
 * The deterministic identity of a transaction, derived from the source row's own content.
 *
 * Distinct from `TransactionId`, which is the ledger's surrogate key: a re-ingestion of the same
 * file produces a new `TransactionId` and the same `TransactionIdHash`, which is why user-authored
 * overrides key on this one.
 */
export type TransactionIdHash = string & { readonly __brand: 'TransactionIdHash' };

/** Create a strongly-typed TransactionId from a raw string */
export function createTransactionId(id: string): TransactionId {
  if (!id || typeof id !== 'string') throw new Error(`Invalid TransactionId: "${id}"`);
  return id as TransactionId;
}

/** Create a strongly-typed FuturesTransactionId from a raw string */
export function createFuturesTransactionId(id: string): FuturesTransactionId {
  if (!id || typeof id !== 'string') throw new Error(`Invalid FuturesTransactionId: "${id}"`);
  return id as FuturesTransactionId;
}

/** Create a strongly-typed TaxLotId from a raw string */
export function createTaxLotId(id: string): TaxLotId {
  if (!id || typeof id !== 'string') throw new Error(`Invalid TaxLotId: "${id}"`);
  return id as TaxLotId;
}

/** Create a strongly-typed TransactionIdHash from a raw string */
export function createTransactionIdHash(idHash: string): TransactionIdHash {
  if (!idHash || typeof idHash !== 'string') throw new Error(`Invalid TransactionIdHash: "${idHash}"`);
  return idHash as TransactionIdHash;
}

/** Create a strongly-typed AccountId from a raw string */
export function createAccountId(id: string): AccountId {
  if (!id || typeof id !== 'string') throw new Error(`Invalid AccountId: "${id}"`);
  return id as AccountId;
}

/** Create a strongly-typed AssetId from a raw string */
export function createAssetId(id: string): AssetId {
  if (!id || typeof id !== 'string') throw new Error(`Invalid AssetId: "${id}"`);
  return id as AssetId;
}
