/** One ECB publication day: the date it published on and every quote it published that day. */
export interface EcbPublicationDay {
  /** ISO-8601 `YYYY-MM-DD`. */
  readonly date: string;
  /** Currency code to decimal string, quoted per euro. Precision is whatever the ECB wrote. */
  readonly rates: Readonly<Record<string, string>>;
}

/**
 * Which of the ECB's two history documents answered the request.
 *
 * An efficiency distinction only. Which one is fetched never bounds how far back coverage reaches —
 * that is the request's business, and a document too short for it is escalated, not accepted.
 */
export type EcbHistoryDocument = 'BOUNDED_RECENT' | 'FULL_ARCHIVE';

/**
 * A union rather than a `days` list plus a `complete` flag: "short of the request" is only
 * meaningful alongside how far back the ECB actually reaches, and "covers the request" has no such
 * date to carry. Keeping them apart makes "incomplete but no idea how incomplete" unrepresentable,
 * which is the state a caller would otherwise mistake for a closed gap.
 */
export type HistoricalRatesResult =
  | {
      readonly kind: 'COVERS_REQUEST';
      readonly document: EcbHistoryDocument;
      /** Newest first, as the ECB documents are ordered. */
      readonly days: readonly EcbPublicationDay[];
    }
  | {
      readonly kind: 'SHORT_OF_REQUEST';
      readonly document: EcbHistoryDocument;
      readonly days: readonly EcbPublicationDay[];
      /** The oldest date the ECB has ever published — the request asked for earlier than this. */
      readonly oldestAvailableDate: string;
    };

export interface IExchangeRatePort {
  /**
   * Fetches the latest exchange rates from the provider.
   * Returns an object containing the date of the rates and a map of currency to rate (relative to EUR).
   */
  getLatestRates(): Promise<{
    date: string;
    rates: Record<string, string>;
  }>;

  /**
   * Every publication day from the present back to at least `oldestDateNeeded`, or as far as the
   * ECB's record reaches where that is later.
   *
   * The caller states how far back it needs; the provider chooses the cheapest document that
   * actually contains that date and escalates where it does not.
   */
  getHistoricalRates(oldestDateNeeded: string): Promise<HistoricalRatesResult>;
}
