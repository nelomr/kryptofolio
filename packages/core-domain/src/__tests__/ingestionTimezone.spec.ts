import { describe, expect, it } from "vitest";
import type { ValidTransactionRow } from "@kryptofolio/shared-types";

import { prepareIngestionRows } from "../domain/services/normalizer/ingestionPipeline";
import { SOURCE_FORMAT_PROFILES } from "../domain/services/sourceProfile/profiles";

const KRAKEN = SOURCE_FORMAT_PROFILES["kraken-spot"];

function row(over: Partial<ValidTransactionRow["mappedData"]>): ValidTransactionRow {
  return {
    id: "1",
    originalData: {},
    errors: [],
    hasError: false,
    mappedData: {
      date: "2025-10-07",
      time: "23:40:26",
      tx_type: "deposit",
      amount_in: "500",
      asset_in: "EUR",
      exchange: null,
      description: null,
      metadata: {},
      ...over,
    },
  };
}

/**
 * The zone a file was written in is a fact about the file, and the only place it is known is the
 * request that carried it. Appending `Z` to the source's wall-clock text asserted every export is UTC:
 * a `Europe/Madrid` file moved one or two hours into the future, which reorders a day's operations —
 * and FIFO is an ordering — and moves a late-December operation into the wrong tax year.
 */
describe("the instant is converted from the zone the file was written in", () => {
  it("converts a wall-clock time from the chosen zone, instead of relabelling it as UTC", () => {
    const [prepared] = prepareIngestionRows([row({})], KRAKEN, "Europe/Madrid");

    // 23:40:26 in Madrid on this date is CEST, two hours ahead of UTC.
    expect(prepared.mappedData.timestamp).toBe("2025-10-07T21:40:26.000Z");
  });

  it("leaves a UTC file at the time it states", () => {
    const [prepared] = prepareIngestionRows([row({})], KRAKEN, "UTC");

    expect(prepared.mappedData.timestamp).toBe("2025-10-07T23:40:26.000Z");
  });

  it("lets a row that names its own zone override the file's", () => {
    // One export can mix zones; the request-level choice answers only for rows that state nothing.
    const [prepared] = prepareIngestionRows(
      [row({ timezone: "America/New_York" })],
      KRAKEN,
      "Europe/Madrid",
    );

    expect(prepared.mappedData.timestamp).toBe("2025-10-08T03:40:26.000Z");
  });

  it("orders two operations of one day by their real instants, not their local text", () => {
    // The pair a same-day FIFO match depends on: read as UTC, both keep their written order, but a
    // zone that crosses midnight moves the later one into the next day.
    const [madrid] = prepareIngestionRows([row({ time: "00:30:00" })], KRAKEN, "Europe/Madrid");

    expect(madrid.mappedData.timestamp).toBe("2025-10-06T22:30:00.000Z");
  });
});
