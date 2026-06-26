import { describe, it, expect } from "vitest";
import { validateRow } from "../application/use-cases/AutoMapColumnsUseCase";

describe("Validation Test", () => {
  it("should output validation errors", () => {
    const row = {
      id: "test",
      originalData: { date: "2023-01-01", type: "Buy", amount: "1", asset: "BTC" },
      mappedData: {
        date: "2023-01-01",
        tx_type: "Buy",
        amount: "1",
        asset: "BTC"
      },
      errors: [],
      hasError: false
    };

    const result = validateRow(row as any, 'SPOT');
    console.log("VALIDATION RESULT: ", JSON.stringify(result, null, 2));
    expect(result.hasError).toBe(false);
  });
});
