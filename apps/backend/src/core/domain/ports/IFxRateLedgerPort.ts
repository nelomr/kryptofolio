/**
 * The historical daily FX ledger.
 *
 * Distinct from `IUserSettingsPort`, which holds the single *current* rate as a KV pair: that value
 * cannot value a two-year-old acquisition, and the FIFO engine resolves a rate by date. Distinct
 * from `IExchangeRatePort`, which fetches from the provider and stores nothing.
 */

/** Whether the row is a rate the ECB published that day, or the prior day's carried forward. */
export type DailyExchangeRateSource = 'ECB' | 'ECB_PRIOR_DAY';

export interface DailyExchangeRate {
  /** ISO-8601 date, `YYYY-MM-DD`. Half of the table's primary key. */
  readonly date: string;
  /** `<base>/<quote>`, meaning `quote = base × rate`. The other half of the primary key. */
  readonly pair: string;
  /** Decimal string, never a float — this multiplies a cost basis. */
  readonly rate: string;
  readonly source: DailyExchangeRateSource;
}

export interface IFxRateLedgerPort {
  /**
   * Inserts each rate, ignoring any `(date, pair)` already present, and returns how many rows were
   * newly written.
   *
   * Ignore rather than replace: a rate the ECB published on a date is a historical fact, and
   * silently overwriting it would move a tax figure that has already been reported.
   */
  upsertDailyExchangeRates(rates: readonly DailyExchangeRate[]): Promise<number>;
}
