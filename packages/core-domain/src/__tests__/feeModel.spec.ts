/**
 * The fee model: what a fee is denominated in, whether the source already applied it, and what a
 * consumer must therefore do with it.
 *
 * The two questions are independent and conflating them is the hazard. A fee in the asset is a
 * disposal that reduces what a lot still holds; a fee in money adjusts the basis and must leave every
 * quantity untouched. Separately, deducting a fee the source already applied destroys quantity still
 * held, and ignoring one charged on top leaves quantity unaccounted for.
 *
 * Every rule under test is declared in a source format profile. No test here names a source in order
 * to obtain a behaviour — it names a source to obtain a *row*, and the profile that row's file
 * resolves to.
 */

import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import type { TransactionMappedData } from "@kryptofolio/shared-types";

import { guessColumnMapping, mapToEntity } from "../application/use-cases/AutoMapColumnsUseCase";
import { SOURCE_FORMAT_PROFILES } from "../domain/services/sourceProfile/profiles";
import {
  applyProfileToRow,
  resolveFeeDenomination,
  resolveGrossNetFee,
  routeFee,
} from "../domain/services/sourceProfile/appliers";
import { BIT2ME_DIFFERING_WITHDRAWALS } from "./fixtures/bit2meWithdrawals";
import {
  BIT2ME_ROWS,
  BITUNIX_ROWS,
  BITVAVO_ROWS,
  KRAKEN_FUTURES_ROWS,
  KRAKEN_SPOT_ROWS,
  TANGEM_ROWS,
} from "./fixtures/realSourceRows";

/** Drives real rows through the real mapping layer, so no fixture maps itself. */
function mapped(
  rows: readonly Readonly<Record<string, string>>[],
  market: "SPOT" | "FUTURES" = "SPOT",
): TransactionMappedData[] {
  const headers = Object.keys(rows[0]);
  const mapping = guessColumnMapping(headers);
  return rows.map(
    (row, index) => mapToEntity({ ...row }, mapping, index, market).mappedData as TransactionMappedData,
  );
}

const krakenRows = mapped(KRAKEN_SPOT_ROWS);
const futuresRows = mapped(KRAKEN_FUTURES_ROWS, "FUTURES");
const bitvavoRows = mapped(BITVAVO_ROWS);
const bitunixRows = mapped(BITUNIX_ROWS);
const bit2meRows = mapped(BIT2ME_ROWS);
const tangemRows = mapped(TANGEM_ROWS);

const KRAKEN = SOURCE_FORMAT_PROFILES["kraken-spot"];
const FUTURES = SOURCE_FORMAT_PROFILES["kraken-futures"];
const BITVAVO = SOURCE_FORMAT_PROFILES["bitvavo-spot"];
const BITUNIX = SOURCE_FORMAT_PROFILES["bitunix-spot"];
const BIT2ME = SOURCE_FORMAT_PROFILES["bit2me-spot"];
const TANGEM = SOURCE_FORMAT_PROFILES.tangem;
const GENERIC = SOURCE_FORMAT_PROFILES.generic;

function route(profile: typeof KRAKEN, row: TransactionMappedData) {
  return routeFee(resolveFeeDenomination(profile, row), resolveGrossNetFee(profile, row));
}

// ---------------------------------------------------------------------------
// A zero fee is a value; an absent fee is unknown
// ---------------------------------------------------------------------------

