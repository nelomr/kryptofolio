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

import type { TransactionId, LotId, AccountId } from './BrandedTypes'
import type {
  TaxLotStatus,
  DisposalType,
  FifoQualityFlag,
  FiscalClassificationFlag,
  ManualValueProvenance,
  FlagSeverity,
} from '@kryptofolio/shared-types'

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
// LotCustodyLocation — where a lot's quantity currently sits (may differ from
// the acquiring venue once a non-taxable custody movement has relocated it)
// ---------------------------------------------------------------------------

export interface LotCustodyLocation {
  /** Branded account ID — may be a synthetic `ownwallet-<ASSET>` account */
  accountId: AccountId
  accountName: string
  /** True for the synthetic counterparty custody resolves an unrecorded movement to */
  isSynthetic: boolean
  parentAccountId: AccountId | null
  /** Quantity of the lot currently held at this account. Zero-quantity rows are filtered upstream. */
  qty: number
}

// ---------------------------------------------------------------------------
// LotRelocationEntity — one custody movement of a lot (Level 3, second source)
// ---------------------------------------------------------------------------

/**
 * A quantity of a lot leaving one account for another.
 *
 * There is deliberately no price, gain, loss or taxability field, and there must never be one: a
 * movement between the user's own accounts realises nothing. That is also why this is not a
 * `TaxLotHistoryEvent` — the event policy emits none for a custody movement.
 */
export interface LotRelocationEntity {
  id: string
  occurredAt: Date
  /** Magnitude moved, never signed: a relocation consumes nothing. */
  qty: number
  fromAccountId: AccountId
  fromAccountName: string
  fromIsSynthetic: boolean
  toAccountId: AccountId
  toAccountName: string
  /** True when the destination is the synthetic counterparty an unrecorded movement resolves to. */
  toIsSynthetic: boolean
}

/**
 * A Level 3 row: the lot's history is two record types merged by date, never one shape with optional
 * fields — a discriminated union is what stops a relocation being read as a disposal.
 */
export type LotTimelineRow =
  | { kind: 'DISPOSAL'; occurredAt: Date; event: TaxLotHistoryEvent }
  | { kind: 'RELOCATION'; occurredAt: Date; relocation: LotRelocationEntity }

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
  /** Exchange or wallet where acquired — the acquiring venue, not necessarily where it sits now */
  exchange: string
  /** Original quantity when lot was opened */
  originalQty: number
  /** Remaining quantity not yet disposed of */
  remainingQty: number
  /** Cost per unit at acquisition in EUR */
  unitCost: number
  /** Total remaining cost basis in EUR */
  totalCost: number
  /** Canonical lot status, passed through from the calculation engine unchanged */
  status: TaxLotStatus
  /**
   * Defect on this lot's own basis, if any.
   *
   * When set, `unitCost` and `totalCost` arrive as `0` because the persisted column cannot be null —
   * so presenting either figure without consulting this field reports an unknown basis as free.
   */
  qualityFlag?: FifoQualityFlag | null
  /** Whether the basis was observed from market data or declared by the user */
  valueProvenance?: ManualValueProvenance
  /** Present-day custody per account. Empty when nothing has moved and the projection has no row. */
  currentLocations: LotCustodyLocation[]
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
  /** Sale price per unit in EUR. Null when unresolved — never fabricated as 0. */
  salePriceEur: number | null
  /** Realized gain or loss in EUR. Null when unresolved — never fabricated as 0. */
  gainLossEur: number | null
  /** Fee portion attributable to this disposal in EUR */
  saleFeeEur?: number
  /** Whether this event is subject to IRPF taxation */
  isTaxable: boolean
  /** Why the lot was consumed: a network fee is not a sale. */
  disposalType: DisposalType
  /** Fiscal classification, e.g. the Tangem wallet-activation audit marker. Orthogonal to qualityFlag. */
  flag?: FiscalClassificationFlag | null
  /** Data-quality defect on this event's valuation, if any. Orthogonal to flag — both may be present. */
  qualityFlag?: FifoQualityFlag | null
  /** Whether salePriceEur/gainLossEur came from the market or from a manual assignment */
  valueProvenance?: ManualValueProvenance
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
  /** Disposal events held out of the summary above because they carry a data-quality defect. */
  excludedFlaggedEvents: number
  /** Income rows (staking, airdrops, …) held out of the summary above because no price could be resolved. */
  excludedUnresolvedIncomeCount: number
}

// ---------------------------------------------------------------------------
// FiscalIntegrityReportEntity — the pending-review surface (one row per defect)
// ---------------------------------------------------------------------------

export interface FiscalIntegrityDefectEntity {
  qualityFlag: FifoQualityFlag
  severity: FlagSeverity
  assetId: string | null
  accountId: string | null
  txId: string | null
  occurredAt: string | null
  /** An i18n key, never prose — the backend emits no user-facing copy. */
  detailKey: string
  pendingReview: boolean
}

export interface FiscalIntegrityGroupEntity {
  qualityFlag: FifoQualityFlag
  severity: FlagSeverity
  count: number
  pendingReview: number
  rows: FiscalIntegrityDefectEntity[]
}

export interface FiscalIntegrityReportEntity {
  groups: FiscalIntegrityGroupEntity[]
  totalDefects: number
  pendingReview: number
  /** Derived figures are stale until the next rebuild succeeds. */
  needsRecalculation: boolean
}

// ---------------------------------------------------------------------------
// MaterializationSummaryEntity — what a rebuild reconciled, per derived table
// ---------------------------------------------------------------------------

export interface ReconciliationSummaryEntity {
  inserted: number
  updated: number
  retired: number
  reactivated: number
}

export interface MaterializationSummaryEntity {
  taxLots: ReconciliationSummaryEntity
  lotHistoryEvents: ReconciliationSummaryEntity
  custodyEntries: ReconciliationSummaryEntity
  flagged: number
  pendingReview: number
}

export interface RebuildOutcomeEntity {
  materialized: boolean
  materialization: MaterializationSummaryEntity | null
  materializationError: string | null
  /** Rows a user can resolve by declaring a value or a destination. Zero when no rebuild ran. */
  pendingReview: number
}

// ---------------------------------------------------------------------------
// IngestionOutcomeEntity — the ingestion response, with structured rejections
// ---------------------------------------------------------------------------

export interface IngestionRejectionEntity {
  idHash: string
  timestamp: string
  txType: string | null
  reason: string
}

/**
 * A row persisted with a fee its source's profile could not resolve — distinct from an unresolved
 * *price* (`pendingReview`). A user able to declare a market price cannot necessarily declare a
 * fee's denomination or convention, so the two are never the same count.
 */
export interface FeePendingReviewEntity {
  idHash: string
  timestamp: string
  reason: string
}

export interface IngestionOutcomeEntity extends RebuildOutcomeEntity {
  status: 'success'
  processedCount: number
  message: string
  /** Always present, empty when nothing was refused. */
  rejected: IngestionRejectionEntity[]
  /** Rows persisted with a fiat magnitude that could not be resolved. */
  unresolvedFiat: number
  /** Always present, empty when every fee resolved. */
  pendingFeeReview: FeePendingReviewEntity[]
}

// ---------------------------------------------------------------------------
// OverrideOutcomeEntity — what an override mutation wrote, and the rebuild that followed
// ---------------------------------------------------------------------------

export interface OverrideOutcomeEntity {
  applied: number
  materialization: MaterializationSummaryEntity | null
  pendingReview: number
}
