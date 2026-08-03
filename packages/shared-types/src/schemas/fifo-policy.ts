/**
 * Single source of truth for how each transaction type participates in the FIFO engine, plus the
 * flag vocabularies and the account naming contracts.
 *
 * This lives in the leaf package on purpose: it has no workspace dependencies, so the domain layer,
 * the DuckDB views and the ingestion path all read the same constants without duplication and
 * without an import cycle.
 */

import { SPOT_TX_TYPES, type SpotTxType } from './ledger.js';

// ---------------------------------------------------------------------------
// FIFO event policy
// ---------------------------------------------------------------------------

/**
 * What FIFO events a transaction type produces.
 *
 * The four flags are independent and none is derived from another. In particular
 * `generatesFeeDisposal` is orthogonal to `generatesDisposal`: a wallet transfer disposes of no
 * principal, yet its crypto network fee is a genuine disposal.
 */
export interface FifoEventPolicy {
  /** Opens a tax lot for the incoming asset. */
  readonly generatesAcquisition: boolean;
  /** Consumes tax lots for the outgoing principal. */
  readonly generatesDisposal: boolean;
  /** Consumes tax lots for a fee paid in a crypto asset. */
  readonly generatesFeeDisposal: boolean;
  /** Whether the principal disposal, when it exists, is a taxable event. */
  readonly taxableDisposal: boolean;
}

const ACQUISITION_ONLY: FifoEventPolicy = {
  generatesAcquisition: true,
  generatesDisposal: false,
  generatesFeeDisposal: true,
  taxableDisposal: false,
};

const TAXABLE_DISPOSAL_ONLY: FifoEventPolicy = {
  generatesAcquisition: false,
  generatesDisposal: true,
  generatesFeeDisposal: true,
  taxableDisposal: true,
};

/** Custody movement between the user's own accounts: no principal event, but the fee still counts. */
const CUSTODY_MOVEMENT: FifoEventPolicy = {
  generatesAcquisition: false,
  generatesDisposal: false,
  generatesFeeDisposal: true,
  taxableDisposal: false,
};

/**
 * The canonical policy. Typed as `Record<SpotTxType, …>` so that adding a member to
 * `SPOT_TX_TYPES` without a policy entry is a compile error rather than a silent exclusion.
 */
export const FIFO_EVENT_POLICY: Record<SpotTxType, FifoEventPolicy> = {
  // ── Trades
  BUY: ACQUISITION_ONLY,
  SELL: TAXABLE_DISPOSAL_ONLY,
  SWAP: {
    generatesAcquisition: true,
    generatesDisposal: true,
    generatesFeeDisposal: true,
    taxableDisposal: true,
  },
  SPEND: TAXABLE_DISPOSAL_ONLY,
  FEE: TAXABLE_DISPOSAL_ONLY,

  // Cost basis is the market value at receipt, never zero; an unresolvable value is flagged
  // MISSING_PRICE rather than treated as free.
  STAKING: ACQUISITION_ONLY,
  AIRDROP: ACQUISITION_ONLY,
  REWARD: ACQUISITION_ONLY,
  MINING: ACQUISITION_ONLY,

  // DEPOSIT and WITHDRAWAL are ambiguous by nature — a fiat DEPOSIT is funding, a crypto DEPOSIT is
  // custody — so that distinction is resolved from `assets.is_fiat`, not here.
  DEPOSIT: CUSTODY_MOVEMENT,
  WITHDRAWAL: CUSTODY_MOVEMENT,
  TRANSFER_IN: CUSTODY_MOVEMENT,
  TRANSFER_OUT: CUSTODY_MOVEMENT,
  MIGRATION_SWAP: CUSTODY_MOVEMENT,
};

/** Rows for bulk-seeding the policy into an analytical engine relation. */
export interface FifoEventPolicyRow extends FifoEventPolicy {
  readonly txType: SpotTxType;
}

/**
 * Flattens the policy for bulk ingestion. Insert in a single statement or via an appender — never
 * one INSERT per row, which a columnar engine handles badly.
 */
export function fifoEventPolicyRows(): readonly FifoEventPolicyRow[] {
  return SPOT_TX_TYPES.map((txType) => ({ txType, ...FIFO_EVENT_POLICY[txType] }));
}

// ---------------------------------------------------------------------------
// Disposal provenance
// ---------------------------------------------------------------------------

/** Why a lot was consumed. A network fee is not a sale. */
export const DISPOSAL_TYPES = ['SELL', 'SWAP', 'FEE', 'SPEND'] as const;
export type DisposalType = (typeof DISPOSAL_TYPES)[number];

// ---------------------------------------------------------------------------
// Flag vocabularies — deliberately two, never merged
// ---------------------------------------------------------------------------

/**
 * Fiscal classification: what kind of event this is.
 *
 * `WALLET_ACTIVATION` is load-bearing — it is consumed for the AEAT audit trail and must never be
 * folded into the data-quality vocabulary below. It currently has **no producer** in the running
 * application: the only code that ever emitted it is reachable from tests alone. The source-format
 * profiles are what will emit it.
 */
