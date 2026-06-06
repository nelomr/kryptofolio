/**
 * Portfolio Domain Entities — Pure domain models for portfolio data.
 *
 * These entities represent the internal domain contracts. They use camelCase
 * field names and native JS types (number, Date) — no raw API strings.
 * No component or Pinia store should ever depend on API response shapes directly.
 *
 * @see openspec/specs/hexagonal-architecture/spec.md
 * @see openspec/specs/fiscal-domain/spec.md
 */

import type { AssetId } from './BrandedTypes'
import type { TaxLotEntity, TaxLotHistoryEvent } from './FiscalEntities'

// ---------------------------------------------------------------------------
// CryptoAssetEntity — single holding in the portfolio (Level 1)
// ---------------------------------------------------------------------------

export interface CryptoAssetEntity {
  /** Branded nominal ID — prevents confusion with other string IDs */
  id: AssetId
  /** Ticker symbol, e.g. "BTC", "ETH" */
  symbol: string
  /** Total quantity held across all wallets */
  amount: number
  /** Weighted average acquisition price in EUR */
  avgPriceEur: number
  /** Current market value in EUR */
  currentValueEur: number
  /** Total acquisition cost in EUR */
  costBasisEur: number
  /** Unrealized profit/loss in EUR */
  unrealizedPnlEur: number
  /** Combined PnL (unrealized) in EUR — UI-facing alias */
  pnlEur: number
  /** Percentage change in value over the last 24 hours */
  change24h?: number
  /** List of wallets/exchanges where the asset is held */
  portfolioLocations: string[]
}

// Alias for components that expect "HoldingEntity" naming
export type HoldingEntity = CryptoAssetEntity

// ---------------------------------------------------------------------------
// PortfolioMetricsEntity — aggregate financial metrics
// ---------------------------------------------------------------------------

export interface PortfolioMetricsEntity {
  /** Total portfolio value at current market prices in EUR */
  totalEquityEur: number
  /** Sum of all acquisition costs in EUR */
  totalCostBasisEur: number
  /** Sum of all realized gains/losses in EUR */
  totalRealizedPnlEur: number
  /** Sum of all open unrealized gains/losses in EUR */
  totalUnrealizedPnlEur: number
  /** Total PnL (realized + unrealized) in EUR */
  totalPnlEur: number
}

// ---------------------------------------------------------------------------
// PortfolioSummaryEntity — root-level response from the portfolio repository
// ---------------------------------------------------------------------------

export interface PortfolioSummaryEntity {
  metrics: PortfolioMetricsEntity
  holdings: HoldingEntity[]
}

// ---------------------------------------------------------------------------
// IngestionStatusEntity — background ingestion progress feedback
// ---------------------------------------------------------------------------

export type IngestionStatus = 'idle' | 'processing' | 'success' | 'error'

export interface IngestionStatusEntity {
  status: IngestionStatus
  progress: number
  message: string
  processedCount: number
  totalCount: number
}

// ---------------------------------------------------------------------------
// TokenHistoryEntity — lot hierarchy data for a single asset (3-level view)
// ---------------------------------------------------------------------------

export interface TokenHistoryEntity {
  /** FIFO tax lots for this asset, ordered by acquisition date */
  lots: TaxLotEntity[]
  /**
   * Lot history events keyed by lot ID.
   * Each key is a LotId string, value is the ordered list of disposal events.
   */
  history: Record<string, TaxLotHistoryEvent[]>
}

// ---------------------------------------------------------------------------
// WalletEntities — logical wallets and their chain addresses
// ---------------------------------------------------------------------------

export type WalletType = 'COLD_WALLET' | 'HOT_WALLET'

export interface ChainAddressEntity {
  blockchain: string
  address: string
}

export interface LogicalWalletEntity {
  name: string
  type: WalletType
  chainAddresses: ChainAddressEntity[]
}
