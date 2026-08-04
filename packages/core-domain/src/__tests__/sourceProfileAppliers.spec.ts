import { describe, expect, it } from "vitest";
import type { TransactionMappedData } from "@kryptofolio/shared-types";

import { guessColumnMapping, mapToEntity } from "../application/use-cases/AutoMapColumnsUseCase";
import { SOURCE_FORMAT_PROFILES } from "../domain/services/sourceProfile/profiles";
import {
  applyProfileToRow,
  checkProfileInvariant,
  isMergeKey,
  reduceDirectionalSides,
  resolveFeeDenomination,
  resolveGrossNetFee,
} from "../domain/services/sourceProfile/appliers";
import {
  BIT2ME_ROWS,
  BITUNIX_ROWS,
  BITVAVO_ROWS,
  KRAKEN_SPOT_ROWS,
  TANGEM_ROWS,
} from "./fixtures/realSourceRows";

/** Drives real rows through the real mapping layer, so no fixture maps itself. */
function mapped(
  rows: readonly Readonly<Record<string, string>>[],
): TransactionMappedData[] {
  const headers = Object.keys(rows[0]);
  const mapping = guessColumnMapping(headers);
  return rows.map(
    (row, index) => mapToEntity({ ...row }, mapping, index, "SPOT").mappedData as TransactionMappedData,
  );
}

const krakenRows = mapped(KRAKEN_SPOT_ROWS);
const bitvavoRows = mapped(BITVAVO_ROWS);
const bitunixRows = mapped(BITUNIX_ROWS);
const bit2meRows = mapped(BIT2ME_ROWS);
const tangemRows = mapped(TANGEM_ROWS);

const KRAKEN = SOURCE_FORMAT_PROFILES["kraken-spot"];
const BITVAVO = SOURCE_FORMAT_PROFILES["bitvavo-spot"];
const BITUNIX = SOURCE_FORMAT_PROFILES["bitunix-spot"];
const BIT2ME = SOURCE_FORMAT_PROFILES["bit2me-spot"];
const TANGEM = SOURCE_FORMAT_PROFILES.tangem;
const GENERIC = SOURCE_FORMAT_PROFILES.generic;

describe("resolveFeeDenomination", () => {
  it("gives a Kraken fee the row's own asset, because the profile says the source names none", () => {
    const pumpTrade = krakenRows.find((r) => r.asset === "PUMP" && r.fee_amount === "17.720");
    expect(pumpTrade).toBeDefined();
    expect(resolveFeeDenomination(KRAKEN, pumpTrade!)).toEqual({
      kind: "ASSET_QUANTITY",
      asset: "PUMP",
    });
  });

  it("reads Bitvavo's fee currency per row: fiat on a buy, the asset on a withdrawal", () => {
    const buy = bitvavoRows.find((r) => r.fee_amount === "0.7499");
    const withdrawal = bitvavoRows.find(
      (r) => r.tx_type === "withdrawal" && r.fee_currency === "XRP",
    );
    expect(buy).toBeDefined();
    expect(withdrawal).toBeDefined();

    expect(resolveFeeDenomination(BITVAVO, buy!)).toEqual({
      kind: "FIAT_VALUATION",
      currency: "EUR",
    });
    // Zero, and therefore needing no denomination at all — the sign of an absent convention.
    expect(resolveFeeDenomination(BITVAVO, withdrawal!)).toEqual({ kind: "ZERO" });
  });

  it("treats a Bit2Me euro fee on a crypto row as a valuation, never as a quantity", () => {
    const hbarWithdrawal = bit2meRows.find((r) => r.fee_amount === "0.210620368");
    expect(hbarWithdrawal).toBeDefined();
    expect(hbarWithdrawal!.asset_out).toBe("HBAR");
    expect(resolveFeeDenomination(BIT2ME, hbarWithdrawal!)).toEqual({
      kind: "FIAT_VALUATION",
      currency: "EUR",
    });
  });

  it("treats a Bit2Me fee named in the traded asset as a quantity of it", () => {
    // Measured: 98 of Bit2Me's 118 trade rows name the asset in `Moneda de la comisión`, not EUR.
    const jasmyTrade = bit2meRows.find((r) => r.fee_currency === "JASMY");
    expect(jasmyTrade).toBeDefined();
    expect(resolveFeeDenomination(BIT2ME, jasmyTrade!)).toEqual({
      kind: "ASSET_QUANTITY",
      asset: "JASMY",
    });
  });

  it("reads Bitunix's named fee asset", () => {
    const withdraw = bitunixRows.find((r) => r.fee_amount === "1");
    expect(withdraw).toBeDefined();
    expect(resolveFeeDenomination(BITUNIX, withdraw!)).toEqual({
      kind: "ASSET_QUANTITY",
      asset: "ADA",
    });
  });

  it("keeps an absent fee distinguishable from an explicit zero", () => {
    const explicitZero: TransactionMappedData = { ...tangemRows[0], fee_amount: "0.0" };
    const absent: TransactionMappedData = { ...tangemRows[0], fee_amount: "" };
    expect(resolveFeeDenomination(TANGEM, explicitZero)).toEqual({ kind: "ZERO" });
    expect(resolveFeeDenomination(TANGEM, absent)).toEqual({ kind: "ABSENT" });
  });

  it("reports a non-zero fee it cannot denominate instead of assuming the row's asset", () => {
    const unnamed: TransactionMappedData = {
      ...bitvavoRows[0],
      fee_amount: "0.25",
      fee_currency: "",
      asset: "XRP",
    };
    const result = resolveFeeDenomination(GENERIC, unnamed);
    expect(result.kind).toBe("PENDING_REVIEW");
  });
});

