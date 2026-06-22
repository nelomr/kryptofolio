import { describe, it, expect } from "vitest";
import { preciseAmountSchema } from "../../src/schemas/transactions";

describe("preciseAmountSchema", () => {
  it("should validate valid decimal strings", () => {
    expect(preciseAmountSchema.safeParse("100").success).toBe(true);
    expect(preciseAmountSchema.safeParse("100.50").success).toBe(true);
    expect(preciseAmountSchema.safeParse("-100.50").success).toBe(true);
    expect(preciseAmountSchema.safeParse("0.000000000000000001").success).toBe(true);
  });

  it("should reject native numbers to prevent floating-point precision loss", () => {
    expect(preciseAmountSchema.safeParse(100).success).toBe(false);
    expect(preciseAmountSchema.safeParse(100.5).success).toBe(false);
  });

  it("should reject invalid strings", () => {
    expect(preciseAmountSchema.safeParse("100.50.20").success).toBe(false);
    expect(preciseAmountSchema.safeParse("abc").success).toBe(false);
    expect(preciseAmountSchema.safeParse("").success).toBe(false);
    expect(preciseAmountSchema.safeParse(" 100").success).toBe(false); // No leading spaces
    expect(preciseAmountSchema.safeParse("100 ").success).toBe(false); // No trailing spaces
  });
});
