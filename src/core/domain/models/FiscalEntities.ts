/**
 * Fiscal Domain Entities — Pure domain models for tax and fiscal data.
 *
 * Based on the legacy system's data shapes (taxStore.js, portfolioStore.js),
 * these entities normalize all inconsistencies before they ever reach Vue components.
 * All types use camelCase and native JS types (Date, number).
 *
 * AEAT Compliance: field names map directly to IRPF reporting concepts.
 *
 * @see openspec/specs/fiscal-domain/spec.md
 */

import type { TransactionId, LotId } from './BrandedTypes'

// ---------------------------------------------------------------------------
// FuturesTransactionType — operation types specific to futures/derivatives
// ---------------------------------------------------------------------------

export type FuturesTransactionType =
  | 'FUTURES_TRADE'
  | 'FUTURES_FUNDING'
  | 'CONVERSION'
  | 'UNKNOWN'

// ---------------------------------------------------------------------------
// TaxDerivativeEntity — single futures/derivatives fiscal transaction
//
// This entity represents the futures-specific shape of a transaction.
// Fields map 1:1 to Kraken Futures CSV columns after normalization.
// AEAT fiscal compliance: realized_pnl is the taxable event for derivados.
// ---------------------------------------------------------------------------

export interface TaxDerivativeEntity {
  /** Branded nominal ID */
  id: TransactionId
  /** Normalized futures operation type */
  type: FuturesTransactionType
  /** Full contract symbol as provided by the exchange (e.g. pf_xrpusd) */
  contractSymbol: string
  /** Underlying asset extracted from the contract (e.g. xrp from pf_xrpusd) */
  underlyingAsset: string
  /** Size of the position / number of contracts traded */
  amount: number
  /** Execution price of the operation in EUR */
  tradePrice: number
  /** Realized PnL in EUR — the primary taxable figure for AEAT IRPF */
  realizedPnl: number
  /** Transaction fee in EUR */
  fees: number
  /** Realized funding rate cost/gain in EUR */
  funding: number
  /** Native Date object for the transaction */
  timestamp: Date
  /** Exchange or wallet source (e.g. Kraken) */
  exchange?: string
  /** Reference ID from the exchange */
  refId?: string
  /** Position status (e.g. CLOSED) */
  status?: string
}

// ---------------------------------------------------------------------------
// Transaction Types — all known operation types from legacy system
// ---------------------------------------------------------------------------

export type TaxTransactionType =
  | 'BUY'
  | 'SELL'
  | 'DEPOSIT'
  | 'WITHDRAWAL'
  | 'FEE'
  | 'TRANSFER_IN'
  | 'TRANSFER_OUT'
  | 'AIRDROP'
  | 'REWARD'
  | 'SWAP'
  | 'MIGRATION_SWAP'
  | 'FUTURES_TRADE'
  | 'FUTURES_FUNDING'
  | 'UNKNOWN'

// ---------------------------------------------------------------------------
// TaxTransactionEntity — single fiscal transaction (normalized)
// ---------------------------------------------------------------------------

export interface TaxTransactionEntity {
  /** Branded nominal ID */
  id: TransactionId
  /** Normalized transaction type (replaces raw tx_type/type inconsistency) */
  type: TaxTransactionType
  /** Unified asset symbol (replaces asset_in/asset_out conditional logic) */
  symbol: string
  /** Normalized quantity (replaces amount_in/amount_out conditional logic) */
  amount: number
  /** EUR value of the operation (cost or proceeds, depending on type) */
  totalEur: number
  /** Price per unit in EUR at time of transaction */
  priceEur: number
  /** Transaction fee in EUR */
  feeEur: number
  /** Native Date object (replaces "YYYY-MM-DD HH:MM:SS" string format) */
  timestamp: Date
  /** For SWAP/MIGRATION_SWAP: the incoming asset */
  assetIn?: string
  /** For SWAP/MIGRATION_SWAP: the outgoing asset */
  assetOut?: string
  /** For SWAP/MIGRATION_SWAP: the incoming quantity */
  amountIn?: number
  /** For SWAP/MIGRATION_SWAP: the outgoing quantity */
  amountOut?: number
  /** Exchange or wallet source */
  exchange?: string
  /** Optional notes or reference ID from exchange */
  refId?: string
}

// ---------------------------------------------------------------------------
// TaxLotEntity — FIFO tax lot (Level 2)
// ---------------------------------------------------------------------------

export interface TaxLotEntity {
  /** Branded lot ID */
  id: LotId
  /** Asset symbol */
  symbol: string
  /** Acquisition date as a native Date */
  date: Date
  /** Exchange or wallet where acquired */
  exchange: string
  /** Original quantity when lot was opened */
  originalQty: number
  /** Remaining quantity not yet disposed of */
  remainingQty: number
  /** Cost per unit at acquisition in EUR */
  unitCost: number
  /** Total remaining cost basis in EUR */
  totalCost: number
  /** Lot status */
  status?: 'FULL' | 'PARTIAL' | 'EMPTY'
}

// ---------------------------------------------------------------------------
// TaxLotHistoryEvent — individual disposal event from a lot (Level 3)
// ---------------------------------------------------------------------------

export interface TaxLotHistoryEvent {
  id: string
  /** Date of disposal as a native Date */
  disposalDate: Date
  /** Quantity disposed from this lot */
  amountFromLot: number
  /** Sale price per unit in EUR */
  salePriceEur: number
  /** Realized gain or loss in EUR */
  gainLossEur: number
  /** Fee portion attributable to this disposal in EUR */
  saleFeeEur?: number
  /** Whether this event is subject to IRPF taxation */
  isTaxable: boolean
  /** Special flags, e.g. internal transfer markers */
  flag?: 'WALLET_ACTIVATION' | null
  notes?: string
  /** Asset symbol (e.g., BTC) */
  assetSymbol?: string
  /** URI to the asset SVG logo */
  assetLogoUri?: string
  /** Name of the exchange where the operation occurred */
  exchangeName?: string
  /** URI to the exchange SVG logo */
  exchangeLogoUri?: string
  /** Specific operation type */
  operationType?: TaxTransactionType
}

// ---------------------------------------------------------------------------
// TaxReportSummary — AEAT IRPF aggregate figures
// ---------------------------------------------------------------------------

export interface TaxReportSummary {
  /** Total capital gains in EUR (ganancias patrimoniales) */
  capitalGainsEur: number
  /** Total capital losses in EUR (pérdidas patrimoniales) */
  capitalLossesEur: number
  /** Yields from savings base in EUR (rendimientos del capital) */
  savingsBaseYieldsEur: number
  /** Airdrops classified in the general base in EUR */
  generalBaseAirdropsEur: number
  /** Net patrimonial result in EUR */
  netPatrimonialResultEur: number
  /** Estimated IRPF tax liability in EUR */
  estimatedIrpfEur: number
}

// ---------------------------------------------------------------------------
// TaxReportEntity — full tax report for a given fiscal year
// ---------------------------------------------------------------------------

export interface TaxReportEntity {
  year: number
  /** Calculation method, e.g. "FIFO" or "LIFO" */
  method: string
  summary: TaxReportSummary
  /** Detailed per-transaction audit trail for AEAT */
  auditTrail: TaxLotHistoryEvent[]
}