describe("resolveGrossNetFee", () => {
  it("derives Kraken's gross from its net and its fee", () => {
    const withdrawal: TransactionMappedData = {
      ...krakenRows[0],
      amount: "-0.006",
      fee_amount: "0.005",
      asset: "SOL",
    };
    expect(resolveGrossNetFee(KRAKEN, withdrawal)).toEqual({
      kind: "RESOLVED",
      magnitude: "ASSET_QUANTITY",
      gross: "0.011",
      net: "0.006",
      fee: "0.005",
    });
  });

  it("derives Bit2Me's fee from its gross and its net", () => {
    const hbarWithdrawal = bit2meRows.find((r) => r.fee_amount === "0.210620368")!;
    expect(resolveGrossNetFee(BIT2ME, hbarWithdrawal)).toEqual({
      kind: "RESOLVED",
      magnitude: "ASSET_QUANTITY",
      gross: "2.236429",
      net: "1.536429",
      fee: "0.7",
    });
  });

  it("does not add a Bitvavo fee that is already inside the reported total", () => {
    const buy = bitvavoRows.find((r) => r.fee_amount === "0.7499")!;
    const result = resolveGrossNetFee(BITVAVO, buy);
    expect(result).toEqual({
      kind: "RESOLVED",
      magnitude: "FIAT_TOTAL",
      gross: "499.81",
      net: "499.0601",
      fee: "0.7499",
    });
  });

  it("treats an explicit zero fee as fully determined under any convention", () => {
    const deposit = bitunixRows.find((r) => r.tx_type === "Deposit")!;
    const underGeneric = resolveGrossNetFee(GENERIC, deposit);
    const underBitunix = resolveGrossNetFee(BITUNIX, deposit);
    expect(underGeneric.kind).toBe("NO_FEE");
    expect(underBitunix.kind).toBe("NO_FEE");
    if (underGeneric.kind !== "NO_FEE" || underBitunix.kind !== "NO_FEE") return;
    expect(underGeneric.net).toBe(underBitunix.net);
  });

  it("reports a non-zero fee under an undetermined convention rather than picking one", () => {
    const feeBearing: TransactionMappedData = {
      ...bitunixRows[2],
      fee_amount: "1",
      fee_currency: "ADA",
    };
    expect(resolveGrossNetFee(BITUNIX, feeBearing).kind).toBe("RESOLVED");
    expect(resolveGrossNetFee(GENERIC, feeBearing).kind).toBe("PENDING_REVIEW");
  });

  it("states rather than derives a fee when the row moves two different assets", () => {
    // Subtracting a euro origin from a JASMY destination would subtract euros from tokens.
    const jasmyTrade = bit2meRows.find((r) => r.fee_currency === "JASMY")!;
    expect(resolveGrossNetFee(BIT2ME, jasmyTrade)).toEqual({
      kind: "FEE_AS_STATED",
      fee: "9.57098884",
    });
  });

  it("keeps a credited fee negative, since the sign is information", () => {
    const rebate = bitvavoRows.find((r) => r.fee_amount === "-0.00543739");
    expect(rebate).toBeDefined();
    const result = resolveGrossNetFee(BITVAVO, rebate!);
    if (result.kind !== "RESOLVED") throw new Error(`expected RESOLVED, got ${result.kind}`);
    expect(result.fee).toBe("-0.00543739");
  });

  it("is exact where a float would not be", () => {
    const tiny: TransactionMappedData = {
      ...krakenRows[0],
      amount: "0.1",
      fee_amount: "0.2",
      asset: "SOL",
    };
    const result = resolveGrossNetFee(KRAKEN, tiny);
    if (result.kind !== "RESOLVED") throw new Error("expected RESOLVED");
    expect(result.gross).toBe("0.3");
    expect(result.gross).not.toBe(String(0.1 + 0.2));
  });
});

