import Decimal from "decimal.js";

/**
 * One leg of a candidate collateral movement, as prepared for pairing — the same shape whether it
 * ends up paired or not.
 */
export interface CollateralLegCandidate {
  readonly idHash: string;
  readonly timestamp: string; // ISO-8601 instant
  readonly currency: string;
  readonly amount: string; // signed decimal string
}

function signsOppose(a: Decimal, b: Decimal): boolean {
  return (a.isNegative() && b.isPositive()) || (a.isPositive() && b.isNegative());
}

/**
 * Links the two legs of a genuine collateral conversion, and only those.
 *
 * Measured against the real `kraken_futures.csv`: Kraken's own timestamp resolution is one second,
 * and a burst of conversions triggered together — 109 distinct instants held all 314 legs, up to 14
 * at once — so "exactly two legs share this instant" is false for most of the file's real pairs. What
 * holds for every one of the 157 real pairs is narrower and does not require guessing: within an
 * instant, the source writes each pair as two *adjacent* rows, USD immediately followed by its EUR
 * partner, in the order the file itself carries. Pairing greedily by that adjacency — never by
 * matching amounts or currencies across non-adjacent rows within the same instant — reproduces all
 * 157 real pairs exactly, with nothing invented: a group's structure is either legibly two-at-a-time
 * or it is not, and only the legible case ever produces a pair.
 *
 * A lone leg, an odd leftover, or two adjacent legs that do not oppose in sign and currency all stay
 * unpaired — recording the absence rather than searching further afield for a partner, which is
 * exactly the failure mode this guard exists to prevent.
 *
 * Grouping by instant rather than scanning every combination keeps this linear in the batch size,
 * which matters at the scale of a real export's 157 pairs.
 */
export function pairCollateralLegs(
  candidates: readonly CollateralLegCandidate[],
): ReadonlyMap<string, string> {
  const byInstant = new Map<string, CollateralLegCandidate[]>();
  for (const candidate of candidates) {
    const group = byInstant.get(candidate.timestamp);
    if (group) {
      group.push(candidate);
    } else {
      byInstant.set(candidate.timestamp, [candidate]);
    }
  }

  const pairIds = new Map<string, string>();

  for (const group of byInstant.values()) {
    let i = 0;
    while (i + 1 < group.length) {
      const first = group[i]!;
      const second = group[i + 1]!;
      const opposes = signsOppose(new Decimal(first.amount), new Decimal(second.amount));
      const distinctCurrencies = first.currency !== second.currency;

      if (opposes && distinctCurrencies) {
        // Deterministic regardless of input order, and independent of any process-random source,
        // so re-ingesting the same file assigns the same pair id.
        const [a, b] = [first.idHash, second.idHash].sort();
        pairIds.set(first.idHash, `${a}|${b}`);
        pairIds.set(second.idHash, `${a}|${b}`);
        i += 2;
      } else {
        // `first` does not complete a pair with its neighbour; it is left unpaired and the scan
        // resumes at `second`, so a single irregular row cannot desynchronise the rest of the group.
        i += 1;
      }
    }
  }

  return pairIds;
}
