import { Money } from "../../value-objects/Money";

export type HoldingRanking<T> = {
  ranked: readonly T[];
  omittedCount: number;
  unvalued: readonly T[];
};

export function rankHoldingsByValue<T>(
  holdings: readonly T[],
  valueOf: (h: T) => string | undefined,
  topN: number,
): HoldingRanking<T> {
  const valued: Array<{ holding: T; money: Money }> = [];
  const unvalued: T[] = [];

  for (const holding of holdings) {
    const value = valueOf(holding);
    if (value === undefined) {
      unvalued.push(holding);
    } else {
      valued.push({ holding, money: new Money(value) });
    }
  }

  valued.sort((a, b) => b.money.compareTo(a.money));

  const ranked = valued.slice(0, topN).map((entry) => entry.holding);
  const omittedCount = Math.max(valued.length - topN, 0);

  return { ranked, omittedCount, unvalued };
}