describe("an explicit zero and an empty cell are different states", () => {
  /**
   * 40 real rows carry an explicit `0` — 22 Kraken and 18 Bitvavo — and 12 Bitvavo rows leave the
   * cell empty. `gross = net + 0` under every convention, so a stated zero is fully determined and
   * has nothing for a user to review; an empty cell states nothing at all.
   */
  it("denominates a stated zero, so the fee pair the ledger requires can be written", () => {
    const zeroFeeRow = krakenRows.find((r) => r.fee_amount === "0" && r.asset === "HBAR");
    expect(zeroFeeRow).toBeDefined();

    const applied = applyProfileToRow(KRAKEN, zeroFeeRow!);
    expect(applied.fee_amount).toBe("0");
    expect(applied.fee_currency).toBe("HBAR");
  });

  it("leaves an absent fee undenominated, because there is nothing to denominate", () => {
    const absent: TransactionMappedData = { ...krakenRows[0], fee_amount: "" };
    const applied = applyProfileToRow(KRAKEN, absent);
    expect(applied.fee_amount).toBe("");
    expect(applied.fee_currency ?? "").toBe("");
  });

  it("routes a stated zero as a fee the source reported, and an empty cell as one it did not", () => {
    const stated: TransactionMappedData = { ...tangemRows[0], fee_amount: "0.0" };
    const absent: TransactionMappedData = { ...tangemRows[0], fee_amount: "" };

    expect(route(TANGEM, stated)).toEqual({ kind: "NO_FEE", stated: true });
    expect(route(TANGEM, absent)).toEqual({ kind: "NO_FEE", stated: false });
  });

  it("never sends a stated zero to pending review, under any of the seven profiles", () => {
    // The `generic` profile declares no convention at all, and a zero still needs none.
    for (const profile of Object.values(SOURCE_FORMAT_PROFILES)) {
      const zero: TransactionMappedData = { ...tangemRows[0], fee_amount: "0", fee_currency: "XRP" };
      expect(route(profile, zero)).toEqual({ kind: "NO_FEE", stated: true });
    }
  });
});

// ---------------------------------------------------------------------------
// Denomination — one test per member of the profile's union
// ---------------------------------------------------------------------------

describe("a fee's denomination comes from the profile's declaration", () => {
  it("COLLATERAL_CURRENCY: a futures fee settles in the collateral the export names, not the contract's asset", () => {
    const trade = futuresRows.find((r) => r.fee_amount === "0.06260000000");
    expect(trade).toBeDefined();
    // The position is in `pf_xrpusd`; the fee is not paid in XRP.
    expect(resolveFeeDenomination(FUTURES, trade!)).toEqual({
      kind: "ASSET_QUANTITY",
      asset: "usd",
    });
  });

  it("routes a futures fee by its collateral's own nature, not by the contract's asset", () => {
    // This account's collateral is dollars, so the fee is a cost in money. A crypto-margined account
    // would resolve to a quantity of that crypto through the identical declaration — which is the
    // point of naming the collateral rather than assuming a currency.
    const trade = futuresRows.find((r) => r.fee_amount === "0.16440000000")!;
    expect(route(FUTURES, trade)).toEqual({
      kind: "BASIS_ADJUSTMENT",
      currency: "usd",
      amount: "0.1644",
      netTotal: null,
    });

    const cryptoMargined = routeFee(
      { kind: "ASSET_QUANTITY", asset: "XBT" },
      { kind: "FEE_AS_STATED", fee: "0.1644" },
    );
    expect(cryptoMargined).toEqual({
      kind: "ASSET_DISPOSAL",
      asset: "XBT",
      quantity: "0.1644",
    });
  });
});

// ---------------------------------------------------------------------------
// Convention — one test per member, with the measured figures
// ---------------------------------------------------------------------------

