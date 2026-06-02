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
