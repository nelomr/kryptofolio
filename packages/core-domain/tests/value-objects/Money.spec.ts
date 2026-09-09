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

  describe("sign predicates", () => {
    it("isPositive/isNegative/isZero classify a positive amount", () => {
      const money = new Money("1.5");
      expect(money.isPositive()).toBe(true);
      expect(money.isNegative()).toBe(false);
      expect(money.isZero()).toBe(false);
    });

    it("isPositive/isNegative/isZero classify a negative amount", () => {
      const money = new Money("-0.00000001");
      expect(money.isPositive()).toBe(false);
      expect(money.isNegative()).toBe(true);
      expect(money.isZero()).toBe(false);
    });

    it("isPositive/isNegative/isZero classify zero, including a trailing-zero form", () => {
      const money = new Money("0.0");
      expect(money.isPositive()).toBe(false);
      expect(money.isNegative()).toBe(false);
      expect(money.isZero()).toBe(true);
    });
  });

  describe("compareTo", () => {
    it("returns -1 when this is less than other", () => {
      expect(new Money("1").compareTo(new Money("2"))).toBe(-1);
    });

    it("returns 0 when equal", () => {
      expect(new Money("2").compareTo(new Money("2"))).toBe(0);
    });

    it("returns 1 when this is greater than other", () => {
      expect(new Money("3").compareTo(new Money("2"))).toBe(1);
    });

    it("distinguishes values differing only past the two-decimal display boundary", () => {
      expect(new Money("1.001").compareTo(new Money("1.002"))).toBe(-1);
    });

    it("compares exactly where the float path would not: 0.1 + 0.2 vs 0.3", () => {
      expect(0.1 + 0.2).not.toBe(0.3);
      const sum = new Money("0.1").add(new Money("0.2"));
      expect(sum.compareTo(new Money("0.3"))).toBe(0);
    });
  });

  describe("toFixed", () => {
    it("pads to the requested decimal places, exact", () => {
      expect(new Money("179.11").toFixed(4)).toBe("179.1100");
    });

    it("does not round away real precision within the requested places", () => {
      expect(new Money("0.005").toFixed(8)).toBe("0.00500000");
    });

    it("never renders in exponential notation for a very small amount", () => {
      expect(new Money("0.0000001").toFixed()).not.toMatch(/e/i);
    });
  });
});
