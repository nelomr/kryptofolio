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
  FiatCurrency,
  ConvertedAmount,
  DisposalType,
  FiscalClassificationFlag,
  ManualValueProvenance,
} from '@kryptofolio/shared-types';

/**
 * An event of the reported period that could not be expressed in the report's currency.
 *
 * Named rather than counted, because the remedy is specific: the user has to know which disposal or
 * which reward is missing from the base to judge whether the report can be filed at all. It carries
 * the native figure for the same reason — "we could not convert 70 dollars" and "this earned
 * nothing" are different statements, and a zero says the second one.
 *
 * Not a `FifoQualityFlag`: the lot is sound and it is the *view* that cannot express it. The flag
 * column is written at materialisation time, when the display currency is not yet known.
 */
export interface UnconvertibleTaxEvent {
  id: string;
  /** The date whose rate was sought and not found. */
  occurredOn: string;
  nativeAmount: string;
  nativeCurrency: string;
}

/**
 * How the report's figures reached the currency it states.
 *
 * A union rather than a boolean beside a currency, because the two states carry different claims: a
 * native report is a record, a converted one is a derivation whose method has to be stated. The
 * basis is not a parameter of the union — every figure converts at its own event's date, and a
 * report offering a choice of basis would be offering a choice of answer.
 */
export type TaxReportConversion = { kind: 'NATIVE' } | { kind: 'CONVERTED' };

/**
 * Which disposals a converted read covers.
 *
 * A union rather than an optional year, because the two callers want genuinely different sets: the
 * IRPF report is defined by a fiscal year, and a token's history is defined by the token and spans
 * every year it existed. An optional year would let "no year" mean either, and the caller that
 * forgot to pass one would silently get the other.
 */
export type DisposalEventScope =
  | { kind: 'FISCAL_YEAR'; year: number }
  | { kind: 'ALL_TIME' };

/**
 * One disposal event with its monetary figures already expressed in the requested currency.
 *
 * Separate from `calculateLotsAndEvents` on purpose, and the separation is load-bearing: that method
 * is what `FifoMaterializerService` persists from, and the display currency does not exist at
 * materialisation time. See `design.md`, Decision 14.
 *
 * `null` on a figure means the engine never resolved a price for it — a third state, distinct from a
 * figure that exists but could not be converted, which reports as `UNCONVERTIBLE`. The two have
 * different remedies: a missing price is resolved by valuing the event, a missing rate by fetching
 * one.
 */
export interface ConvertedDisposalEvent {
  id: string;
  /** The lot this disposal consumed from. The token history groups its rows by it. */
  taxLotId: string;
  disposalDate: string;
  amountFromLot: string;
  salePrice: ConvertedAmount | null;
  gainLoss: ConvertedAmount | null;
  isTaxable: boolean;
  disposalType: DisposalType;
  flag: FiscalClassificationFlag | null;
  qualityFlag: FifoQualityFlag | null;
  valueProvenance?: ManualValueProvenance;
  /**
   * The FIFO's own conversion — market-price currency into the transaction's `fiat_currency` — kept
   * under its original name. The display hop's rate travels inside `ConvertedAmount`, so the two are
   * never mistaken for one another.
   */
  fxRate: string | null;
  fxRateDate: string | null;
  notes?: string;
  assetSymbol?: string;
  exchangeName?: string;
}

export interface SpanishTaxBaseReport {
  year: number;
  /**
   * The currency every figure below is expressed in.
   *
   * Returned rather than assumed by the caller: a report is filed, and a euro total and a dollar
   * total are indistinguishable as numbers. The bases are converted at each event's own date, so
   * this is a statement about the whole report, not about a single rate.
   */
  currency: FiatCurrency;
  /** Whether any figure below was converted to reach that currency, which the report must state. */
  conversion: TaxReportConversion;
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
  /**
   * The events held out of the bases above because no rate covered their date.
   *
   * Empty means the period is fully convertible; non-empty means every total above is missing what
   * these events were worth. Deliberately not accompanied by an `incomplete` boolean — a flag
   * derivable from the list is a second source of truth that can disagree with it.
   */
  unconvertibleEvents: readonly UnconvertibleTaxEvent[];
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
   *
   * `displayCurrency` is required, and deliberately not defaulted here: every base is a sum of
   * completed events converted at each event's own date, so a caller that has not decided which
   * currency it is filing in has not yet asked a well-formed question.
   */
  getSpanishTaxReport(
    year: number,
    accountId: string | undefined,
    displayCurrency: string,
  ): Promise<SpanishTaxBaseReport>;

  /**
   * The disposal events of a year with their figures in `displayCurrency`, each converted at its own
   * disposal date.
   *
   * The read path for anything a user sees per event. `calculateLotsAndEvents` remains the native
   * read and the only one materialisation may use.
   */
  getConvertedDisposalEvents(
    scope: DisposalEventScope,
    accountId: string | undefined,
    displayCurrency: string,
  ): Promise<readonly ConvertedDisposalEvent[]>;
}
