import { z } from 'zod';
import { AssetIdSchema, LotIdSchema, TransactionIdSchema } from './BrandedTypeSchemas';
import type {
  TaxTransactionType,
  TaxLotEntity,
  TaxLotHistoryEvent,
  FuturesTransactionType,
} from '@/core/domain/models/FiscalEntities';
import {
  TAX_LOT_STATUSES,
  DISPOSAL_TYPES,
  FIFO_QUALITY_FLAGS,
  FISCAL_CLASSIFICATION_FLAGS,
  MANUAL_VALUE_PROVENANCE,
} from '@kryptofolio/shared-types';
import { nullableNumericField } from './CommonSchemaHelpers';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const timestampToDate = z.preprocess((val) => {
  if (val instanceof Date) return val;
  if (typeof val === 'string') return new Date(val);
  if (typeof val === 'number') return new Date(val < 1e10 ? val * 1000 : val);
  return new Date(0);
}, z.date());

const numericField = z.preprocess(
  (val) => {
    if (val === null || val === undefined) return 0;
    const n = typeof val === 'string' ? parseFloat(val.replace(/[^0-9.-]/g, '')) : Number(val);
    return isNaN(n) ? 0 : n;
  },
  z.number(),
)

// ---------------------------------------------------------------------------
// Mock Tax Schemas (camelCase matches MOCK_TAX_REPORT and MOCK_TRANSACTIONS)
// ---------------------------------------------------------------------------

export const MockTaxTransactionSchema = z.object({
  id: TransactionIdSchema,
  type: z.string().transform(val => val as TaxTransactionType),
  symbol: z.string(),
  amount: numericField,
  totalEur: numericField,
  priceEur: numericField,
  feeEur: numericField,
  timestamp: timestampToDate,
  exchange: z.string().optional(),
});

export const MockTaxDerivativeSchema = z.object({
  id: TransactionIdSchema,
  type: z.string().transform(val => val as FuturesTransactionType),
  contractSymbol: z.string(),
  underlyingAsset: z.string(),
  amount: numericField,
  tradePrice: numericField,
  realizedPnl: numericField,
  fees: numericField,
  funding: numericField,
  timestamp: timestampToDate,
  exchange: z.string().optional(),
  refId: z.string().optional(),
  status: z.string().optional(),
});


export const MockTaxReportSummarySchema = z.object({
  capitalGainsEur: numericField,
  capitalLossesEur: numericField,
  savingsBaseYieldsEur: numericField,
  generalBaseAirdropsEur: numericField,
  netPatrimonialResultEur: numericField,
  estimatedIrpfEur: numericField,
});

export const MockTaxLotHistorySchema = z.object({
  id: LotIdSchema,
  disposalDate: timestampToDate,
  amountFromLot: numericField,
  // Nullable, matching the real schema — a mock representing an unresolved price must be able to
  // say so, or it is not a substitute for what the real adapter can send.
  salePriceEur: nullableNumericField,
  gainLossEur: nullableNumericField,
  saleFeeEur: numericField.optional(),
  isTaxable: z.boolean().default(false),
  flag: z.enum(FISCAL_CLASSIFICATION_FLAGS).nullable().optional(),
  qualityFlag: z.enum(FIFO_QUALITY_FLAGS).nullable().optional(),
  valueProvenance: z.enum(MANUAL_VALUE_PROVENANCE).optional(),
  notes: z.string().optional(),
  assetSymbol: z.string().optional(),
  assetLogoUri: z.string().optional(),
  exchangeName: z.string().optional(),
  exchangeLogoUri: z.string().optional(),
  operationType: z.string().optional(),
  disposalType: z.enum(DISPOSAL_TYPES),
}).transform((raw): TaxLotHistoryEvent => ({
  ...raw,
  flag: raw.flag ?? null,
  qualityFlag: raw.qualityFlag ?? null,
  operationType: raw.operationType as TaxTransactionType | undefined,
}));

export const MockTaxReportSchema = z.object({
  year: numericField,
  method: z.string(),
  summary: MockTaxReportSummarySchema,
  auditTrail: z.array(MockTaxLotHistorySchema).default([]),
});

// ---------------------------------------------------------------------------
// Mock Portfolio Schemas (Transforms snake_case to camelCase)
// ---------------------------------------------------------------------------

export const MockAssetSchema = z
  .object({
    id: z.string().optional(), // mockPortfolio holdings do not have id!
    symbol: z.string(),
    amount: numericField,
    avg_price_fiat: numericField.optional(),
    avg_price_eur: numericField.optional(),
    current_value_fiat: numericField.optional(),
    current_value_eur: numericField.optional(),
    cost_basis_fiat: numericField.optional(),
    cost_basis_eur: numericField.optional(),
    unrealized_pnl_fiat: numericField.optional(),
    unrealized_pnl_eur: numericField.optional(),
    pnl_fiat: numericField.optional(),
    pnl_eur: numericField.optional(),
    currency: z.string().default('USD'),
    portfolio_locations: z.array(z.string()).default([]),
  })
  .transform((raw) => ({
    id: AssetIdSchema.parse(`asset-${raw.symbol.toLowerCase()}-mock`),
    symbol: raw.symbol,
    amount: raw.amount,
    avgPriceFiat: raw.avg_price_fiat ?? raw.avg_price_eur ?? 0,
    currentValueFiat: raw.current_value_fiat ?? raw.current_value_eur ?? 0,
    costBasisFiat: raw.cost_basis_fiat ?? raw.cost_basis_eur ?? 0,
    unrealizedPnlFiat: raw.unrealized_pnl_fiat ?? raw.unrealized_pnl_eur ?? 0,
    pnlFiat: raw.pnl_fiat ?? raw.pnl_eur ?? 0,
    currency: raw.currency,
    portfolioLocations: raw.portfolio_locations,
  }))