describe("reduceDirectionalSides", () => {
  it("keeps only the inbound side of a Bit2Me deposit that writes both", () => {
    const deposit = bit2meRows.find((r) => r.tx_type === "Deposit")!;
    expect(deposit.amount_in).toBe("100");
    expect(deposit.amount_out).toBe("100");

    expect(reduceDirectionalSides(BIT2ME, deposit)).toEqual({
      kind: "REDUCED_TO_INBOUND",
      asset: "EUR",
      amountIn: "100",
      droppedSide: "OUT",
    });
  });

  it("keeps a duplicated withdrawal's net outbound side and derives its fee", () => {
    const withdrawal = bit2meRows.find((r) => r.fee_amount === "0.210620368")!;
    expect(reduceDirectionalSides(BIT2ME, withdrawal)).toEqual({
      kind: "REDUCED_TO_OUTBOUND",
      asset: "HBAR",
      amountOut: "1.536429",
      feeQuantity: "0.7",
      droppedSide: "IN",
    });
  });

  it("leaves a genuine two-asset trade alone", () => {
    const trade = bit2meRows.find((r) => r.fee_currency === "JASMY")!;
    expect(reduceDirectionalSides(BIT2ME, trade)).toEqual({ kind: "UNCHANGED" });
  });

  it("leaves every row of a one-sided source untouched", () => {
    for (const row of [...krakenRows, ...bitvavoRows, ...bitunixRows, ...tangemRows]) {
      const profile = row.exchange === "Bit2Me" ? BIT2ME : KRAKEN;
      expect(reduceDirectionalSides(profile, row)).toEqual({ kind: "UNCHANGED" });
    }
  });
});

describe("isMergeKey", () => {
  it("refuses a column the source declares a category label", () => {
    expect(isMergeKey(BIT2ME, "Grupo")).toBe(false);
    expect(isMergeKey(BIT2ME, "grupo")).toBe(false);
    expect(isMergeKey(BITUNIX, "Trx. ID")).toBe(false);
  });

  it("accepts a column the source declares a genuine reference", () => {
    expect(isMergeKey(KRAKEN, "refid")).toBe(true);
    expect(isMergeKey(BITVAVO, "Transaction ID")).toBe(true);
  });

  it("refuses a column nobody declared, so an unknown column is never a merge key", () => {
    expect(isMergeKey(BIT2ME, "Descripción")).toBe(false);
    expect(isMergeKey(GENERIC, "refid")).toBe(false);
  });
});

