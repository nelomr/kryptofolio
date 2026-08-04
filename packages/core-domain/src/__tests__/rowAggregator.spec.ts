import { describe, it, expect } from "vitest";
import { aggregateRows } from "../domain/services/normalizer/rowAggregator";
import { SOURCE_FORMAT_PROFILES } from "../domain/services/sourceProfile/profiles";
import type { ValidTransactionRow } from "@kryptofolio/shared-types";

const KRAKEN = SOURCE_FORMAT_PROFILES["kraken-spot"];
const BIT2ME = SOURCE_FORMAT_PROFILES["bit2me-spot"];
const BITUNIX = SOURCE_FORMAT_PROFILES["bitunix-spot"];

describe("Row Aggregator (Kraken Style)", () => {
  it("should pass through standalone rows", () => {
    const rows: ValidTransactionRow[] = [
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

    const result = aggregateRows(rows, KRAKEN);
    expect(result.length).toBe(1);
    expect(result[0].id).toBe("1");
    expect(result[0].mappedData.amount).toBe("100");
  });

  it("should merge two rows belonging to the same group_id (Kraken spot trade)", () => {
    // Row 1: EUR negative (Spent)
    // Row 2: PUMP positive (Received)
    const rows: ValidTransactionRow[] = [
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

    const result = aggregateRows(rows, KRAKEN);

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

    // The source's own digits: only one leg carries a fee, so there is nothing to add to it.
    expect(merged.mappedData.fee_amount).toBe("17.720");
    expect(merged.mappedData.fee_currency).toBe("PUMP"); // Inherited from the row the fee was on

    // Check metadata merger
    expect(merged.mappedData.metadata?.status).toBe("completed");
    expect(merged.mappedData.metadata?.network).toBe("solana");
  });
});

/**
 * A shared group identifier is not on its own evidence that two rows are one operation. Bit2Me's
 * export carries a `Grupo` column naming a wallet compartment — `earn`, `trading`, `pocket` — and
 * every row of a three-year history shares one of five values. Merging on that alone collapsed 706
 * real rows into 5 transactions.
 *
 * The two legs of a genuine trade are recorded at the same instant, which is what separates them
 * from rows that merely share a category.
 */
describe("Row Aggregator — a shared group is not enough to merge", () => {
  const row = (
    id: string,
    over: Partial<ValidTransactionRow["mappedData"]>
  ): ValidTransactionRow => ({
    id,
    originalData: {},
    errors: [],
    hasError: false,
    mappedData: {
      date: "2025-01-01",
      time: "11:32",
      tx_type: "Staking",
      group_id: "earn",
      exchange: null,
      description: null,
      metadata: {},
      ...over,
    },
  });

  it("does not merge rows that share a group but happened at different times", () => {
    const rows = [
      row("a", { amount_in: "0.2229808", asset_in: "B2M", date: "2025-01-01" }),
      row("b", { amount_in: "0.22769732", asset_in: "B2M", date: "2025-01-02" }),
      row("c", { amount_in: "0.12006884", asset_in: "HBAR", date: "2025-01-06" }),
    ];

    const result = aggregateRows(rows, KRAKEN);

    expect(result).toHaveLength(3);
    expect(result.map((r) => r.id).sort()).toEqual(["a", "b", "c"]);
  });

  it("keeps every quantity when a category group is not merged", () => {
    // The collapse discarded all but the first row's amount, so the totals silently shrank.
    const rows = [
      row("a", { amount_in: "0.2229808", asset_in: "B2M", date: "2025-01-01" }),
      row("b", { amount_in: "0.22769732", asset_in: "B2M", date: "2025-01-02" }),
    ];

    const result = aggregateRows(rows, KRAKEN);
    const total = result.reduce((sum, r) => sum + Number(r.mappedData.amount_in ?? 0), 0);

    expect(total).toBeCloseTo(0.45067812, 8);
  });

  it("still merges the two legs of a trade recorded at the same instant", () => {
    const rows = [
      row("a", { tx_type: "trade", group_id: "REF-1", amount: "-100", asset: "EUR", time: "07:47" }),
      row("b", { tx_type: "trade", group_id: "REF-1", amount: "219.87", asset: "XLM", time: "07:47" }),
    ];

    const result = aggregateRows(rows, KRAKEN);

    expect(result).toHaveLength(1);
    expect(result[0].mappedData.asset_out).toBe("EUR");
    expect(result[0].mappedData.asset_in).toBe("XLM");
  });

  it("does not merge a same-asset pair into a self-swap", () => {
    // 100 EUR in and 100 EUR out is a movement between compartments, not a trade. Merging it
    // produces a record that both spends and receives the same asset.
    const rows = [
      row("a", { tx_type: "Deposit", group_id: "bank-transfer", amount_in: "100", asset_in: "EUR" }),
      row("b", { tx_type: "Deposit", group_id: "bank-transfer", amount_out: "100", asset_out: "EUR" }),
    ];

    const result = aggregateRows(rows, KRAKEN);

    for (const r of result) {
      const { asset_in, asset_out } = r.mappedData;
      const collapsed = asset_in !== undefined && asset_in === asset_out;
      expect(collapsed).toBe(false);
    }
  });
});

/**
 * Merging two legs means merging two fees, and a fee is a quantity of a named unit.
 *
 * The arithmetic was `Number(acc.fee_amount || 0) + Math.abs(Number(data.fee_amount))`, and the label
 * was whichever leg came last — so a sum could be recorded in a unit it was never charged in.
 */
describe("Row Aggregator — merging fees is arithmetic on denominated quantities", () => {
  const leg = (
    id: string,
    over: Partial<ValidTransactionRow["mappedData"]>
  ): ValidTransactionRow => ({
    id,
    originalData: {},
    errors: [],
    hasError: false,
    mappedData: {
      date: "2025-03-01",
      time: "10:00",
      tx_type: "trade",
      group_id: "REF-FEE",
      exchange: null,
      description: null,
      metadata: {},
      ...over,
    },
  });

  it("adds two fees in the same unit exactly, where a float would not", () => {
    const rows = [
      leg("a", { amount: "-100", asset: "EUR", fee_amount: "0.1", fee_currency: "EUR" }),
      leg("b", { amount: "219.87", asset: "XLM", fee_amount: "0.2", fee_currency: "EUR" }),
    ];

    // A source that names its fee currency per row is the only kind whose two legs can agree on one.
    const merged = aggregateRows(rows, BITUNIX)[0];
    expect(merged.mappedData.fee_amount).toBe("0.3");
    expect(merged.mappedData.fee_amount).not.toBe(String(0.1 + 0.2));
    expect(merged.mappedData.fee_currency).toBe("EUR");
  });

  it("keeps a lone fee's digits verbatim instead of putting them through arithmetic", () => {
    const rows = [
      leg("a", { amount: "-50", asset: "EUR" }),
      leg("b", { amount: "7704.16", asset: "PUMP", fee_amount: "17.720" }),
    ];

    const merged = aggregateRows(rows, KRAKEN)[0];
    expect(merged.mappedData.fee_amount).toBe("17.720");
  });

  it("refuses to combine fees charged in different units, rather than summing them under one label", () => {
    const rows = [
      leg("a", { amount: "-100", asset: "EUR", fee_amount: "0.1", fee_currency: "EUR" }),
      leg("b", { amount: "219.87", asset: "XLM", fee_amount: "0.2", fee_currency: "XLM" }),
    ];

    const [merged] = aggregateRows(rows, BITUNIX);
    expect(merged.hasError).toBe(true);
    expect(merged.errors.join(" ")).toContain("EUR");
    expect(merged.errors.join(" ")).toContain("XLM");
    // Neither figure is invented into the other's unit.
    expect(merged.mappedData.fee_amount).not.toBe("0.3");
  });

  it("resolves each leg's unit through the profile rather than reading the last column value", () => {
    // Kraken names no fee currency at all: each leg's unit is the asset that leg moves, so two
    // fee-bearing legs of one trade are charged in two different units.
    const rows = [
      leg("a", { amount: "-50", asset: "EUR", fee_amount: "0.05" }),
      leg("b", { amount: "7704.16", asset: "PUMP", fee_amount: "17.720" }),
    ];

    const [merged] = aggregateRows(rows, KRAKEN);
    expect(merged.hasError).toBe(true);
    expect(merged.errors.join(" ")).toContain("PUMP");
  });

  it("treats a leg with an explicit zero fee as carrying no unit to disagree about", () => {
    // 22 real Kraken rows and 18 Bitvavo rows write an explicit `0`; a merge must not flag them.
    const rows = [
      leg("a", { amount: "-50", asset: "EUR", fee_amount: "0" }),
      leg("b", { amount: "7704.16", asset: "PUMP", fee_amount: "17.720" }),
    ];

    const [merged] = aggregateRows(rows, KRAKEN);
    expect(merged.hasError).toBe(false);
    expect(merged.mappedData.fee_amount).toBe("17.720");
    expect(merged.mappedData.fee_currency).toBe("PUMP");
  });

  it("keeps a merged fee's sign, since a credited fee is not a charge", () => {
    const rows = [
      leg("a", { amount: "-100", asset: "EUR", fee_amount: "-0.5", fee_currency: "EUR" }),
      leg("b", { amount: "219.87", asset: "XLM" }),
    ];

    const merged = aggregateRows(rows, BIT2ME)[0];
    expect(merged.mappedData.fee_amount).toBe("-0.5");
  });
});
