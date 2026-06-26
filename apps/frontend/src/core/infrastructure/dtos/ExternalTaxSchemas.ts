/**
 * External Tax Zod Schemas — Anti-Corruption Layer for tax/fiscal API responses.
 *
 * Handles the complex legacy API shape from the crypto backend:
 *   - Resolves BUY/SELL/DEPOSIT/etc. type-based symbol/amount mapping
 *     (the "asset_in vs asset_out" conditional logic is isolated here)
 *   - Coerces string numbers to native numbers
 *   - Parses "YYYY-MM-DD HH:MM:SS" strings and Unix timestamps to Date objects
 *   - Maps snake_case AEAT field names to camelCase domain entities
 *
 * This schema eliminates ALL conditional logic from Pinia stores and Vue components.
 *
 * @see openspec/specs/fiscal-domain/spec.md
 */

import { z } from "zod";
import type {
  TaxTransactionType,
  TaxLotHistoryEvent,
  TaxLotEntity,
} from "@/core/domain/models/FiscalEntities";
import { LotIdSchema } from "@/core/infrastructure/dtos/BrandedTypeSchemas";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Coerces any numeric-like value to a number, with 0 as fallback */
const numericField = z.preprocess((val) => {
  if (val === null || val === undefined) return 0;
  const n =
    typeof val === "string"
      ? parseFloat(val.replace(/[^0-9.-]/g, ""))
      : Number(val);
  return isNaN(n) ? 0 : n;
}, z.number());

/**
 * Normalizes various timestamp formats to a native Date object.
 * Handles:
 *   - "YYYY-MM-DD HH:MM:SS" (backend legacy format)
 *   - ISO 8601 strings
 *   - Unix timestamps in seconds (number)
 *   - Unix timestamps in milliseconds (number > 1e10)
 */
const timestampToDate = z.preprocess((val) => {
  if (val instanceof Date) return val;

  if (typeof val === "number") {
    // Heuristic: if the number is smaller than 1e10 it's in seconds
    const ms = val < 1e10 ? val * 1000 : val;
    return new Date(ms);
  }

  if (typeof val === "string") {
    // Replace space separator with 'T' for ISO compatibility, assume UTC
    let normalized = val.replace(" ", "T");
    if (!normalized.endsWith("Z") && !normalized.includes("+")) {
      normalized += "Z";
    }
    return new Date(normalized);
  }

  return new Date(0); // Safe fallback
}, z.date());

// ---------------------------------------------------------------------------
// ExternalTaxTransactionSchema
//
// THE CORE TRANSFORMATION: resolves symbol/amount/totalEur based on tx_type.
// This replaces all conditional logic previously scattered in taxStore.js.
// ---------------------------------------------------------------------------

const KNOWN_TYPES = [
  "BUY",
  "SELL",
  "DEPOSIT",
  "WITHDRAWAL",
  "FEE",
  "TRANSFER_IN",
  "TRANSFER_OUT",
  "AIRDROP",
  "REWARD",
  "SWAP",
  "MIGRATION_SWAP",
  "STAKING",
  "MINING",
  "SPEND",
] as const;

