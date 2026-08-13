/**
 * Which dates the FX ledger is missing.
 *
 * Lives in the DOMAIN layer. NO external imports (no Decimal.js, no Zod, no SQL).
 *
 * The gap set is an anti-join of the ECB's own publication dates against the dates the ledger
 * holds. It is never derived from a weekday-plus-holiday rule: measured against the real
 * `eurofxref-hist.xml`, 134 weekdays in range carry no publication, and Good Friday and Easter
 * Monday move with the lunar calendar. A calendar rule would report those as gaps forever and
 * refetch them on every boot.
 */

export interface FxCoverageQuery {
  /** Every date the ECB states it published on, in any order — the document is newest-first. */
  readonly publicationDates: readonly string[];
  /** The dates `exchange_rates` already holds for the pair. */
  readonly storedDates: readonly string[];
  /** ISO-8601 `YYYY-MM-DD`, inclusive. */
  readonly from: string;
  /** ISO-8601 `YYYY-MM-DD`, inclusive. */
  readonly to: string;
}

/**
 * The publication dates within the range that the ledger does not hold, ascending and distinct.
 *
 * ISO-8601 dates of equal width order identically as strings and as dates, so no date arithmetic —
 * and no timezone — enters here.
 */
export function findMissingPublicationDates(query: FxCoverageQuery): readonly string[] {
  const held = new Set(query.storedDates);
  const missing = new Set<string>();

  for (const date of query.publicationDates) {
    if (date < query.from || date > query.to) continue;
    if (held.has(date)) continue;
    missing.add(date);
  }

  return [...missing].sort();
}
