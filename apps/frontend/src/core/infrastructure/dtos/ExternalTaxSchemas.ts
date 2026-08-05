/**
 * External Tax Zod Schemas — Anti-Corruption Layer for tax/fiscal API responses.
 *
 * Handles the tax/fiscal API response shape:
 *   - Resolves BUY/SELL/DEPOSIT/etc. type-based symbol/amount mapping
 *     (the "asset_in vs asset_out" conditional logic is isolated here)
 *   - Uses CommonSchemaHelpers for numeric and timestamp coercion
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
  LotCustodyLocation,
  LotRelocationEntity,
} from "@/core/domain/models/FiscalEntities";
import {
  TAX_LOT_STATUSES,
  DISPOSAL_TYPES,
  FIFO_QUALITY_FLAGS,
  FISCAL_CLASSIFICATION_FLAGS,
  MANUAL_VALUE_PROVENANCE,
} from "@kryptofolio/shared-types";
import { LotIdSchema, AccountIdSchema } from "@/core/infrastructure/dtos/BrandedTypeSchemas";
import { numericField, nullableNumericField, timestampToDate } from "./CommonSchemaHelpers";

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
    asset_in_symbol: z.string().optional(),
    asset_out_id: z.string().optional(),
    asset_out_symbol: z.string().optional(),
    symbol: z.string().optional(),
    amount_in: numericField.optional(),
    amount_out: numericField.optional(),
    price_fiat: numericField.optional(),
    price_eur: numericField.optional(),
    fee_fiat: numericField.optional(),
    fee_eur: numericField.optional(),
    total_fiat: numericField.optional(),
    total_eur: numericField.optional(),
    fiat_currency: z.string().optional(),
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

    const rawAssetIn = raw.asset_in_symbol || raw.asset_in_id;
    const rawAssetOut = raw.asset_out_symbol || raw.asset_out_id;

    let symbol = raw.symbol ?? "";
    let amount = 0;
    let totalEur = raw.total_fiat ?? raw.total_eur ?? 0;

    switch (type) {
      case "BUY":
        symbol = rawAssetIn ?? "";
        amount = raw.amount_in ?? 0;
        totalEur = raw.amount_out ?? totalEur;
        break;

      case "SELL":
        symbol = rawAssetOut ?? "";
        amount = raw.amount_out ?? 0;
        totalEur = raw.amount_in ?? totalEur;
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
        symbol = rawAssetOut ?? rawAssetIn ?? "";
        amount = raw.amount_out ?? raw.amount_in ?? 0;
        totalEur = raw.total_fiat ?? raw.total_eur ?? 0;
        break;

      default:
        symbol = raw.symbol ?? rawAssetIn ?? rawAssetOut ?? "";
        amount = raw.amount_in ?? raw.amount_out ?? 0;
    }

    return {
      id: raw.id || raw.tx_id || "unknown_id",
      type,
      symbol,
      amount,
      totalEur,
      priceEur: raw.price_fiat ?? raw.price_eur ?? 0,
      feeEur: raw.fee_fiat ?? raw.fee_eur ?? 0,
      timestamp: raw.timestamp,
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
    capitalGainsFiat: numericField.optional(),
    capital_gains_eur: numericField.optional(),
    spotCapitalGains: numericField.optional(),
    spot_capital_gains: numericField.optional(),
    capitalLossesFiat: numericField.optional(),
    capital_losses_eur: numericField.optional(),
    savingsBaseYieldsFiat: numericField.optional(),
    savings_base_yields_eur: numericField.optional(),
    savingsBaseYields: numericField.optional(),
    savings_base_yields: numericField.optional(),
    generalBaseAirdropsFiat: numericField.optional(),
    general_base_airdrops_eur: numericField.optional(),
    generalBaseAirdrops: numericField.optional(),
    general_base_airdrops: numericField.optional(),
    netPatrimonialResultFiat: numericField.optional(),
    net_patrimonial_result_eur: numericField.optional(),
    estimatedIrpfFiat: numericField.optional(),
    estimated_irpf_eur: numericField.optional(),
  })
  .transform((raw) => ({
    capitalGainsEur: raw.capitalGainsFiat ?? raw.capital_gains_eur ?? raw.spotCapitalGains ?? raw.spot_capital_gains ?? 0,
    capitalLossesEur: raw.capitalLossesFiat ?? raw.capital_losses_eur ?? 0,
    savingsBaseYieldsEur: raw.savingsBaseYieldsFiat ?? raw.savings_base_yields_eur ?? raw.savingsBaseYields ?? raw.savings_base_yields ?? 0,
    generalBaseAirdropsEur: raw.generalBaseAirdropsFiat ?? raw.general_base_airdrops_eur ?? raw.generalBaseAirdrops ?? raw.general_base_airdrops ?? 0,
    netPatrimonialResultEur: raw.netPatrimonialResultFiat ?? raw.net_patrimonial_result_eur ?? 0,
    estimatedIrpfEur: raw.estimatedIrpfFiat ?? raw.estimated_irpf_eur ?? 0,
  }));

// ---------------------------------------------------------------------------
// ExternalTaxLotHistorySchema — typed audit trail entry
// ---------------------------------------------------------------------------

// Named separately from the transformed export so a contract test can enumerate the wire keys
// this layer actually declares, without reaching into ZodEffects internals.
export const ExternalTaxLotHistoryShape = z.object({
    id: z.string().min(1),
    disposal_date: timestampToDate,
    amount_from_lot: numericField,
    // Null when the backend could not resolve a price. Coercing to 0 here would read
    // downstream as a genuine disposal at zero — the fabrication this change removes.
    sale_price_eur: nullableNumericField,
    gain_loss_eur: nullableNumericField,
    sale_fee_eur: numericField.optional(),
    is_taxable: z.boolean().default(false),
    // Fiscal classification — orthogonal to quality_flag below, both may be present at once.
    flag: z.enum(FISCAL_CLASSIFICATION_FLAGS).nullable().optional(),
    // Data-quality defect on this event's own valuation, if any.
    quality_flag: z.enum(FIFO_QUALITY_FLAGS).nullable().optional(),
    value_provenance: z.enum(MANUAL_VALUE_PROVENANCE).optional(),
    notes: z.string().optional(),
    asset_symbol: z.string().optional(),
    asset_logo_uri: z.string().optional(),
    exchange_name: z.string().optional(),
    exchange_logo_uri: z.string().optional(),
    // Why the lot was consumed (SELL/SWAP/FEE/SPEND). The wire name is "operation_type"
    // (TokenLotHistoryEventDto.operation_type in GetTokenHistoryUseCase) — its meaning changed
    // from a hardcoded 'SELL' to the real disposal type, but the field was never renamed.
    // Required, and constrained to the canonical vocabulary: the backend always sends one.
    operation_type: z.enum(DISPOSAL_TYPES),
});

export const ExternalTaxLotHistorySchema = ExternalTaxLotHistoryShape
  .transform((raw): TaxLotHistoryEvent => {
    // operation_type is already validated against DISPOSAL_TYPES above — a subset of
    // KNOWN_TYPES — so this always resolves; kept as a cast rather than a re-check.
    const opType = raw.operation_type as TaxTransactionType;

    return {
      id: raw.id,
      disposalDate: raw.disposal_date,
      amountFromLot: raw.amount_from_lot,
      salePriceEur: raw.sale_price_eur,
      gainLossEur: raw.gain_loss_eur,
      saleFeeEur: raw.sale_fee_eur,
      isTaxable: raw.is_taxable,
      disposalType: raw.operation_type,
      flag: raw.flag ?? null,
      qualityFlag: raw.quality_flag ?? null,
      valueProvenance: raw.value_provenance,
      notes: raw.notes,
      assetSymbol: raw.asset_symbol,
      assetLogoUri: raw.asset_logo_uri,
      exchangeName: raw.exchange_name,
      exchangeLogoUri: raw.exchange_logo_uri,
      operationType: opType,
    };
  });

// ---------------------------------------------------------------------------
// ExternalLotCustodyLocationSchema — where a lot's quantity currently sits
// ---------------------------------------------------------------------------

const ExternalLotCustodyLocationSchema = z
  .object({
    account_id: z.string().min(1).transform((val) => AccountIdSchema.parse(val)),
    account_name: z.string(),
    is_synthetic: z.boolean(),
    parent_account_id: z
      .string()
      .nullable()
      .transform((val) => (val === null ? null : AccountIdSchema.parse(val))),
    qty: numericField,
  })
  .transform(
    (raw): LotCustodyLocation => ({
      accountId: raw.account_id,
      accountName: raw.account_name,
      isSynthetic: raw.is_synthetic,
      parentAccountId: raw.parent_account_id,
      qty: raw.qty,
    }),
  );

// ---------------------------------------------------------------------------
// ExternalLotRelocationSchema — one custody movement of a lot (Level 3)
// ---------------------------------------------------------------------------

// No price, gain or taxability key is declared, and none may be added: a movement between the
// user's own accounts realises nothing, so there is no figure for this boundary to carry.
const ExternalLotRelocationSchema = z
  .object({
    id: z.string().min(1),
    occurred_at: timestampToDate,
    qty: numericField,
    from_account_id: z.string().min(1).transform((val) => AccountIdSchema.parse(val)),
    from_account_name: z.string(),
    from_is_synthetic: z.boolean(),
    to_account_id: z.string().min(1).transform((val) => AccountIdSchema.parse(val)),
    to_account_name: z.string(),
    to_is_synthetic: z.boolean(),
  })
  .transform(
    (raw): LotRelocationEntity => ({
      id: raw.id,
      occurredAt: raw.occurred_at,
      qty: raw.qty,
      fromAccountId: raw.from_account_id,
      fromAccountName: raw.from_account_name,
      fromIsSynthetic: raw.from_is_synthetic,
      toAccountId: raw.to_account_id,
      toAccountName: raw.to_account_name,
      toIsSynthetic: raw.to_is_synthetic,
    }),
  );

// ---------------------------------------------------------------------------
// ExternalTaxLotSchema — typed FIFO tax lot
// ---------------------------------------------------------------------------

// Named separately from the transformed export so a contract test can enumerate the wire keys
// this layer actually declares, without reaching into ZodEffects internals.
export const ExternalTaxLotShape = z.object({
    id: z.unknown().transform((val) => LotIdSchema.parse(String(val))),
    symbol: z.string().optional().default(""),
    date: timestampToDate,
    exchange: z.string().optional().default(""),
    original_qty: numericField,
    remaining_qty: numericField,
    unit_cost: numericField,
    total_cost: numericField,
    // Canonical OPEN|PARTIAL|CLOSED, passed through unchanged from the calculation engine.
    // Required: a lot with no status is not a valid lot.
    status: z.enum(TAX_LOT_STATUSES),
    // Defect on the lot's own basis. Required to read unit_cost at all: the view forces the figure
    // to 0 whenever this is set, so the two must be consumed together.
    quality_flag: z.enum(FIFO_QUALITY_FLAGS).nullable().optional(),
    value_provenance: z.enum(MANUAL_VALUE_PROVENANCE).optional(),
    // Wire name is "custody" (TokenLotDto.custody in GetTokenHistoryUseCase) — the domain field
    // is named currentLocations to read clearly at the call site, but the two must not drift.
    custody: z.array(ExternalLotCustodyLocationSchema).optional().default([]),
});

export const ExternalTaxLotSchema = ExternalTaxLotShape
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
      qualityFlag: raw.quality_flag ?? null,
      valueProvenance: raw.value_provenance,
      currentLocations: raw.custody,
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
    relocations: z
      .record(z.string(), z.array(ExternalLotRelocationSchema))
      .optional()
      .default({}),
  })
  .transform((raw) => ({
    lots: raw.lots,
    history: raw.history,
    relocations: raw.relocations,
  }));

// ---------------------------------------------------------------------------
// ExternalTaxReportSchema — full tax report for a fiscal year
// ---------------------------------------------------------------------------

export const ExternalTaxReportSchema = z
  .object({
    year: z.number().int().min(2000).max(2100),
    method: z.string().default("FIFO"),
    spotCapitalGains: numericField.optional(),
    savingsBaseYields: numericField.optional(),
    generalBaseAirdrops: numericField.optional(),
    summary: ExternalTaxReportSummarySchema.optional(),
    audit_trail: z.array(ExternalTaxLotHistorySchema).optional().default([]),
    // Excluded from the totals above rather than folded into them, so an incomplete base is never
    // presented as complete. Two counts because a disposal-side defect and an unpriced income row
    // are different failures with different remedies.
    excludedFlaggedEvents: z.number().int().optional().default(0),
    excludedUnresolvedIncomeCount: z.number().int().optional().default(0),
  })
  .transform((raw) => {
    const spotGains = raw.spotCapitalGains ?? 0;
    const gainsNum = Number(spotGains);

    const summary = raw.summary ?? {
      capitalGainsEur: gainsNum > 0 ? gainsNum : 0,
      capitalLossesEur: gainsNum < 0 ? Math.abs(gainsNum) : 0,
      savingsBaseYieldsEur: raw.savingsBaseYields ?? 0,
      generalBaseAirdropsEur: raw.generalBaseAirdrops ?? 0,
      netPatrimonialResultEur: gainsNum + (raw.savingsBaseYields ?? 0) + (raw.generalBaseAirdrops ?? 0),
      estimatedIrpfEur: gainsNum > 0 ? gainsNum * 0.19 : 0,
    };

    return {
      year: raw.year,
      method: raw.method,
      summary,
      auditTrail: raw.audit_trail,
      excludedFlaggedEvents: raw.excludedFlaggedEvents,
      excludedUnresolvedIncomeCount: raw.excludedUnresolvedIncomeCount,
    };
  });

export type ExternalTaxReportDTO = z.infer<typeof ExternalTaxReportSchema>;
