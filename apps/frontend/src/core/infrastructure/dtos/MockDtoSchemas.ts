import { z } from 'zod';
import { AssetIdSchema, LotIdSchema, TransactionIdSchema } from './BrandedTypeSchemas';
import type { 
  TaxTransactionType, 
  TaxLotHistoryEvent,
  FuturesTransactionType,
} from '@/core/domain/models/FiscalEntities';

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
  salePriceEur: numericField,
  gainLossEur: numericField,
  saleFeeEur: numericField.optional(),
  isTaxable: z.boolean().default(false),
  flag: z.enum(['WALLET_ACTIVATION']).nullable().optional(),
  notes: z.string().optional(),
  assetSymbol: z.string().optional(),
  assetLogoUri: z.string().optional(),
  exchangeName: z.string().optional(),
  exchangeLogoUri: z.string().optional(),
  operationType: z.string().optional(),
}).transform((raw): TaxLotHistoryEvent => ({
  ...raw,
  flag: raw.flag ?? null,
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
    avg_price_eur: numericField.optional(),
    current_value_eur: numericField,
    cost_basis_eur: numericField,
    unrealized_pnl_eur: numericField,
    pnl_eur: numericField,
    portfolio_locations: z.array(z.string()).default([]),
  })
  .transform((raw) => ({
    id: AssetIdSchema.parse(`asset-${raw.symbol.toLowerCase()}-mock`),
    symbol: raw.symbol,
    amount: raw.amount,
    avgPriceEur: raw.avg_price_eur ?? 0,
    currentValueEur: raw.current_value_eur,
    costBasisEur: raw.cost_basis_eur,
    unrealizedPnlEur: raw.unrealized_pnl_eur,
    pnlEur: raw.pnl_eur,
    portfolioLocations: raw.portfolio_locations,
  }))

export const MockPortfolioMetricsSchema = z
  .object({
    total_equity_eur: numericField,
    total_cost_basis_eur: numericField.optional(),
    total_realized_pnl_eur: numericField,
    total_unrealized_pnl_eur: numericField,
    total_pnl_eur: numericField.optional(),
  })
  .transform((raw) => ({
    totalEquityEur: raw.total_equity_eur,
    totalCostBasisEur: raw.total_cost_basis_eur ?? 0,
    totalRealizedPnlEur: raw.total_realized_pnl_eur,
    totalUnrealizedPnlEur: raw.total_unrealized_pnl_eur,
    totalPnlEur: raw.total_pnl_eur ?? (raw.total_unrealized_pnl_eur + raw.total_realized_pnl_eur),
  }))

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
  status: z.enum(['FULL', 'PARTIAL', 'EMPTY']).optional(),
}).transform((raw) => ({
  id: raw.id,
  symbol: raw.symbol,
  date: raw.date,
  exchange: raw.exchange,
  originalQty: raw.original_qty,
  remainingQty: raw.remaining_qty,
  unitCost: raw.unit_cost,
  totalCost: raw.total_cost,
  status: raw.status,
}));

export const MockTokenHistorySchema = z.object({
  lots: z.array(MockTaxLotSchema).default([]),
  history: z.record(
    z.string(), // lotId
    z.object({
      status: z.enum(['FULL', 'PARTIAL', 'EMPTY']).optional(),
      history: z.array(z.any()).default([]), // raw events are any, then we parse them
    })
  ).default({}),
}).transform((raw) => {
  return {
    lots: raw.lots,
    history: Object.fromEntries(
      Object.entries(raw.history).map(([lotId, record]) => [
        lotId,
        // Transforms snake_case mock data from the BFF into camelCase domain entities
        record.history.map((evt: any) => ({
          id: evt.id,
          disposalDate: timestampToDate.parse(evt.disposal_date),
          amountFromLot: evt.amount_from_lot,
          salePriceEur: evt.sale_price_eur,
          gainLossEur: evt.gain_loss_eur,
          isTaxable: evt.is_taxable,
          flag: evt.flag ?? null,
          notes: evt.notes,
        }))
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
