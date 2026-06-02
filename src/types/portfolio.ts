/**
 * Portfolio Domain Types — Single source of truth for all portfolio data shapes.
 * Used by Pinia stores, Vue components, and mock fixtures.
 *
 * @see openspec/specs/portfolio-types/spec.md
 */

// ---------------------------------------------------------------------------
// 1. Global Portfolio Metrics
// ---------------------------------------------------------------------------

export interface PortfolioMetrics {
  total_equity_eur: number
  total_realized_pnl_eur: number
  total_unrealized_pnl_eur: number
}

// ---------------------------------------------------------------------------
// 2. Asset Summary (Level 1)
// ---------------------------------------------------------------------------

export interface HoldingItem {
  symbol: string
  amount: number
  avg_price_eur: number
  weighted_average_cost: number
  current_value_eur: number
  cost_basis_eur: number
  unrealized_pnl_eur: number
  pnl_eur: number
  portfolio_locations: string[]
}

// ---------------------------------------------------------------------------
// 3. FIFO Tax Lot (Level 2)
// ---------------------------------------------------------------------------

export interface TaxLot {
  id: string
  symbol: string
  /** UNIX timestamp in seconds */
  date: number
  exchange: string
  original_qty: number
  remaining_qty: number
  unit_cost: number
  total_cost: number
}

// ---------------------------------------------------------------------------
// 4. Historical Tax Event (Level 3)
// ---------------------------------------------------------------------------

export interface LotHistoryEvent {
  id: string
  /** UNIX timestamp in seconds */
  disposal_date: number
  amount_from_lot: number
  sale_price_eur: number
  gain_loss_eur: number
  is_taxable: boolean
  flag?: 'WALLET_ACTIVATION' | null
  notes?: string
}

// ---------------------------------------------------------------------------
// 5. Root Portfolio Data (wraps all domain types)
// ---------------------------------------------------------------------------

export interface LotRecord {
  status: 'FULL' | 'PARTIAL' | 'EMPTY'
  history: LotHistoryEvent[]
}

export interface PortfolioData {
  summary: {
    metrics: PortfolioMetrics
    holdings: HoldingItem[]
  }
  /** FIFO tax lots keyed by asset symbol (e.g. "BTC") */
  lots: Record<string, TaxLot[]>
  /** Lot history keyed by symbol → lot ID */
  history: Record<string, Record<string, LotRecord>>
}
