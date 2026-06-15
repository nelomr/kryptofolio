import { describe, it, expect } from "vitest";
import { aggregateRows } from "../normalizer/rowAggregator";
import type { TransactionRow } from "../../types";

describe("Row Aggregator (Kraken Style)", () => {
  it("should pass through standalone rows", () => {
    const rows: TransactionRow[] = [
      {
        id: "1",
        originalData: {},
        errors: [],
        hasError: false,
        mappedData: {
          date: "2023-01-01",
          time: "12:00",
          tx_type: "deposit",
          amount: "100",
          asset: "EUR",
          group_id: "standalone-refid",
          exchange: null,
          description: null,
          metadata: {},
        },
      },
    ];

    const result = aggregateRows(rows);
    expect(result.length).toBe(1);
    expect(result[0].id).toBe("1");
    expect(result[0].mappedData.amount).toBe("100");
  });

  it("should merge two rows belonging to the same group_id (Kraken spot trade)", () => {
    // Row 1: EUR negative (Spent)
    // Row 2: PUMP positive (Received)
    const rows: TransactionRow[] = [
      {
        id: "1",
        originalData: { foo: "bar" },
        errors: [],
        hasError: false,
        mappedData: {
          date: "2023-09-19",
          time: "01:38:34",
          tx_type: "trade",
          amount: "-50",
          asset: "EUR",
          group_id: "TTE7DJ-SLH4A-HWU24P",
          exchange: null,
          description: null,
          metadata: { status: "completed" },
        },
      },
      {
        id: "2",
        originalData: {},
        errors: [],
        hasError: false,
        mappedData: {
          date: "2023-09-19",
          time: "01:38:34",
          tx_type: "trade",
          amount: "7704.16",
          asset: "PUMP",
          fee_amount: "17.720",
          group_id: "TTE7DJ-SLH4A-HWU24P",
          exchange: null,
          description: null,
          metadata: { network: "solana" },
        },
      },
    ];

    const result = aggregateRows(rows);

    // Should merge into 1 row
    expect(result.length).toBe(1);

    const merged = result[0];
    expect(merged.id).toBe("merged-TTE7DJ-SLH4A-HWU24P");

    // Check directional assignments
    expect(merged.mappedData.amount_out).toBe("50");
    expect(merged.mappedData.asset_out).toBe("EUR");
    expect(merged.mappedData.amount_in).toBe("7704.16");
    expect(merged.mappedData.asset_in).toBe("PUMP");

    // Generic amount/asset should be cleared
    expect(merged.mappedData.amount).toBeUndefined();
    expect(merged.mappedData.asset).toBeUndefined();

    // Check fees
    expect(merged.mappedData.fee_amount).toBe("17.72");
    expect(merged.mappedData.fee_currency).toBe("PUMP"); // Inherited from the row the fee was on

    // Check metadata merger
    expect(merged.mappedData.metadata?.status).toBe("completed");
    expect(merged.mappedData.metadata?.network).toBe("solana");
  });
});