describe("checkProfileInvariant", () => {
  it("verifies Kraken's running balance across every row of the real export", () => {
    const outcome = checkProfileInvariant(KRAKEN, krakenRows);
    expect(outcome).toEqual({ kind: "VERIFIED", rowsChecked: krakenRows.length });
    expect(krakenRows.length).toBe(34);
  });

  it("verifies Bitvavo's over-determined row on every row that carries the four columns", () => {
    const outcome = checkProfileInvariant(BITVAVO, bitvavoRows);
    expect(outcome).toEqual({ kind: "VERIFIED", rowsChecked: 12 });
  });

  it("names the profile and the first offending row when the balance does not reconcile", () => {
    const tampered = krakenRows.map((row, index) =>
      index === 5 ? { ...row, balance: "999" } : row,
    );
    const outcome = checkProfileInvariant(KRAKEN, tampered);
    if (outcome.kind !== "FAILED") throw new Error(`expected FAILED, got ${outcome.kind}`);
    expect(outcome.profileId).toBe("kraken-spot");
    expect(outcome.rowIndex).toBe(5);
    expect(outcome.actual).toBe("999");
  });

  it("fails the over-determined row when one of its four columns is altered", () => {
    const tampered = bitvavoRows.map((row) =>
      row.fee_amount === "0.7499" ? { ...row, total_fiat: "-500.5599" } : row,
    );
    const outcome = checkProfileInvariant(BITVAVO, tampered);
    if (outcome.kind !== "FAILED") throw new Error(`expected FAILED, got ${outcome.kind}`);
    expect(outcome.profileId).toBe("bitvavo-spot");
  });

  it("says a source declares no invariant rather than passing vacuously", () => {
    expect(checkProfileInvariant(BIT2ME, bit2meRows)).toEqual({ kind: "NOT_DECLARED" });
    expect(checkProfileInvariant(BITUNIX, bitunixRows)).toEqual({ kind: "NOT_DECLARED" });
    expect(checkProfileInvariant(TANGEM, tangemRows)).toEqual({ kind: "NOT_DECLARED" });
    expect(checkProfileInvariant(GENERIC, bit2meRows)).toEqual({ kind: "NOT_DECLARED" });
  });

  it("reports that it could not verify, rather than verifying, when no row carries the columns", () => {
    const withoutBalances = krakenRows.map((row) => ({ ...row, balance: "" }));
    const outcome = checkProfileInvariant(KRAKEN, withoutBalances);
    expect(outcome.kind).toBe("COULD_NOT_VERIFY");

    const depositsOnly = bitvavoRows.filter((row) => row.tx_type === "deposit");
    expect(depositsOnly.length).toBeGreaterThan(0);
    expect(checkProfileInvariant(BITVAVO, depositsOnly).kind).toBe("COULD_NOT_VERIFY");
  });

  it("verifies nothing from an empty batch", () => {
    expect(checkProfileInvariant(KRAKEN, []).kind).toBe("COULD_NOT_VERIFY");
  });
});

/**
 * The invariant is what would catch an exchange changing its convention, which it can only do if the
 * expected figure is derived from the convention the profile declares. A check that always subtracts
 * the fee reconciles Kraken's real rows either way, and would then agree with a profile that reads
 * every one of those rows wrongly.
 */
describe("the invariant tests the convention the profile declares", () => {
  it("fails Kraken's running balance when its fee convention is inverted", () => {
    const inverted = { ...KRAKEN, feeConvention: { kind: "FEE_INSIDE_TOTAL" } } as const;
    const outcome = checkProfileInvariant(inverted, krakenRows);
    if (outcome.kind !== "FAILED") throw new Error(`expected FAILED, got ${outcome.kind}`);
    expect(outcome.profileId).toBe("kraken-spot");
  });

  it("still verifies Kraken under the convention it does declare", () => {
    expect(checkProfileInvariant(KRAKEN, krakenRows)).toEqual({
      kind: "VERIFIED",
      rowsChecked: krakenRows.length,
    });
  });

  it("fails Bitvavo's over-determined row when its fee convention is inverted", () => {
    const inverted = { ...BITVAVO, feeConvention: { kind: "NET_PLUS_FEE" } } as const;
    const outcome = checkProfileInvariant(inverted, bitvavoRows);
    if (outcome.kind !== "FAILED") throw new Error(`expected FAILED, got ${outcome.kind}`);
    expect(outcome.profileId).toBe("bitvavo-spot");
  });

  it("still verifies Bitvavo under the convention it does declare", () => {
    expect(checkProfileInvariant(BITVAVO, bitvavoRows)).toEqual({
      kind: "VERIFIED",
      rowsChecked: 12,
    });
  });

  /**
   * Bit2Me is the asymmetry, and it is the point: inverting its convention changes what the profile
   * derives and no invariant can see it, because gross, net and fee are three columns of which the
   * profile computes one. Only the digit-for-digit net over the real rows catches that.
   */
  it("cannot report anything about Bit2Me's convention, and says so instead of passing", () => {
    const inverted = { ...BIT2ME, feeConvention: { kind: "NET_PLUS_FEE" } } as const;
    expect(checkProfileInvariant(inverted, bit2meRows)).toEqual({ kind: "NOT_DECLARED" });
    expect(checkProfileInvariant(BIT2ME, bit2meRows)).toEqual({ kind: "NOT_DECLARED" });
  });

  it("declines to state an expectation for a convention nobody has measured", () => {
    const undetermined = {
      ...KRAKEN,
      feeConvention: { kind: "UNDETERMINED" },
    } as const;
    expect(checkProfileInvariant(undetermined, krakenRows).kind).toBe("COULD_NOT_VERIFY");
  });
});

