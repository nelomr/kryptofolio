import { describe, expect, it } from "vitest";
import type { ValidTransactionRow } from "@kryptofolio/shared-types";

import { guessColumnMapping, mapToEntity } from "../application/use-cases/AutoMapColumnsUseCase";
import { prepareIngestionRows } from "../domain/services/normalizer/ingestionPipeline";
import { SOURCE_FORMAT_PROFILES } from "../domain/services/sourceProfile/profiles";
import { KRAKEN_SPOT_ROWS } from "./fixtures/realSourceRows";

const KRAKEN = SOURCE_FORMAT_PROFILES["kraken-spot"];

function prepared(): ReturnType<typeof prepareIngestionRows> {
  const headers = Object.keys(KRAKEN_SPOT_ROWS[0]);
  const mapping = guessColumnMapping(headers);
  const rows = KRAKEN_SPOT_ROWS.map(
    (row, index) => mapToEntity({ ...row }, mapping, index, "SPOT") as ValidTransactionRow,
  );
  return prepareIngestionRows(rows, KRAKEN, "UTC");
}

/**
 * `trade` names an operation without naming its direction, and Kraken writes it on both legs of every
 * trade it exports — a purchase and a sale are the same word. The direction exists only in which side
 * each leg landed on, so it can only be read once the legs are one record.
 *
 * Mapping the word to `BUY` recorded every sale in the corpus as an acquisition: the label contradicted
 * the very sides the same record carried, and no `SELL` reached the ledger from any Kraken file.
 */
describe("a trade's direction comes from its legs", () => {
  it("reads a sale: the asset left and money came back", () => {
    const sale = prepared().find((row) => row.mappedData.asset_out === "ENA");

    expect(sale).toBeDefined();
    expect(sale!.mappedData.amount_out).toBe("957.64750");
    expect(sale!.mappedData.asset_in).toBe("EUR");
    expect(sale!.mappedData.tx_type).toBe("SELL");
  });

  it("reads a purchase: money left and the asset came in", () => {
    const purchase = prepared().find((row) => row.mappedData.asset_in === "PUMP");

    expect(purchase).toBeDefined();
    expect(purchase!.mappedData.asset_out).toBe("EUR");
    expect(purchase!.mappedData.tx_type).toBe("BUY");
  });

  it("no longer reports a Kraken file as containing only purchases", () => {
    const types = new Set(prepared().map((row) => row.mappedData.tx_type));

    expect(types).toContain("SELL");
    expect(types).toContain("BUY");
  });
});

/**
 * The two cases that must not be guessed. A record the pipeline cannot resolve keeps the source's own
 * word, which `toSpotTxType` rejects by name — the loud failure the whole phase exists to preserve.
 */
describe("a direction that cannot be read is not invented", () => {
  const leg = (
    id: string,
    over: Partial<ValidTransactionRow["mappedData"]>,
  ): ValidTransactionRow => ({
    id,
    originalData: {},
    errors: [],
    hasError: false,
    mappedData: {
      date: "2025-04-02",
      time: "09:15:00",
      tx_type: "trade",
      group_id: "REF-SWAP",
      exchange: null,
      description: null,
      metadata: {},
      ...over,
    },
  });

  it("calls an asset traded for another asset a swap, not a purchase", () => {
    const rows = [
      leg("a", { amount: "-1200", asset: "USDT" }),
      leg("b", { amount: "0.0134", asset: "BTC" }),
    ];

    const [swap] = prepareIngestionRows(rows, KRAKEN, "UTC");

    expect(swap.mappedData.asset_out).toBe("USDT");
    expect(swap.mappedData.asset_in).toBe("BTC");
    expect(swap.mappedData.tx_type).toBe("SWAP");
  });

  it("keeps the source's word when only one side of the trade is known", () => {
    const [lonely] = prepareIngestionRows(
      [leg("a", { amount: "-1200", asset: "USDT", group_id: "REF-ALONE" })],
      KRAKEN,
      "UTC",
    );

    expect(lonely.mappedData.asset_in).toBeUndefined();
    expect(lonely.mappedData.tx_type).toBe("TRADE");
  });
});