describe("which two of gross, net and fee the source supplied", () => {
  it("NET_PLUS_FEE: Bitunix's outgoing amount is net, and the fee makes up the deposits it matches", () => {
    const withdraw = bitunixRows.find((r) => r.fee_amount === "1");
    expect(withdraw).toBeDefined();
    const result = resolveGrossNetFee(BITUNIX, withdraw!);

    expect(result).toEqual({
      kind: "RESOLVED",
      magnitude: "ASSET_QUANTITY",
      gross: "547.844684",
      net: "546.844684",
      fee: "1",
    });

    // Corroborated by the source's own other rows: the two deposits sum to exactly that gross.
    const deposits = bitunixRows.filter((r) => r.tx_type === "Deposit");
    const summed = deposits.reduce((total, r) => total + Number(r.amount_in), 0);
    expect(summed.toString()).toBe("547.844684");
  });

  it("NET_PLUS_FEE: Kraken's 0.006 net and 0.005 fee debit 0.011 from the wallet", () => {
    const withdrawal: TransactionMappedData = {
      ...krakenRows[0],
      amount: "-0.006",
      fee_amount: "0.005",
      asset: "SOL",
    };
    expect(resolveGrossNetFee(KRAKEN, withdrawal)).toMatchObject({
      gross: "0.011",
      net: "0.006",
      fee: "0.005",
    });
  });

  it("GROSS_AND_NET: Bit2Me's HBAR withdrawal moved 1.536429 of the 2.236429 debited, so the fee is 0.7", () => {
    const hbar = bit2meRows.find((r) => r.fee_amount === "0.210620368")!;
    expect(resolveGrossNetFee(BIT2ME, hbar)).toMatchObject({ fee: "0.7" });
    // The stated figure is a euro valuation and is never the quantity.
    expect(resolveGrossNetFee(BIT2ME, hbar)).not.toMatchObject({ fee: "0.210620368" });
  });

  it("FEE_INSIDE_TOTAL: a Bitvavo basis stays at the 499.81 paid and is not raised to 500.5599", () => {
    const buy = bitvavoRows.find((r) => r.fee_amount === "0.7499")!;
    const routing = route(BITVAVO, buy);
    if (routing.kind !== "BASIS_ADJUSTMENT") {
      throw new Error(`expected BASIS_ADJUSTMENT, got ${routing.kind}`);
    }

    expect(routing.currency).toBe("EUR");
    expect(routing.amount).toBe("0.7499");
    // The net is what a consumer records, so that adding the fee back reaches the source's own total.
    expect(routing.netTotal).toBe("499.0601");
    expect(Number(routing.netTotal) + Number(routing.amount)).toBe(499.81);
  });

  it("UNDETERMINED: a non-zero fee under a convention nobody measured is reported, not applied", () => {
    const feeBearing: TransactionMappedData = {
      ...bitunixRows[2],
      fee_amount: "1",
      fee_currency: "ADA",
    };
    const routing = route(GENERIC, feeBearing);
    expect(routing.kind).toBe("PENDING_REVIEW");
    if (routing.kind !== "PENDING_REVIEW") return;
    expect(routing.reason).toContain("convention");
  });
});

// ---------------------------------------------------------------------------
// Routing — quantity versus basis, and nothing else
// ---------------------------------------------------------------------------