describe("applyProfileToRow — the one implementation the preview and the ledger both call", () => {
  it("reduces a duplicated deposit to its inbound side", () => {
    const deposit = bit2meRows.find((r) => r.tx_type === "Deposit")!;
    const applied = applyProfileToRow(BIT2ME, deposit);

    expect(applied.amount_in).toBe("100");
    expect(applied.asset_in).toBe("EUR");
    expect(applied.amount_out).toBeUndefined();
    expect(applied.asset_out).toBeUndefined();
  });

  it("reduces a duplicated withdrawal to its net outbound side and records the derived fee", () => {
    const withdrawal = bit2meRows.find((r) => r.fee_amount === "0.210620368")!;
    const applied = applyProfileToRow(BIT2ME, withdrawal);

    expect(applied.amount_out).toBe("1.536429");
    expect(applied.asset_out).toBe("HBAR");
    expect(applied.amount_in).toBeUndefined();
    // The fee is the difference, denominated in the asset — not the euro figure the source wrote.
    expect(applied.fee_amount).toBe("0.7");
    expect(applied.fee_currency).toBe("HBAR");
    // The source's own valuation is preserved rather than discarded.
    expect(applied.metadata?.fee_fiat_valuation).toBe("0.210620368");
    expect(applied.metadata?.fee_fiat_currency).toBe("EUR");
  });

  it("gives a Kraken fee the row's asset, which the source leaves implicit", () => {
    const pumpTrade = krakenRows.find((r) => r.fee_amount === "17.720")!;
    expect(pumpTrade.fee_currency).toBeUndefined();
    expect(applyProfileToRow(KRAKEN, pumpTrade).fee_currency).toBe("PUMP");
  });

  it("leaves a Bitvavo row's own fee currency alone", () => {
    const buy = bitvavoRows.find((r) => r.fee_amount === "0.7499")!;
    const applied = applyProfileToRow(BITVAVO, buy);
    expect(applied.fee_currency).toBe("EUR");
    expect(applied.fee_amount).toBe("0.7499");
  });

  it("changes nothing on a one-sided source that already names its fee currency", () => {
    const withdraw = bitunixRows.find((r) => r.fee_amount === "1")!;
    expect(applyProfileToRow(BITUNIX, withdraw)).toEqual(withdraw);
  });

  it("is pure: the row it is given is not modified", () => {
    const withdrawal = bit2meRows.find((r) => r.fee_amount === "0.210620368")!;
    const before = JSON.stringify(withdrawal);
    applyProfileToRow(BIT2ME, withdrawal);
    expect(JSON.stringify(withdrawal)).toBe(before);
  });

  it("applies twice to the same result, so a second pass cannot double a deduction", () => {
    const withdrawal = bit2meRows.find((r) => r.fee_amount === "0.210620368")!;
    const once = applyProfileToRow(BIT2ME, withdrawal);
    expect(applyProfileToRow(BIT2ME, once)).toEqual(once);
  });
});