export const ExternalTaxTransactionSchema = z
  .object({
    id: z.string().min(1).optional(),
    tx_id: z.string().min(1).optional(),
    type: z.string().optional(),
    tx_type: z.string().optional(),
    asset_in_id: z.string().optional(),
    asset_out_id: z.string().optional(),
    symbol: z.string().optional(),
    amount_in: numericField.optional(),
    amount_out: numericField.optional(),
    price_eur: numericField.optional(),
    fee_eur: numericField.optional(),
    total_eur: numericField.optional(),
    timestamp: timestampToDate,
    exchange: z.string().optional(),
    account_id: z.string().optional(),
    ref_id: z.string().optional(),
  })
  .transform((raw) => {
    // Normalize the transaction type
    const rawTypeStr = String(
      raw.type || raw.tx_type || "UNKNOWN",
    ).toUpperCase();
    const type: TaxTransactionType = KNOWN_TYPES.includes(
      rawTypeStr as (typeof KNOWN_TYPES)[number],
    )
      ? (rawTypeStr as TaxTransactionType)
      : "UNKNOWN";

    // -----------------------------------------------------------------------
    // Symbol / Amount / TotalEur resolution — the "magic" mapping
    // All the if/else from taxStore.js, now in one clean, tested place.
    // -----------------------------------------------------------------------
    const rawAssetIn = raw.asset_in_id;
    const rawAssetOut = raw.asset_out_id;

    let symbol = raw.symbol ?? "";
    let amount = 0;
    let totalEur = raw.total_eur ?? 0;

    switch (type) {
      case "BUY":
        // BUY BTC with EUR: asset_in=BTC, amount_in=qty, asset_out=EUR, amount_out=cost
        symbol = rawAssetIn ?? "";
        amount = raw.amount_in ?? 0;
        totalEur = raw.amount_out ?? totalEur; // EUR cost (what we paid)
        break;

      case "SELL":
        // SELL BTC for EUR: asset_out=BTC, amount_out=qty, asset_in=EUR, amount_in=proceeds
        symbol = rawAssetOut ?? "";
        amount = raw.amount_out ?? 0;
        totalEur = raw.amount_in ?? totalEur; // EUR received (proceeds)
        break;

      case "DEPOSIT":
      case "AIRDROP":
      case "REWARD":
      case "TRANSFER_IN":
        symbol = rawAssetIn ?? "";
        amount = raw.amount_in ?? 0;
        totalEur = 0;
        break;

      case "WITHDRAWAL":
      case "FEE":
      case "TRANSFER_OUT":
        symbol = rawAssetOut ?? "";
        amount = raw.amount_out ?? 0;
        totalEur = 0;
        break;

      case "SWAP":
      case "MIGRATION_SWAP":
        // Keep both sides for swap visibility; symbol is the outgoing asset
        symbol = rawAssetOut ?? rawAssetIn ?? "";
        amount = raw.amount_out ?? raw.amount_in ?? 0;
        totalEur = raw.total_eur ?? 0;
        break;

      default:
        // For futures and unknown types, prefer the explicit symbol if it exists
        symbol = raw.symbol ?? rawAssetIn ?? rawAssetOut ?? "";
        amount = raw.amount_in ?? raw.amount_out ?? 0;
    }

    return {
      id: raw.id || raw.tx_id || "unknown_id",
      type,
      symbol,
      amount,
      totalEur,
      priceEur: raw.price_eur ?? 0,
      feeEur: raw.fee_eur ?? 0,
      timestamp: raw.timestamp,
      // Preserve raw swap fields for full traceability
      assetIn: rawAssetIn,
      assetOut: rawAssetOut,
      amountIn: raw.amount_in,
      amountOut: raw.amount_out,
      exchange: raw.exchange || raw.account_id,
      refId: raw.ref_id,
    };
  });

export type ExternalTaxTransactionDTO = z.infer<
  typeof ExternalTaxTransactionSchema
>;

// ---------------------------------------------------------------------------
// ExternalTaxReportSummarySchema — AEAT IRPF aggregate figures
// ---------------------------------------------------------------------------

const ExternalTaxReportSummarySchema = z
  .object({
    capital_gains_eur: numericField.optional(),
    capital_losses_eur: numericField.optional(),
    savings_base_yields_eur: numericField.optional(),
    general_base_airdrops_eur: numericField.optional(),
    net_patrimonial_result_eur: numericField.optional(),
    estimated_irpf_eur: numericField.optional(),
  })
  .transform((raw) => ({
    capitalGainsEur: raw.capital_gains_eur ?? 0,
    capitalLossesEur: raw.capital_losses_eur ?? 0,
    savingsBaseYieldsEur: raw.savings_base_yields_eur ?? 0,
    generalBaseAirdropsEur: raw.general_base_airdrops_eur ?? 0,
    netPatrimonialResultEur: raw.net_patrimonial_result_eur ?? 0,
    estimatedIrpfEur: raw.estimated_irpf_eur ?? 0,
  }));

