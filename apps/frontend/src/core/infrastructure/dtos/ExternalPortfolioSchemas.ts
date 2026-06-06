/**
 * External Portfolio Zod Schemas — Anti-Corruption Layer for portfolio API responses.
 *
 * These schemas transform and validate raw external API data before it enters
 * the domain layer. They handle:
 *   - Coercing string numbers (e.g. "62000.50") to native numbers
 *   - Mapping legacy field name aliases (e.g. weighted_average_cost → avgPriceEur)
 *   - Providing safe fallback defaults for nullable/undefined fields
 *
 * Always use `.safeParse()` — never `.parse()` — in adapters to prevent crashes.
 *
 * @see openspec/specs/zod-validation/spec.md
 */

import { z } from 'zod'

// ---------------------------------------------------------------------------
// Helpers — reusable preprocessors
// ---------------------------------------------------------------------------

/** Coerces string numbers, null, and undefined to a number with a fallback of 0 */
const numericField = z.preprocess(
  (val) => {
    if (val === null || val === undefined) return 0
    const n = typeof val === 'string' ? parseFloat(val.replace(/[^0-9.-]/g, '')) : Number(val)
    return isNaN(n) ? 0 : n
  },
  z.number(),
)

// ---------------------------------------------------------------------------
// ExternalAssetSchema — single holding from the API (raw → domain-ready)
// ---------------------------------------------------------------------------

export const ExternalAssetSchema = z
  .object({
    id: z.string().min(1),
    symbol: z.string().min(1),
    amount: numericField,
    // Handle both field name variants from the legacy API
    avg_price_eur: numericField.optional(),
    weighted_average_cost: numericField.optional(),
    current_value_eur: numericField,
    cost_basis_eur: numericField,
    unrealized_pnl_eur: numericField,
    pnl_eur: numericField,
    portfolio_locations: z.array(z.string()).default([]),
  })
  .transform((raw) => ({
    id: raw.id,
    symbol: raw.symbol,
    amount: raw.amount,
    // Resolve field alias: prefer avg_price_eur, fall back to weighted_average_cost
    avgPriceEur: raw.avg_price_eur ?? raw.weighted_average_cost ?? 0,
    currentValueEur: raw.current_value_eur,
    costBasisEur: raw.cost_basis_eur,
    unrealizedPnlEur: raw.unrealized_pnl_eur,
    pnlEur: raw.pnl_eur,
    portfolioLocations: raw.portfolio_locations,
  }))

export type ExternalAssetDTO = z.infer<typeof ExternalAssetSchema>

// ---------------------------------------------------------------------------
// ExternalPortfolioMetricsSchema — aggregate financial metrics
// ---------------------------------------------------------------------------

const ExternalPortfolioMetricsSchema = z
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
    totalPnlEur: raw.total_pnl_eur ?? raw.total_unrealized_pnl_eur + raw.total_realized_pnl_eur,
  }))

// ---------------------------------------------------------------------------
// ExternalPortfolioSummarySchema — full portfolio summary response
// ---------------------------------------------------------------------------

export const ExternalPortfolioSummarySchema = z
  .object({
    metrics: ExternalPortfolioMetricsSchema,
    holdings: z.array(ExternalAssetSchema).default([]),
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