export const MockPortfolioMetricsSchema = z
  .object({
    total_equity_fiat: numericField.optional(),
    total_equity_eur: numericField.optional(),
    total_cost_basis_fiat: numericField.optional(),
    total_cost_basis_eur: numericField.optional(),
    total_realized_pnl_fiat: numericField.optional(),
    total_realized_pnl_eur: numericField.optional(),
    total_unrealized_pnl_fiat: numericField.optional(),
    total_unrealized_pnl_eur: numericField.optional(),
    total_pnl_fiat: numericField.optional(),
    total_pnl_eur: numericField.optional(),
    currency: z.string().default('USD'),
  })
  .transform((raw) => {
    const totalEquityFiat = raw.total_equity_fiat ?? raw.total_equity_eur ?? 0
    const totalCostBasisFiat = raw.total_cost_basis_fiat ?? raw.total_cost_basis_eur ?? 0
    const totalRealizedPnlFiat = raw.total_realized_pnl_fiat ?? raw.total_realized_pnl_eur ?? 0
    const totalUnrealizedPnlFiat = raw.total_unrealized_pnl_fiat ?? raw.total_unrealized_pnl_eur ?? 0
    const totalPnlFiat = raw.total_pnl_fiat ?? raw.total_pnl_eur ?? (totalUnrealizedPnlFiat + totalRealizedPnlFiat)
    return {
      totalEquityFiat,
      totalCostBasisFiat,
      totalRealizedPnlFiat,
      totalUnrealizedPnlFiat,
      totalPnlFiat,
      currency: raw.currency,
    }
  })

export const MockPortfolioSummarySchema = z
  .object({
    metrics: MockPortfolioMetricsSchema,
    holdings: z.array(MockAssetSchema).default([]),
  })
  .transform((raw) => ({
    metrics: raw.metrics,
    holdings: raw.holdings,
  }))

// ---------------------------------------------------------------------------
// Additional Mock Schemas (Token History & Ingestion)
// ---------------------------------------------------------------------------

export const MockTaxLotSchema = z.object({
  id: LotIdSchema,
  symbol: z.string(),
  date: timestampToDate,
  exchange: z.string(),
  original_qty: numericField,
  remaining_qty: numericField,
  unit_cost: numericField,
  total_cost: numericField,
  status: z.enum(TAX_LOT_STATUSES),
}).transform((raw): TaxLotEntity => ({
  id: raw.id,
  symbol: raw.symbol,
  date: raw.date,
  exchange: raw.exchange,
  originalQty: raw.original_qty,
  remainingQty: raw.remaining_qty,
  unitCost: raw.unit_cost,
  totalCost: raw.total_cost,
  status: raw.status,
  // Mocks never model split custody — the real schema's ExternalLotCustodyLocationSchema is
  // what carries it, and nothing constructs mock custody fixtures today.
  currentLocations: [],
}));

// Narrows an individually-parsed raw event without resorting to `any` — this nested shape
// predates MockTaxLotHistorySchema and still uses the wire's snake_case field names.
const legacyMockEventSchema = z.object({
  id: z.string(),
  disposal_date: z.union([z.string(), z.number(), z.date()]),
  amount_from_lot: numericField,
  sale_price_eur: nullableNumericField,
  gain_loss_eur: nullableNumericField,
  is_taxable: z.boolean().default(false),
  flag: z.enum(FISCAL_CLASSIFICATION_FLAGS).nullable().optional(),
  notes: z.string().optional(),
});

export const MockTokenHistorySchema = z.object({
  lots: z.array(MockTaxLotSchema).default([]),
  history: z.record(
    z.string(), // lotId
    z.object({
      status: z.enum(TAX_LOT_STATUSES).optional(),
      history: z.array(z.unknown()).default([]), // raw events, parsed individually below
    })
  ).default({}),
}).transform((raw) => {
  return {
    lots: raw.lots,
    history: Object.fromEntries(
      Object.entries(raw.history).map(([lotId, record]) => [
        lotId,
        // Transforms snake_case mock data from the BFF into camelCase domain entities
        record.history.map((rawEvt) => {
          const evt = legacyMockEventSchema.parse(rawEvt);
          return {
            id: evt.id,
            disposalDate: timestampToDate.parse(evt.disposal_date),
            amountFromLot: evt.amount_from_lot,
            salePriceEur: evt.sale_price_eur,
            gainLossEur: evt.gain_loss_eur,
            isTaxable: evt.is_taxable,
            flag: evt.flag ?? null,
            notes: evt.notes,
          };
        })
      ])
    )
  };
});

export const MockIngestionStatusSchema = z.object({
  status: z.enum(['idle', 'processing', 'success', 'error']),
  progress: numericField,
  message: z.string().default(''),
  processedCount: numericField.optional().default(0),
  totalCount: numericField.optional().default(0),
}).transform((raw) => ({
  status: raw.status,
  progress: raw.progress,
  message: raw.message,
  processedCount: raw.processedCount,
  totalCount: raw.totalCount,
}));
