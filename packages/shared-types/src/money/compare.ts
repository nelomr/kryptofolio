import Decimal from "decimal.js";

export function compareDecimalStrings(a: string, b: string): -1 | 0 | 1 {
  return new Decimal(a).comparedTo(new Decimal(b)) as -1 | 0 | 1;
}

export function preciseAmountFromNumber(value: number): string {
  return new Decimal(value).toFixed();
}
