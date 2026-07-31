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

  /** Defects are data, never an error condition. */
  getDataQuality(accountId?: string): Promise<FifoDataQualityRow[]>;

  /**
   * Fetch Spanish IRPF tax base metrics for a specific year. Flagged events are excluded from the
   * totals and counted in `excludedFlaggedEvents`.
   */
  getSpanishTaxReport(year: number, accountId?: string): Promise<SpanishTaxBaseReport>;
}
