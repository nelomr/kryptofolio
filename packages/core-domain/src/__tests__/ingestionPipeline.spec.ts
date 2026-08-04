import { describe, expect, it } from "vitest";
import type { ValidTransactionRow } from "@kryptofolio/shared-types";

import { prepareIngestionRows } from "../domain/services/normalizer/ingestionPipeline";
import { SOURCE_FORMAT_PROFILES } from "../domain/services/sourceProfile/profiles";

const KRAKEN = SOURCE_FORMAT_PROFILES["kraken-spot"];

const leg = (
  id: string,
  over: Partial<ValidTransactionRow["mappedData"]>
): ValidTransactionRow => ({
  id,
  originalData: {},
  errors: [],
  hasError: false,
  mappedData: {
    tx_type: null,
    timestamp: "2025-10-07T23:40:26Z",
    group_id: "TKU627-44BLQ-5CPE3L",
    exchange: null,
    description: null,
    metadata: { subclass: "crypto" },
    ...over,
  },
});

/**
 * The order of these two steps is the whole subject.
 *
 * Aggregation redistributes a leg's signed `amount` into the directional fields and drops it, so a
 * classifier running afterwards is handed a record with no sign left to read: it answers
 * `UNCLASSIFIED` for the very case it exists to resolve, and the label reaches the ledger mapper raw.
 */
describe("prepareIngestionRows — direction is resolved before anything is grouped", () => {
  it("gives each leg of a same-asset movement the direction its own sign states", () => {
    const rows = prepareIngestionRows(
      [
        leg("a", { tx_type: "transfer", amount: "-100", asset: "XRP" }),
        leg("b", { tx_type: "transfer", amount: "100", asset: "XRP" }),
      ],
      KRAKEN, 'UTC',
    );

    expect(rows).toHaveLength(2);
    const byType = new Map(rows.map((r) => [r.mappedData.tx_type, r.mappedData]));
    expect([...byType.keys()].sort()).toEqual(["TRANSFER_IN", "TRANSFER_OUT"]);
    expect(byType.get("TRANSFER_OUT")?.amount_out).toBe("100");
    expect(byType.get("TRANSFER_OUT")?.asset_out).toBe("XRP");
    expect(byType.get("TRANSFER_IN")?.amount_in).toBe("100");
    expect(byType.get("TRANSFER_IN")?.asset_in).toBe("XRP");
  });

  it("leaves no leg unclassified for want of a field a later step removed", () => {
    const rows = prepareIngestionRows(
      [
        leg("a", { tx_type: "transfer", amount: "-100", asset: "XRP" }),
        leg("b", { tx_type: "transfer", amount: "100", asset: "XRP" }),
      ],
      KRAKEN, 'UTC',
    );

    // A raw label surviving to the ledger mapper is how a refusal to classify is reported. None of
    // these rows may carry one.
    for (const row of rows) {
      expect(row.mappedData.tx_type).not.toBe("transfer");
    }
  });

  it("still merges the two legs of a genuine trade into one record", () => {
    const rows = prepareIngestionRows(
      [
        leg("c", { tx_type: "trade", group_id: "REF-TRADE", amount: "-300", asset: "EUR" }),
        leg("d", { tx_type: "trade", group_id: "REF-TRADE", amount: "247.10551", asset: "XRP" }),
      ],
      KRAKEN, 'UTC',
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].mappedData.asset_out).toBe("EUR");
    expect(rows[0].mappedData.amount_out).toBe("300");
    expect(rows[0].mappedData.asset_in).toBe("XRP");
    expect(rows[0].mappedData.amount_in).toBe("247.10551");
  });

  it("resolves a fiat movement as funding and a crypto one as custody, from the same label", () => {
    const rows = prepareIngestionRows(
      [
        leg("a", {
          tx_type: "deposit",
          amount: "500",
          asset: "EUR",
          group_id: null,
          metadata: { subclass: "fiat" },
        }),
        leg("b", { tx_type: "deposit", amount: "179.11", asset: "XRP", group_id: null }),
      ],
      KRAKEN, 'UTC',
    );

    expect(rows.map((r) => r.mappedData.tx_type).sort()).toEqual(["DEPOSIT", "TRANSFER_IN"]);
  });

  it("keeps a group whose legs carry fees in two units refused rather than merged", () => {
    const rows = prepareIngestionRows(
      [
        leg("a", { tx_type: "trade", group_id: "REF-FEE", amount: "-50", asset: "EUR", fee_amount: "0.05" }),
        leg("b", { tx_type: "trade", group_id: "REF-FEE", amount: "7704.16", asset: "PUMP", fee_amount: "17.720" }),
      ],
      KRAKEN, 'UTC',
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].hasError).toBe(true);
    expect(rows[0].errors.join(" ")).toContain("fee_denomination_conflict");
  });
});