describe("routing reads the two resolved values and nothing else", () => {
  it("sends a fee in the asset to a disposal of that asset", () => {
    const pumpTrade = krakenRows.find((r) => r.fee_amount === "17.720")!;
    expect(route(KRAKEN, pumpTrade)).toEqual({
      kind: "ASSET_DISPOSAL",
      asset: "PUMP",
      quantity: "17.72",
    });
  });

  it("sends a fee in money to the basis and leaves every quantity alone", () => {
    const buy = bitvavoRows.find((r) => r.fee_amount === "0.7499")!;
    const routing = route(BITVAVO, buy);
    expect(routing.kind).toBe("BASIS_ADJUSTMENT");
    // A basis adjustment names a currency, never an asset quantity.
    expect(routing).not.toHaveProperty("quantity");
  });

  it("sends Bit2Me's derived quantity to a disposal once the profile has been applied", () => {
    // The raw row prices the fee in euros; the applier resolves the quantity that actually left.
    const hbar = bit2meRows.find((r) => r.fee_amount === "0.210620368")!;
    const applied = applyProfileToRow(BIT2ME, hbar);
    expect(route(BIT2ME, applied)).toEqual({
      kind: "ASSET_DISPOSAL",
      asset: "HBAR",
      quantity: "0.7",
    });
  });

  it("never turns a credited fee into a disposal of a negative quantity", () => {
    const rebate = bitvavoRows.find((r) => r.fee_amount === "-0.00543739")!;
    const routing = route(BITVAVO, rebate);
    expect(routing.kind).not.toBe("ASSET_DISPOSAL");
    if (routing.kind !== "BASIS_ADJUSTMENT") {
      throw new Error(`expected BASIS_ADJUSTMENT, got ${routing.kind}`);
    }
    // The sign survives: the venue credited this, and the paid total really is zero.
    expect(routing.amount).toBe("-0.00543739");
    expect(Number(routing.netTotal) + Number(routing.amount)).toBe(0);
  });

  it("reports rather than routes a credited fee denominated in an asset", () => {
    // No export in the corpus writes one; inventing an acquisition for it would be worse than saying so.
    const odd: TransactionMappedData = {
      ...bitunixRows[2],
      fee_amount: "-1",
      fee_currency: "ADA",
    };
    expect(route(BITUNIX, odd).kind).toBe("PENDING_REVIEW");
  });

  it("reports a fee whose denomination could not be resolved instead of assuming one", () => {
    const unnamed: TransactionMappedData = {
      ...bitvavoRows[0],
      fee_amount: "0.25",
      fee_currency: "",
      asset: "XRP",
    };
    expect(route(GENERIC, unnamed).kind).toBe("PENDING_REVIEW");
  });

  /**
   * Every one of these disposals was previously invisible: the fee column priced it in euros, so no
   * quantity of the asset was ever recorded leaving the wallet, and custody credited the destination
   * with the gross.
   */
  it("recovers the whole corpus of unrecorded Bit2Me network fees, exactly", () => {
    const rows = mapped(BIT2ME_DIFFERING_WITHDRAWALS);
    expect(rows).toHaveLength(43);

    const perAsset = new Map<string, Decimal>();
    for (const row of rows) {
      const routing = route(BIT2ME, applyProfileToRow(BIT2ME, row));
      if (routing.kind !== "ASSET_DISPOSAL") {
        throw new Error(`expected ASSET_DISPOSAL, got ${routing.kind}`);
      }
      perAsset.set(
        routing.asset,
        (perAsset.get(routing.asset) ?? new Decimal(0)).plus(routing.quantity),
      );
    }

    const measured = Object.fromEntries(
      [...perAsset.entries()].map(([asset, total]) => [asset, total.toString()]),
    );
    expect(measured).toEqual({
      JASMY: "220",
      GIGA: "20",
      HBAR: "11.4",
      XLM: "3.9",
      ADA: "2",
      AI16Z: "2",
      USDC: "0.3",
      XRP: "0.0024",
      ETH: "0.0005",
      BNB: "0.0002",
    });
  });

  it("attributes the net, not the gross, to a withdrawal's destination", () => {
    const rows = mapped(BIT2ME_DIFFERING_WITHDRAWALS);
    for (const row of rows) {
      const applied = applyProfileToRow(BIT2ME, row);
      // One side survives, and it is the quantity that actually arrived.
      expect(applied.amount_in).toBeUndefined();
      expect(applied.amount_out).toBe(new Decimal(row.amount_in!).toString());
    }
  });

  it("names no source: the routing is a function of the two resolutions alone", () => {
    // The identical pair of resolutions must produce the identical routing, whichever profile
    // produced them — otherwise a source name is being read somewhere it should not be.
    const denomination = { kind: "ASSET_QUANTITY", asset: "ADA" } as const;
    const convention = {
      kind: "RESOLVED",
      magnitude: "ASSET_QUANTITY",
      gross: "547.844684",
      net: "546.844684",
      fee: "1",
    } as const;

    expect(routeFee(denomination, convention)).toEqual({
      kind: "ASSET_DISPOSAL",
      asset: "ADA",
      quantity: "1",
    });
  });
});
