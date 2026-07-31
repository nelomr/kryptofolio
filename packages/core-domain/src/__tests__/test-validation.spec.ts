import { describe, it, expect } from "vitest";
import type { TransactionRow } from "@kryptofolio/shared-types";
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

    // `TransactionRow`'s two arms are keyed on `hasError`, so neither can describe a row on its way
    // *into* validation: the flag is what the call is about to decide.
    const result = validateRow(row as unknown as TransactionRow, 'SPOT');
    expect(result.hasError).toBe(false);
  });
});
