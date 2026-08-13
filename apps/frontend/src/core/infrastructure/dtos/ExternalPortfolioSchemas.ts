/**
 * External Portfolio Zod Schemas — Anti-Corruption Layer for portfolio API responses.
 *
 * These schemas transform and validate raw external API data before it enters
 * the domain layer. They handle:
 *   - Coercing string numbers (e.g. "62000.50") to native numbers
 *   - Mapping DTO field names (e.g. avg_price_fiat -> avgPriceFiat) to domain models
 *   - Providing safe fallback defaults for optional fields
 *
 * Always use `.safeParse()` — never `.parse()` — in adapters to prevent crashes.
 *
 * @see openspec/specs/zod-validation/spec.md
 */

import { z } from 'zod'
import { convertedAmountSchema } from '@kryptofolio/shared-types'
import { numericField } from './CommonSchemaHelpers'

// ---------------------------------------------------------------------------
// ExternalAssetSchema — single holding from the API (raw DTO → domain-ready)
// ---------------------------------------------------------------------------

const externalAssetShape = {
  id: z.string().min(1),
  symbol: z.string().min(1),
  amount: numericField,
  // Handle field name variants from API DTOs (new *fiat vs legacy *eur)
  avg_price_fiat: numericField.optional(),
  avg_price_eur: numericField.optional(),
  weighted_average_cost: numericField.optional(),
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
}

type ExternalAssetRaw = z.infer<z.ZodObject<typeof externalAssetShape>>

function toDomainAsset(raw: ExternalAssetRaw) {
  return {
    id: raw.id,
    symbol: raw.symbol,
    amount: raw.amount,
    avgPriceFiat: raw.avg_price_fiat ?? raw.avg_price_eur ?? raw.weighted_average_cost ?? 0,
    currentValueFiat: raw.current_value_fiat ?? raw.current_value_eur ?? 0,
    costBasisFiat: raw.cost_basis_fiat ?? raw.cost_basis_eur ?? 0,
    unrealizedPnlFiat: raw.unrealized_pnl_fiat ?? raw.unrealized_pnl_eur ?? 0,
    pnlFiat: raw.pnl_fiat ?? raw.pnl_eur ?? raw.unrealized_pnl_fiat ?? raw.unrealized_pnl_eur ?? 0,
    currency: raw.currency,
    portfolioLocations: raw.portfolio_locations,
  }
}

export const ExternalAssetSchema = z.object(externalAssetShape).transform(toDomainAsset)

export type ExternalAssetDTO = z.infer<typeof ExternalAssetSchema>

// ---------------------------------------------------------------------------
// ExternalSummaryHoldingSchema — a holding as the summary endpoint returns it
// ---------------------------------------------------------------------------

/**
 * `cost_basis` is required here and absent from `ExternalAssetSchema`, because only the summary
 * endpoint resolves a display currency. Defaulting it would be worse than rejecting: an amount
 * with no outcome renders identically to a converted one, so a missing outcome would surface as a
 * confidently wrong figure rather than as a failure.
 */
export const ExternalSummaryHoldingSchema = z
  .object({ ...externalAssetShape, cost_basis: convertedAmountSchema })
  .transform((raw) => ({ ...toDomainAsset(raw), costBasis: raw.cost_basis }))

// ---------------------------------------------------------------------------
// ExternalPortfolioMetricsSchema — aggregate financial metrics
// ---------------------------------------------------------------------------

const ExternalPortfolioMetricsSchema = z
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
    // Two independent booleans, not one union: a portfolio can genuinely be in all four
    // combinations, and the remedies differ — a missing price is fixed by seeding the price
    // series, a missing rate by seeding the FX ledger.
    rates_incomplete: z.boolean(),
    prices_incomplete: z.boolean(),
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
      ratesIncomplete: raw.rates_incomplete,
      pricesIncomplete: raw.prices_incomplete,
    }
  })

// ---------------------------------------------------------------------------
// ExternalPortfolioSummarySchema — full portfolio summary response
// ---------------------------------------------------------------------------

export const ExternalPortfolioSummarySchema = z
  .object({
    metrics: ExternalPortfolioMetricsSchema,
    holdings: z.array(ExternalSummaryHoldingSchema).default([]),
  })
  .transform((raw) => ({
    metrics: raw.metrics,
    holdings: raw.holdings,
  }))

export type ExternalPortfolioSummaryDTO = z.infer<typeof ExternalPortfolioSummarySchema>

// ---------------------------------------------------------------------------
// ExternalIngestionStatusSchema — background sync progress
// ---------------------------------------------------------------------------

export const ExternalIngestionStatusSchema = z
  .object({
    status: z.enum(['idle', 'processing', 'success', 'error']).default('idle'),
    progress: numericField,
    message: z.string().default(''),
    processedCount: numericField,
    totalCount: numericField,
  })
  .transform((raw) => ({
    status: raw.status,
    progress: raw.progress,
    message: raw.message,
    processedCount: raw.processedCount,
    totalCount: raw.totalCount,
  }))
