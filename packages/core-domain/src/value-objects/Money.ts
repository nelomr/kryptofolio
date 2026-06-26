import Decimal from "decimal.js";

import { preciseAmountSchema } from "@kryptofolio/shared-types";

Decimal.set({ precision: 40 });

export class Money {
  private readonly amount: Decimal;

  constructor(value: string | Decimal) {
    if (typeof value === "string") {
      preciseAmountSchema.parse(value);
      this.amount = new Decimal(value);
    } else if (value instanceof Decimal) {
      this.amount = value;
    } else {
      throw new Error("Money must be initialized with a string or Decimal to prevent precision loss.");
    }
  }
  
  toString(): string {
    return this.amount.toString();
  }
  
  add(other: Money): Money {
    return new Money(this.amount.plus(other.amount));
  }
  
  sub(other: Money): Money {
    return new Money(this.amount.minus(other.amount));
  }
  
  mul(other: Money): Money {
    return new Money(this.amount.times(other.amount));
  }
  
  div(other: Money): Money {
    return new Money(this.amount.dividedBy(other.amount));
  }
  
  equals(other: Money): boolean {
    return this.amount.equals(other.amount);
  }
}
