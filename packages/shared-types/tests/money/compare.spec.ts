import { describe, it, expect } from "vitest";
import { compareDecimalStrings, preciseAmountFromNumber } from "../../src/money/compare";
import { preciseAmountSchema } from "../../src/schemas/transactions";

describe("compareDecimalStrings", () => {
  it("returns 0 for equal decimal strings", () => {
    expect(compareDecimalStrings("0.3", "0.3")).toBe(0);
  });

  it("returns -1 when the first is smaller", () => {
    expect(compareDecimalStrings("-0.00000001", "0")).toBe(-1);
  });

  it("returns 1 when the first is larger, past the float rounding boundary", () => {
    expect(compareDecimalStrings("0.30000000000000004", "0.3")).toBe(1);
  });

  it("does not underflow a tiny value to zero the way Number() does", () => {
    expect(Number("1e-400")).toBe(0);
    expect(compareDecimalStrings("1e-400", "0")).toBe(1);
  });
});

describe("preciseAmountFromNumber", () => {
  it("returns a string, not a Money", () => {
    expect(typeof preciseAmountFromNumber(1)).toBe("string");
  });

  it("produces a non-exponential string satisfying preciseAmountSchema for a tiny value", () => {
    const result = preciseAmountFromNumber(1e-7);
    expect(result).toBe("0.0000001");
    expect(() => preciseAmountSchema.parse(result)).not.toThrow();
  });

  it("pins the reason the helper exists: String(1e-7) is rejected by preciseAmountSchema", () => {
    expect(() => preciseAmountSchema.parse(String(1e-7))).toThrow();
  });

  it("handles a large value", () => {
    const result = preciseAmountFromNumber(1e21);
    expect(() => preciseAmountSchema.parse(result)).not.toThrow();
  });

  it("handles a float artifact (0.1 + 0.2)", () => {
    const result = preciseAmountFromNumber(0.1 + 0.2);
    expect(() => preciseAmountSchema.parse(result)).not.toThrow();
  });

  it("handles a repeating fraction (1/3)", () => {
    const result = preciseAmountFromNumber(1 / 3);
    expect(() => preciseAmountSchema.parse(result)).not.toThrow();
  });

  it("handles a negative value", () => {
    const result = preciseAmountFromNumber(-4.5);
    expect(() => preciseAmountSchema.parse(result)).not.toThrow();
  });

  it("handles zero", () => {
    const result = preciseAmountFromNumber(0);
    expect(() => preciseAmountSchema.parse(result)).not.toThrow();
  });
});
