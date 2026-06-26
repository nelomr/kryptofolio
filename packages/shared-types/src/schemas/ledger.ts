import { z } from "zod";
import { preciseAmountSchema } from "./transactions";

// ---------------------------------------------------------------------------
// Canonical Enums — Single Source of Truth for all tx_type values.
// These MUST match the SQL CHECK constraints in 002_ledger_schema.sql exactly.
// ---------------------------------------------------------------------------

export const SPOT_TX_TYPES = [
  'BUY',
  'SELL',
  'SWAP',
  'DEPOSIT',
  'WITHDRAWAL',
  'STAKING',
  'AIRDROP',
  'REWARD',
  'MINING',
  'SPEND',
  'FEE',
  'TRANSFER_IN',
  'TRANSFER_OUT',
  'MIGRATION_SWAP',
] as const;

export type SpotTxType = typeof SPOT_TX_TYPES[number];

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
  total_fiat: preciseAmountSchema,
  price_fiat: preciseAmountSchema,
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
  exchange: z.string().optional(),
  status: z.string().default('COMPLETED'),
});

export const TaxLotSchema = z.object({
  id: z.string().uuid().optional(),
  spot_transaction_id: z.string(),
  asset_id: z.string(),
  account_id: z.string(),
  original_qty: preciseAmountSchema,
  remaining_qty: preciseAmountSchema,
  unit_cost_fiat: preciseAmountSchema,
  total_cost_fiat: preciseAmountSchema,
  fiat_currency: z.string().default('EUR'),
  acquisition_timestamp: z.string().datetime(),
  exchange_location: z.string(),
  source_tx_id: z.string().optional(),
  status: z.enum(TAX_LOT_STATUSES),
});

export const TaxLotEventSchema = z.object({
  id: z.string().uuid().optional(),
  tax_lot_id: z.string(),
  spot_transaction_id: z.string(),
  account_id: z.string(),
  disposal_date: z.string().datetime(),
  amount_from_lot: preciseAmountSchema,
  sale_price_fiat: preciseAmountSchema,
  gain_loss_fiat: preciseAmountSchema,
  fiat_currency: z.string().default('EUR'),
  is_taxable: z.union([z.boolean(), z.number()]).transform(val => Boolean(val)),
  flag: z.string().nullable().optional(),
  notes: z.string().optional(),
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