export const FISCAL_CLASSIFICATION_FLAGS = ['WALLET_ACTIVATION'] as const;
export type FiscalClassificationFlag = (typeof FISCAL_CLASSIFICATION_FLAGS)[number];

/**
 * Data-quality defect: what is wrong with this row's numbers.
 *
 * Stored in its own column because the two vocabularies co-occur — a wallet activation whose price
 * cannot be resolved carries one value from each. A single column would force a lossy precedence
 * rule.
 */
export const FIFO_QUALITY_FLAGS = [
  /** No historical price could be resolved; the value is unknown, not zero. */
  'MISSING_PRICE',
  /** The transaction's fiat currency disagrees with its fee or price series. */
  'CURRENCY_MISMATCH',
  /** A synthetic ownwallet account holds a positive residual beyond fee scale. */
  'CUSTODY_RESIDUAL',
  /** A synthetic ownwallet balance is negative: crypto arrived with no established cost basis. */
  'UNTRACKED_INFLOW',
  /** Aggregated custody diverges from an account's on-ledger balance. */
  'CUSTODY_IMBALANCE',
  /** A lot's cost basis is negative — a data defect, never a valid input. */
  'NEGATIVE_COST_BASIS',
  /** A materialised row's source transaction no longer exists. */
  'ORPHAN_LOT',
  /** A source transaction type could not be mapped to the canonical vocabulary. */
  'UNKNOWN_TX_TYPE',
] as const;
export type FifoQualityFlag = (typeof FIFO_QUALITY_FLAGS)[number];

export const FLAG_SEVERITIES = ['low', 'medium', 'high'] as const;
export type FlagSeverity = (typeof FLAG_SEVERITIES)[number];

/**
 * Severity per defect, defined once so no consumer invents its own ranking.
 *
 * `UNTRACKED_INFLOW` and `NEGATIVE_COST_BASIS` rank highest because both mean a reported figure
 * cannot be trusted at all: a holding with no cost basis, and a basis that inverts the sign of
 * every gain derived from it.
 */
export const FLAG_SEVERITY: Record<FifoQualityFlag, FlagSeverity> = {
  UNTRACKED_INFLOW: 'high',
  NEGATIVE_COST_BASIS: 'high',
  CURRENCY_MISMATCH: 'medium',
  CUSTODY_IMBALANCE: 'medium',
  MISSING_PRICE: 'medium',
  ORPHAN_LOT: 'medium',
  UNKNOWN_TX_TYPE: 'medium',
  CUSTODY_RESIDUAL: 'low',
};

/** Whether a monetary value was observed from market data or declared by the user. */
export const MANUAL_VALUE_PROVENANCE = ['MARKET', 'MANUAL'] as const;
export type ManualValueProvenance = (typeof MANUAL_VALUE_PROVENANCE)[number];

// ---------------------------------------------------------------------------
// Account naming contracts
// ---------------------------------------------------------------------------

/** Prefix identifying a synthetic custody counterparty account. */
export const SYNTHETIC_ACCOUNT_PREFIX = 'ownwallet-';

/** Separator between a venue and its sub-wallet in a child account identifier. */
export const SUB_ACCOUNT_SEPARATOR = ':';

/**
 * Derives the synthetic custody account for an asset.
 *
 * Every custody movement has a counterparty; when it is unknown, it is this account. Centralising
 * the derivation is what lets custody be a balance rather than a pairing heuristic — the SQL, the
 * ingestion path and the domain all resolve the identical name.
 *
 * @throws if the symbol is empty, rather than producing a nameless account that would collect every
 *   asset's residual into one bucket.
 */
export function deriveSyntheticAccountName(assetSymbol: string): string {
  const normalised = assetSymbol.trim().toUpperCase();
  if (normalised.length === 0) {
    throw new Error('deriveSyntheticAccountName requires a non-empty asset symbol');
  }
  return `${SYNTHETIC_ACCOUNT_PREFIX}${normalised}`;
}

/** Whether an account name denotes a synthetic custody counterparty. */
export function isSyntheticAccountName(accountName: string): boolean {
  return accountName.startsWith(SYNTHETIC_ACCOUNT_PREFIX);
}

/**
 * Derives a deterministic child-account identifier for an exchange sub-wallet.
 *
 * Kraken labels its primary wallet `spot / main`; collapsing to `spot` keeps the identifier stable
 * across exports whose labelling differs cosmetically. Without a wallet designation the venue itself
 * is returned, so no child account is fabricated.
 *
 * @throws if the venue is empty.
 */
export function deriveSubAccountId(venue: string, wallet?: string | null): string {
  const venueNormalised = venue.trim();
  if (venueNormalised.length === 0) {
    throw new Error('deriveSubAccountId requires a non-empty venue');
  }

  const walletNormalised = (wallet ?? '').trim().toLowerCase();
  if (walletNormalised.length === 0) return venueNormalised;

  // Collapse composite labels such as Kraken's "spot / main" to their leading segment.
  const leadingSegment = walletNormalised.split('/')[0]?.trim() ?? walletNormalised;
  if (leadingSegment.length === 0) return venueNormalised;

  return `${venueNormalised}${SUB_ACCOUNT_SEPARATOR}${leadingSegment}`;
}
