/**
 * Domain Port for the analytical FIFO engine.
 *
 * DOMAIN ISOLATION RULE: no external library imports. Amounts cross this boundary as strings and are
 * converted by the adapters.
 */
import type {
  TaxLotType,
  TaxLotEventType,
  FifoQualityFlag,
  FlagSeverity,
} from '@kryptofolio/shared-types';

export interface SpanishTaxBaseReport {
  year: number;
  savingsBaseYields: string; // STAKING, EARN, DIVIDENDS
  generalBaseAirdrops: string; // AIRDROP, MINING
  spotCapitalGains: string; // Net gains from Spot FIFO
  /**
   * Events excluded from the totals above because they carry a data-quality defect.
   *
   * Reported alongside the figures so an incomplete total is never presented as complete.
   */
  excludedFlaggedEvents: number;
  /**
   * Income rows (staking, airdrops, and the rest of `savings_base_yields`/`general_base_airdrops`)
   * excluded from the totals above because no price could be resolved for them — `total_fiat IS
   * NULL`, not `'0'`. A `SUM` already skips these rows correctly; without this count the total looks
   * complete while quietly missing whatever they were worth.
   */
  excludedUnresolvedIncomeCount: number;
}

/**
 * One leg of a double-entry custody movement.
 *
 * `qty_delta` is a signed decimal string: negative for an outflow, positive for an inflow. The
 * entries for one movement sum to zero per asset, which is what makes custody a balance rather than
 * a pairing heuristic.
 */
export interface CustodyEntryRow {
  id: string;
  tax_lot_id: string;
  asset_id: string;
  account_id: string;
  qty_delta: string;
  occurred_at: string;
  spot_transaction_id: string;
}

/**
 * Where each portion of a lot's quantity currently sits.
 *
 * A lot is never split, re-dated or relocated, so this is a projection over its movements rather
 * than a property of the lot: `TaxLotType.exchange_location` keeps naming the acquiring venue no
 * matter how many accounts the quantity has passed through.
 */
export interface LotCustodyLocationRow {
  tax_lot_id: string;
  asset_id: string;
  account_id: string;
  account_name: string;
  /** True for an `ownwallet-<ASSET>` account: custody arithmetic only, never a user selection. */
  is_synthetic: boolean;
  parent_account_id: string | null;
  qty: string;
}

/**
 * One custody relocation of one lot: a quantity leaving one account for another.
 *
 * Deliberately not a `lot_history_event`. A movement between the user's own accounts consumes
 * nothing and realises nothing, so it never enters the taxation queue — which is exactly why the
 * lot's history has to read this relation as well to answer where the quantity has been.
 */
export interface LotCustodyRelocationRow {
  tax_lot_id: string;
  asset_id: string;
  spot_transaction_id: string | null;
  occurred_at: string;
  qty: string;
  from_account_id: string;
  from_account_name: string;
  from_is_synthetic: boolean;
  to_account_id: string;
  to_account_name: string;
  to_is_synthetic: boolean;
}

/**
 * A single data-quality defect. Advisory: flags are counted and reported, never blocking.
 *
 * `detail_key` is an i18n key rather than prose, so the backend emits no user-facing copy.
 */
export interface FifoDataQualityRow {
  quality_flag: FifoQualityFlag;
  severity: FlagSeverity;
  asset_id: string | null;
  account_id: string | null;
  tx_id: string | null;
  occurred_at: string | null;
  /** i18n key resolved by the UI, e.g. `fifo_quality.missing_price`. */
  detail_key: string;
  /** True when the user can resolve this by assigning a value or declaring a destination. */
  pending_review: boolean;
}

export interface ITaxCalculatorPort {
  /**
   * Run the vectorized FIFO algorithm inside DuckDB and return the computed
   * tax lots and lot history events.
   */
  calculateLotsAndEvents(accountId?: string): Promise<{
    lots: TaxLotType[];
    events: TaxLotEventType[];
  }>;

  /**
   * Which account holds each portion of each lot over time. Uses a per-account FIFO ordering that is
   * independent of, and has no effect on, the global per-asset FIFO used for taxation.
   */
  calculateCustodyEntries(accountId?: string): Promise<CustodyEntryRow[]>;

  /**
   * The current holder of each portion of each lot, resolved through every movement.
   *
   * Separate from `calculateCustodyEntries()`: that returns the individual legs, this returns the
   * net position they add up to, which is what a read path can display without re-summing them.
   */
  getLotCustodyLocations(accountId?: string): Promise<LotCustodyLocationRow[]>;

  /**
   * Every relocation each lot has been through, in order.
   *
   * The companion to `getLotCustodyLocations()`: that answers where a lot is now, this answers where
   * it has been. Level 3 of the holdings table needs both, merged with the lot's disposals.
   */
  getLotCustodyTimeline(accountId?: string): Promise<LotCustodyRelocationRow[]>;

  /** Defects are data, never an error condition. */
  getDataQuality(accountId?: string): Promise<FifoDataQualityRow[]>;

  /**
   * Fetch Spanish IRPF tax base metrics for a specific year. Flagged events are excluded from the
   * totals and counted in `excludedFlaggedEvents`.
   */
  getSpanishTaxReport(year: number, accountId?: string): Promise<SpanishTaxBaseReport>;
}