// ---------------------------------------------------------------------------
// ExternalTaxLotHistorySchema — typed audit trail entry
//
// Maps the raw API audit trail shape (snake_case, UNIX timestamps) to
// TaxLotHistoryEvent domain entities (camelCase, native Date objects).
// Must be defined before ExternalTaxReportSchema which references it.
// ---------------------------------------------------------------------------

export const ExternalTaxLotHistorySchema = z
  .object({
    id: z.string().min(1),
    disposal_date: timestampToDate,
    amount_from_lot: numericField,
    sale_price_eur: numericField,
    gain_loss_eur: numericField,
    sale_fee_eur: numericField.optional(),
    is_taxable: z.boolean().default(false),
    flag: z.enum(["WALLET_ACTIVATION"]).nullable().optional(),
    notes: z.string().optional(),
    asset_symbol: z.string().optional(),
    asset_logo_uri: z.string().optional(),
    exchange_name: z.string().optional(),
    exchange_logo_uri: z.string().optional(),
    operation_type: z.string().optional(),
  })
  .transform((raw): TaxLotHistoryEvent => {
    const rawOpType = String(raw.operation_type || "UNKNOWN").toUpperCase();
    const opType = KNOWN_TYPES.includes(
      rawOpType as (typeof KNOWN_TYPES)[number],
    )
      ? (rawOpType as TaxTransactionType)
      : "UNKNOWN";

    return {
      id: raw.id,
      disposalDate: raw.disposal_date,
      amountFromLot: raw.amount_from_lot,
      salePriceEur: raw.sale_price_eur,
      gainLossEur: raw.gain_loss_eur,
      saleFeeEur: raw.sale_fee_eur,
      isTaxable: raw.is_taxable,
      flag: raw.flag ?? null,
      notes: raw.notes,
      assetSymbol: raw.asset_symbol,
      assetLogoUri: raw.asset_logo_uri,
      exchangeName: raw.exchange_name,
      exchangeLogoUri: raw.exchange_logo_uri,
      operationType: opType,
    };
  });

// ---------------------------------------------------------------------------
// ExternalTaxLotSchema — typed FIFO tax lot
// ---------------------------------------------------------------------------

export const ExternalTaxLotSchema = z
  .object({
    id: z.any().transform((val) => LotIdSchema.parse(String(val))),
    symbol: z.string().optional().default(""),
    date: timestampToDate,
    exchange: z.string().optional().default(""),
    original_qty: numericField,
    remaining_qty: numericField,
    unit_cost: numericField,
    total_cost: numericField,
    status: z.enum(["FULL", "PARTIAL", "EMPTY"]).optional(),
  })
  .transform(
    (raw): TaxLotEntity => ({
      id: raw.id,
      symbol: raw.symbol,
      date: raw.date,
      exchange: raw.exchange,
      originalQty: raw.original_qty,
      remainingQty: raw.remaining_qty,
      unitCost: raw.unit_cost,
      totalCost: raw.total_cost,
      status: raw.status,
    }),
  );

// ---------------------------------------------------------------------------
// ExternalTokenHistorySchema — mapped response for token history API
// ---------------------------------------------------------------------------

export const ExternalTokenHistorySchema = z
  .object({
    lots: z.array(ExternalTaxLotSchema).optional().default([]),
    history: z
      .record(z.string(), z.array(ExternalTaxLotHistorySchema))
      .optional()
      .default({}),
  })
  .transform((raw) => ({
    lots: raw.lots,
    history: raw.history,
  }));

// ---------------------------------------------------------------------------
// ExternalTaxReportSchema — full tax report for a fiscal year
// ---------------------------------------------------------------------------

export const ExternalTaxReportSchema = z
  .object({
    year: z.number().int().min(2000).max(2100),
    method: z.string().default("FIFO"),
    summary: ExternalTaxReportSummarySchema,
    audit_trail: z.array(ExternalTaxLotHistorySchema).optional().default([]),
  })
  .transform((raw) => ({
    year: raw.year,
    method: raw.method,
    summary: raw.summary,
    auditTrail: raw.audit_trail,
  }));

export type ExternalTaxReportDTO = z.infer<typeof ExternalTaxReportSchema>;
