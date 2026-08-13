/**
 * The historical daily FX ledger.
 *
 * Distinct from `IUserSettingsPort`, which holds the single *current* rate as a KV pair: that value
 * cannot value a two-year-old acquisition, and the FIFO engine resolves a rate by date. Distinct
 * from `IExchangeRatePort`, which fetches from the provider and stores nothing.
 */

import type { DailyExchangeRateSource } from '@kryptofolio/shared-types';

/** Whether the row is a rate the ECB published that day, or the prior day's carried forward. */
export type { DailyExchangeRateSource };

export interface DailyExchangeRate {
  /** ISO-8601 date, `YYYY-MM-DD`. Half of the table's primary key. */
  readonly date: string;
  /** `<base>/<quote>`, meaning `quote = base × rate`. The other half of the primary key. */
  readonly pair: string;
  /** Decimal string, never a float — this multiplies a cost basis. */
  readonly rate: string;
  readonly source: DailyExchangeRateSource;
}

/** A closed, inclusive span of ISO-8601 dates for one pair. */
export interface StoredRateDateQuery {
  readonly pair: string;
  /** ISO-8601 `YYYY-MM-DD`, inclusive. */
  readonly from: string;
  /** ISO-8601 `YYYY-MM-DD`, inclusive. */
  readonly to: string;
}

export interface IFxRateLedgerPort {
  /**
   * Writes each rate under one rule, and returns how many rows it actually changed.
   *
   * A rate the ECB published on a date is a historical fact, and silently overwriting it would move
   * a tax figure that may already have been reported. But a carried-forward row is an
   * approximation, and leaving it in place once the real publication is retrieved would make that
   * approximation permanent. So exactly one transition writes:
   *
   * ```
   *   ECB_PRIOR_DAY  ──▶  ECB            replaces  (the fact supersedes the approximation)
   *   ECB            ──▶  ECB            rejected  (a fact is never rewritten, differing rate or not)
   *   ECB            ──▶  ECB_PRIOR_DAY  rejected  (never downgrade)
   *   ECB_PRIOR_DAY  ──▶  ECB_PRIOR_DAY  rejected  (idempotent)
   * ```
   */
  upsertDailyExchangeRates(rates: readonly DailyExchangeRate[]): Promise<number>;

  /**
   * The applicable rate for a date: the most recent row on or before it, or nothing where the
   * ledger reaches no further back.
   *
   * Backward-looking only. A rate published after the date is not the rate that applied on it, and
   * returning one would value a past figure with a future fact.
   */
  getRateAsOf(pair: string, date: string): Promise<DailyExchangeRate | null>;

  /**
   * The dates the ledger holds for a pair within a span, ascending.
   *
   * The half of the gap computation the database owns. Which dates *should* be held is the ECB's
   * statement, not the ledger's, so the two sets meet in a pure function rather than in SQL.
   */
  getStoredRateDates(query: StoredRateDateQuery): Promise<readonly string[]>;
}
