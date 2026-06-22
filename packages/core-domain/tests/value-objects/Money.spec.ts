import { describe, it, expect } from "vitest";
import { Money } from "../../src/value-objects/Money";

describe("Money Value Object", () => {
  it("should construct from string without precision loss", () => {
    const money = new Money("1.000000000000000001");
    expect(money.toString()).toBe("1.000000000000000001");
  });

  it("should fail when constructed from a number", () => {
    expect(() => new Money(1.000000000000000001 as any)).toThrow();
  });

  it("should add amounts correctly", () => {
    const a = new Money("0.1");
    const b = new Money("0.2");
    expect(a.add(b).toString()).toBe("0.3");
  });

  it("should subtract amounts correctly", () => {
    const a = new Money("0.3");
    const b = new Money("0.2");
    expect(a.sub(b).toString()).toBe("0.1");
  });

  it("should multiply amounts correctly", () => {
    const a = new Money("0.2");
    const b = new Money("3");
    expect(a.mul(b).toString()).toBe("0.6");
  });

  it("should divide amounts correctly", () => {
    const a = new Money("10");
    const b = new Money("3");
    // precision testing is tricky, we might want to pass precision
    expect(a.div(b).toString().startsWith("3.33333333")).toBe(true);
  });

  it("The 'Dust' test: split 1 ETH into 10,000 micro-amounts and sum back exactly", () => {
    const total = new Money("1.000000000000000000");
    const splitCount = 10000;
    const splitAmount = total.div(new Money(splitCount.toString()));
    
    expect(splitAmount.toString()).toBe("0.0001");

    let sum = new Money("0");
    for (let i = 0; i < splitCount; i++) {
      sum = sum.add(splitAmount);
    }

    expect(sum.toString()).toBe("1");
    expect(sum.equals(total)).toBe(true);
  });
});
