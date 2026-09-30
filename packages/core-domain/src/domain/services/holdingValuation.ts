import { Money } from "../../value-objects/Money";

export interface ValuationTotals {
  equity: string;
  costBasis: string;
  unrealized: string;
}

export function sumValuedHoldings<T>(
  holdings: readonly T[],
  valueOf: (h: T) => { value: string; costBasis: string } | undefined,
): ValuationTotals {
  let equity = new Money("0");
  let costBasis = new Money("0");

  for (const holding of holdings) {
    const valued = valueOf(holding);
    if (valued === undefined) continue;
    equity = equity.add(new Money(valued.value));
    costBasis = costBasis.add(new Money(valued.costBasis));
  }

  return {
    equity: equity.toFixed(2),
    costBasis: costBasis.toFixed(2),
    unrealized: equity.sub(costBasis).toFixed(2),
  };
}

export function addRealized(totals: ValuationTotals, realized: string): string {
  return new Money(realized).add(new Money(totals.unrealized)).toFixed(2);
}
