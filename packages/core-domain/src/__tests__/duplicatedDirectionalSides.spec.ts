import { describe, expect, it } from "vitest";
import type { TransactionMappedData, ValidTransactionRow } from "@kryptofolio/shared-types";

import { guessColumnMapping, mapToEntity } from "../application/use-cases/AutoMapColumnsUseCase";
import { prepareIngestionRows } from "../domain/services/normalizer/ingestionPipeline";
import { SOURCE_FORMAT_PROFILES } from "../domain/services/sourceProfile/profiles";
import { BIT2ME_CRYPTO_DEPOSIT_ROWS } from "./fixtures/realSourceRows";

const BIT2ME = SOURCE_FORMAT_PROFILES["bit2me-spot"];

/** The real mapping layer, so no fixture maps itself. */
function mapped(
  rows: readonly Readonly<Record<string, string>>[],
): TransactionMappedData[] {
  const headers = Object.keys(rows[0]);
  const mapping = guessColumnMapping(headers);
  return rows.map(
    (row, index) =>
      mapToEntity({ ...row }, mapping, index, "SPOT").mappedData as TransactionMappedData,
  );
}

function through(rows: TransactionMappedData[]): Partial<TransactionMappedData>[] {
  const wrapped: ValidTransactionRow[] = rows.map((mappedData, index) => ({
    id: String(index),
    originalData: {},
    errors: [],
    hasError: false,
    mappedData,
  }));
  return prepareIngestionRows(wrapped, BIT2ME).map((row) => row.mappedData);
}

const depositRows = mapped(BIT2ME_CRYPTO_DEPOSIT_ROWS);

/**
 * A movement has one direction, and a source that writes it onto both directional columns must be
 * normalised to one side before anything derives legs from it.
 *
 * `v_custody_movements` builds its legs as a `UNION ALL` of the outbound and the inbound side, so a row
 * carrying both produced two legs on the same account against the same synthetic counterparty. They
 * netted to exactly zero, which is why nothing flagged them: an imbalance is what the data-quality
 * surface looks for, and there was none. The deposit simply landed nowhere.
 *
 * Compensating for it in the view was rejected — the view must read an already-normalised ledger, or the
 * knowledge that one source duplicates its sides ends up buried in SQL and repeated for the next such
 * source. It is a declared property of the profile instead.
 */
describe("a source that writes one movement onto both sides is reduced before the domain sees it", () => {
  it("reads all eight of the real crypto deposits as duplicating asset and amount", () => {
    expect(depositRows).toHaveLength(8);
    for (const row of depositRows) {
      expect(row.asset_in).toBe(row.asset_out);
      expect(row.amount_in).toBe(row.amount_out);
    }
    const assets = depositRows.map((r) => r.asset_in).sort();
    expect(assets).toEqual(["ADA", "ETH", "HBAR", "HBAR", "HBAR", "HBAR", "USDC", "XRP"]);
  });

  it("persists the destination side only, so each deposit yields one leg and not two netting to zero", () => {
    const prepared = through(depositRows);

    expect(prepared).toHaveLength(8);
    prepared.forEach((row, index) => {
      expect(row.amount_out).toBeUndefined();
      expect(row.asset_out).toBeUndefined();
      expect(row.asset_in).toBe(depositRows[index].asset_in);
      // The destination figure is what actually arrived, at the digits the source wrote it with.
      expect(row.amount_in).toBe(depositRows[index].amount_in);
    });
  });

  it("classifies each of them as inbound custody rather than as funding", () => {
    // Crypto arriving in the user's own wallet is not a taxable event and not a fiat deposit.
    expect(through(depositRows).map((r) => r.tx_type)).toEqual(Array(8).fill("TRANSFER_IN"));
  });

  it("charges no fee for a deposit whose two sides are equal", () => {
    // The two sides differ on a withdrawal, and that difference is the network fee. Equal sides mean
    // nothing was deducted — deriving a fee here would invent a disposal out of a subtraction of zero.
    for (const row of through(depositRows)) {
      expect(row.fee_amount === undefined || row.fee_amount === "0").toBe(true);
    }
  });
});
