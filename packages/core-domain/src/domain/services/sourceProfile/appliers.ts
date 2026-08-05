import Decimal from "decimal.js";
import type { TransactionMappedData } from "@kryptofolio/shared-types";
import { isFiatCurrencyCode } from "@kryptofolio/shared-types";

import type { SourceFormatProfile } from "./types";

/**
 * The pure half of the seam: what a profile *does* to a row.
 *
 * Every function here is a function of `(profile, row)` and nothing else, so the wizard's preview and
 * the backend's persistence can call the identical implementation and cannot disagree about a
 * quantity. That is the whole point of the split — a client-side profile would leave the preview and
 * the stored ledger free to drift.
 *
 * The rows are canonical mapped rows rather than raw source rows. The backend never sees a header, so
 * a rule expressed in source-column terms could only ever be applied on one side. Detection is the
 * one thing that must read headers, and it lives elsewhere.
 *
 * `decimal.js` is the one third-party import the domain layer permits, and it is required: a fee
 * derived as `2.236429 − 1.536429` is `0.7000000000000002` in float64, and that figure would be
 * recorded as a disposal.
 */

/**
 * A row as either side of the boundary holds it: canonical mapped fields, any of which the column
 * mapper may have found nothing to fill.
 *
 * The invariant in particular is a statement about the figures the *source* wrote, so it must be
 * readable on a row canonical validation rejected for an unrelated reason — a missing timestamp does
 * not make a running balance unreadable, and dropping such a row would splice the chain and report a
 * break the file does not contain.
 */
export type MappedRowView = Partial<TransactionMappedData>;

/** Reads the first field that actually holds something. An empty cell is not a value. */
function firstNonEmpty(
  ...values: readonly (string | null | undefined)[]
): string | undefined {
  for (const value of values) {
    if (value !== undefined && value !== null && value.trim() !== "") return value.trim();
  }
  return undefined;
}

function toDecimal(value: string | null | undefined): Decimal | undefined {
  const text = firstNonEmpty(value);
  if (text === undefined) return undefined;
  try {
    const parsed = new Decimal(text);
    return parsed.isFinite() ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/** The asset the row moves, in the order the mapped shape makes it available. */
function rowAsset(row: MappedRowView): string | undefined {
  return firstNonEmpty(row.asset, row.asset_out, row.asset_in);
}

/** The magnitude the row moves, as a magnitude: direction is carried by the type, not by a sign. */
function rowQuantity(row: MappedRowView): Decimal | undefined {
  const value = toDecimal(firstNonEmpty(row.amount_out, row.amount_in, row.amount));
  return value?.abs();
}

export type FeeDenominationResolution =
  /** An empty cell. The source stated no fee, which is not the same as stating none was charged. */
  | { readonly kind: "ABSENT" }
  /** An explicit zero needs no denomination and no convention. */
  | { readonly kind: "ZERO" }
  /** A quantity of an asset, and therefore a disposal that reduces what a lot still holds. */
  | { readonly kind: "ASSET_QUANTITY"; readonly asset: string }
  /** A fiat figure that adjusts the basis and must leave every quantity untouched. */
  | { readonly kind: "FIAT_VALUATION"; readonly currency: string }
  | { readonly kind: "PENDING_REVIEW"; readonly reason: string };

/**
 * Resolves what a row's fee is denominated in, from the profile's declaration and nothing else.
 *
 * The distinction decides quantity versus basis, so there is no global default and no fallback to the
 * row's own asset except where the profile states that the source names no fee currency at all.
 */
export function resolveFeeDenomination(
  profile: SourceFormatProfile,
  row: MappedRowView,
): FeeDenominationResolution {
  const feeText = firstNonEmpty(row.fee_amount);
  if (feeText === undefined) return { kind: "ABSENT" };

  const fee = toDecimal(feeText);
  if (fee === undefined) {
    return { kind: "PENDING_REVIEW", reason: `fee amount '${feeText}' is not a number` };
  }
  if (fee.isZero()) return { kind: "ZERO" };

  return declaredDenomination(profile, row);
}

/**
 * The unit the profile says a fee is charged in, independently of how much was charged.
 *
 * Split out because an explicit zero needs no *convention* — `gross = net + 0` either way — while it
 * does still need a unit: the ledger and the SQL CHECK both require an amount and an asset to be
 * present or absent together, so a stated zero with no unit cannot be written down at all, and
 * dropping it would erase the difference between "no fee was charged" and "the source said nothing".
 */
function declaredDenomination(
  profile: SourceFormatProfile,
  row: MappedRowView,
): FeeDenominationResolution {
  const denomination = profile.feeDenomination;
  switch (denomination.kind) {
    case "ROW_ASSET": {
      /**
       * A denomination already on the row wins over re-deriving one.
       *
       * The source names no fee currency, so anything in that field was resolved from the leg the fee
       * was actually charged on — which is knowledge this function cannot recover once two legs are one
       * record. A Kraken trade merges a EUR leg and a PUMP leg, and the fee belongs to whichever leg
       * carried it; re-deriving picks the outbound asset and would relabel a PUMP fee as euros.
       */
      const stated = firstNonEmpty(row.fee_currency);
      if (stated !== undefined) return { kind: "ASSET_QUANTITY", asset: stated };

      const asset = rowAsset(row);
      if (asset === undefined) {
        return {
          kind: "PENDING_REVIEW",
          reason: `${profile.id} charges its fee in the row's asset and the row names none`,
        };
      }
      return { kind: "ASSET_QUANTITY", asset };
    }

    case "NAMED_COLUMN": {
      const currency = firstNonEmpty(row.fee_currency);
      if (currency === undefined) {
        return {
          kind: "PENDING_REVIEW",
          reason: `${profile.id} names its fee currency in '${denomination.sourceColumn}' and the row leaves it empty`,
        };
      }
      /**
       * A fiat fee on a row that moves something else is a valuation of a fee paid in that something
       * else: Bit2Me prices an HBAR withdrawal fee in euros, and Bitvavo charges a euro fee on an ETH
       * buy. Where the fiat code *is* the row's asset the number is an ordinary quantity of it, which
       * is what a euro-funded Bit2Me trade reports.
       */
      const asset = rowAsset(row);
      const feeIsTheRowsOwnUnit =
        asset !== undefined && asset.toUpperCase() === currency.toUpperCase();
      if (isFiatCurrencyCode(currency) && !feeIsTheRowsOwnUnit) {
        return { kind: "FIAT_VALUATION", currency };
      }
      return { kind: "ASSET_QUANTITY", asset: currency };
    }

    case "COLLATERAL_CURRENCY": {
      // A futures fee settles in the account's collateral, which the export names beside the
      // contract rather than as the position's asset.
      const currency = firstNonEmpty(row.fee_currency, row.quote_currency, row.symbol, row.asset);
      if (currency === undefined) {
        return {
          kind: "PENDING_REVIEW",
          reason: `${profile.id} settles its fee in the collateral currency and the row names none`,
        };
      }
      return { kind: "ASSET_QUANTITY", asset: currency };
    }
  }
}

export type GrossNetFeeResolution =
  | {
      readonly kind: "RESOLVED";
      readonly magnitude: "ASSET_QUANTITY" | "FIAT_TOTAL";
      readonly gross: string;
      readonly net: string;
      readonly fee: string;
    }
  /** Fee absent or an explicit zero: `gross = net + 0` under every convention. */
  | {
      readonly kind: "NO_FEE";
      readonly magnitude: "ASSET_QUANTITY" | "FIAT_TOTAL";
      readonly gross: string;
      readonly net: string;
    }
  /**
   * The row moves two different assets, so there is no single magnitude for a gross/net/fee triple
   * to be about. The stated fee stands as written, in whatever its denomination resolves to.
   */
  | { readonly kind: "FEE_AS_STATED"; readonly fee: string }
  | { readonly kind: "PENDING_REVIEW"; readonly reason: string };

/**
 * Resolves which two of `gross`, `net` and `fee` the source supplied, and derives the third.
 *
 * Deducting a fee the source already applied destroys quantity that is still held; ignoring one
 * charged on top leaves quantity unaccounted for. Both are silent, which is why the convention is
 * declared rather than inferred — a file whose every fee is zero satisfies both conventions
 * identically, so the data cannot settle it exactly where the data is most abundant.
 */
export function resolveGrossNetFee(
  profile: SourceFormatProfile,
  row: MappedRowView,
): GrossNetFeeResolution {
  const feeText = firstNonEmpty(row.fee_amount);
  const fee = feeText === undefined ? undefined : toDecimal(feeText);
  if (feeText !== undefined && fee === undefined) {
    return { kind: "PENDING_REVIEW", reason: `fee amount '${feeText}' is not a number` };
  }
  const hasFee = fee !== undefined && !fee.isZero();
  // Whenever a returned `fee` is the source's own stated figure rather than a value this function
  // derives (a subtraction, a sum), it is reported as `feeText` — guaranteed defined here because
  // `hasFee` is only true once `fee`, and therefore `feeText`, parsed successfully — not as
  // `fee.toString()`, which discards trailing zeros the source wrote (`0.16440000000` becomes
  // `0.1644`): numerically identical, but not the digits ingestion promises to keep.

  const convention = profile.feeConvention;
  switch (convention.kind) {
    case "NET_PLUS_FEE": {
      const net = rowQuantity(row);
      if (net === undefined) {
        return { kind: "PENDING_REVIEW", reason: "the row states no quantity" };
      }
      if (!hasFee) {
        return {
          kind: "NO_FEE",
          magnitude: "ASSET_QUANTITY",
          gross: net.toString(),
          net: net.toString(),
        };
      }
      return {
        kind: "RESOLVED",
        magnitude: "ASSET_QUANTITY",
        gross: net.plus(fee).toString(),
        net: net.toString(),
        // The sign survives: a negative fee is a rebate the venue credited, not a direction.
        fee: feeText!,
      };
    }

    case "GROSS_AND_NET": {
      const gross = toDecimal(row.amount_out)?.abs();
      const net = toDecimal(row.amount_in)?.abs();
      const assetOut = firstNonEmpty(row.asset_out);
      const assetIn = firstNonEmpty(row.asset_in);

      if (gross === undefined || net === undefined) {
        // Only one side is written — an inbound-only reward, say — so nothing is being netted.
        const single = rowQuantity(row);
        if (single === undefined) {
          return { kind: "PENDING_REVIEW", reason: "the row states no quantity" };
        }
        if (!hasFee) {
          return {
            kind: "NO_FEE",
            magnitude: "ASSET_QUANTITY",
            gross: single.toString(),
            net: single.toString(),
          };
        }
        return { kind: "FEE_AS_STATED", fee: feeText! };
      }

      if (
        assetOut === undefined ||
        assetIn === undefined ||
        assetOut.toUpperCase() !== assetIn.toUpperCase()
      ) {
        // A genuine two-asset trade: subtracting one side from the other would subtract euros from
        // tokens.
        if (!hasFee) {
          return {
            kind: "NO_FEE",
            magnitude: "ASSET_QUANTITY",
            gross: gross.toString(),
            net: net.toString(),
          };
        }
        return { kind: "FEE_AS_STATED", fee: feeText! };
      }

      const derived = gross.minus(net);
      if (derived.isZero()) {
        return {
          kind: "NO_FEE",
          magnitude: "ASSET_QUANTITY",
          gross: gross.toString(),
          net: net.toString(),
        };
      }
      return {
        kind: "RESOLVED",
        magnitude: "ASSET_QUANTITY",
        gross: gross.toString(),
        net: net.toString(),
        fee: derived.toString(),
      };
    }

    case "FEE_INSIDE_TOTAL": {
      const gross = toDecimal(row.total_fiat)?.abs();
      if (gross === undefined) {
        return { kind: "PENDING_REVIEW", reason: "the row states no total" };
      }
      if (!hasFee) {
        return {
          kind: "NO_FEE",
          magnitude: "FIAT_TOTAL",
          gross: gross.toString(),
          net: gross.toString(),
        };
      }
      // The reported total already contains the fee, so the fee is subtracted to reach the net and
      // never added to reach the basis.
      return {
        kind: "RESOLVED",
        magnitude: "FIAT_TOTAL",
        gross: gross.toString(),
        net: gross.minus(fee).toString(),
        fee: feeText!,
      };
    }

    case "UNDETERMINED": {
      const quantity = rowQuantity(row);
      if (!hasFee) {
        const magnitude = quantity ?? new Decimal(0);
        return {
          kind: "NO_FEE",
          magnitude: "ASSET_QUANTITY",
          gross: magnitude.toString(),
          net: magnitude.toString(),
        };
      }
      return {
        kind: "PENDING_REVIEW",
        reason: `${profile.id} declares no fee convention, so a non-zero fee cannot be applied`,
      };
    }
  }
}

export type FeeRouting =
  /**
   * `stated` carries the one distinction the rest of the pipeline cannot recover: a source that wrote
   * `0` said no fee was charged, and a source that left the cell empty said nothing at all.
   */
  | { readonly kind: "NO_FEE"; readonly stated: boolean }
  /** A quantity of an asset left the wallet, so a lot holds that much less and disposed of it. */
  | { readonly kind: "ASSET_DISPOSAL"; readonly asset: string; readonly quantity: string }
  /**
   * A cost in money. `netTotal` is the fiat magnitude to record when the source's reported total
   * already contained the fee: recording the reported total *and* adding the fee inflates the basis
   * by the fee, which understates every later gain on the lot.
   */
  | {
      readonly kind: "BASIS_ADJUSTMENT";
      readonly currency: string;
      readonly amount: string;
      readonly netTotal: string | null;
    }
  | { readonly kind: "PENDING_REVIEW"; readonly reason: string };

/**
 * Decides what a consumer must do with a fee, from the two resolutions and nothing else.
 *
 * It reads no profile and no row, so no source name can reach it: everything per-source was already
 * decided by the two arguments. That is deliberate — the moment this function could tell Kraken from
 * Bitvavo it would start to accumulate the per-source conditionals the profile table replaced.
 */
export function routeFee(
  denomination: FeeDenominationResolution,
  convention: GrossNetFeeResolution,
): FeeRouting {
  if (denomination.kind === "ABSENT") return { kind: "NO_FEE", stated: false };
  if (denomination.kind === "ZERO") return { kind: "NO_FEE", stated: true };
  if (denomination.kind === "PENDING_REVIEW") {
    return { kind: "PENDING_REVIEW", reason: denomination.reason };
  }
  if (convention.kind === "PENDING_REVIEW") {
    return { kind: "PENDING_REVIEW", reason: convention.reason };
  }
  if (convention.kind === "NO_FEE") {
    // The denomination saw a non-zero fee and the convention did not, so the two disagree about what
    // the row says. Nothing here is entitled to pick one.
    return {
      kind: "PENDING_REVIEW",
      reason: "the fee's denomination and its convention disagree about whether a fee was charged",
    };
  }

  // `convention.fee` is already the figure `resolveGrossNetFee` resolved to — its own stated text in
  // every branch that does not net two sides against each other. `fee` exists only to ask questions
  // about it (its sign); the value returned below is the text itself, not `fee.toString()`, which
  // would re-parse and hand back Decimal's canonical form, trailing zeros dropped.
  const fee = new Decimal(convention.fee);
  // A fee the source stated without netting anything against it leaves the reported total alone.
  const netTotal =
    convention.kind === "RESOLVED" && convention.magnitude === "FIAT_TOTAL" ? convention.net : null;

  /**
   * A fee in money is a cost and a fee in an asset is a disposal, whichever way the denomination
   * arrived at its unit. `FIAT_VALUATION` is one way; the other is a fee charged in the very currency
   * the row is denominated in, which the denomination resolves as a quantity because that is what it
   * is — a quantity of money.
   */
  if (denomination.kind === "FIAT_VALUATION" || isFiatCurrencyCode(denomination.asset)) {
    const currency =
      denomination.kind === "FIAT_VALUATION" ? denomination.currency : denomination.asset;
    return { kind: "BASIS_ADJUSTMENT", currency, amount: convention.fee, netTotal };
  }

  if (fee.isNegative()) {
    // A rebate paid in an asset is an acquisition, not a disposal of a negative quantity. No export
    // in the corpus writes one, and inventing an acquisition is worse than reporting it.
    return {
      kind: "PENDING_REVIEW",
      reason: `a credited fee of ${convention.fee} ${denomination.asset} is not a disposal`,
    };
  }

  return { kind: "ASSET_DISPOSAL", asset: denomination.asset, quantity: convention.fee };
}

export type DirectionalReduction =
  | { readonly kind: "UNCHANGED" }
  | {
      readonly kind: "REDUCED_TO_INBOUND";
      readonly asset: string;
      readonly amountIn: string;
      readonly droppedSide: "OUT";
    }
  | {
      readonly kind: "REDUCED_TO_OUTBOUND";
      readonly asset: string;
      readonly amountOut: string;
      readonly feeQuantity: string | null;
      readonly droppedSide: "IN";
    };

/** Raw and canonical labels alike: this runs before and after the normalizer. */
const OUTBOUND_LABELS = new Set([
  "withdrawal",
  "withdraw",
  "transfer_out",
  "send",
  "sell",
  "spend",
  "retirada",
]);

/**
 * Reduces a row that writes one movement onto both directional columns to a single side.
 *
 * All 42 real Bit2Me `Deposit` rows repeat the same asset and amount on both sides. The custody view
 * unions the two sides into legs, so such a row produced two legs on one account that net to exactly
 * zero: the deposit landed nowhere, and a net of zero leaves no imbalance for anything to flag. The
 * reduction happens here, in the ingestion path, precisely so no view needs compensating logic.
 */
export function reduceDirectionalSides(
  profile: SourceFormatProfile,
  row: MappedRowView,
): DirectionalReduction {
  if (profile.directionalFill.kind === "ONE_SIDED") return { kind: "UNCHANGED" };

  const assetIn = firstNonEmpty(row.asset_in);
  const assetOut = firstNonEmpty(row.asset_out);
  const amountIn = toDecimal(row.amount_in)?.abs();
  const amountOut = toDecimal(row.amount_out)?.abs();

  if (
    assetIn === undefined ||
    assetOut === undefined ||
    amountIn === undefined ||
    amountOut === undefined ||
    assetIn.toUpperCase() !== assetOut.toUpperCase()
  ) {
    // Two assets, or only one side written: this is a genuine two-sided movement.
    return { kind: "UNCHANGED" };
  }

  if (amountOut.greaterThan(amountIn)) {
    // The origin exceeds the destination in the same asset, so the difference is the fee and the
    // destination figure is what actually moved.
    return {
      kind: "REDUCED_TO_OUTBOUND",
      asset: assetOut,
      amountOut: amountIn.toString(),
      feeQuantity: amountOut.minus(amountIn).toString(),
      droppedSide: "IN",
    };
  }

  // Equal amounts carry no direction of their own, so the row's own label decides which side is the
  // real one.
  const label = firstNonEmpty(row.tx_type)?.toLowerCase() ?? "";
  if (amountOut.equals(amountIn) && OUTBOUND_LABELS.has(label)) {
    return {
      kind: "REDUCED_TO_OUTBOUND",
      asset: assetOut,
      amountOut: amountIn.toString(),
      feeQuantity: null,
      droppedSide: "IN",
    };
  }

  return {
    kind: "REDUCED_TO_INBOUND",
    asset: assetIn,
    amountIn: amountIn.toString(),
    droppedSide: "OUT",
  };
}

/**
 * A row's own identity, or the statement that this source has none to give.
 *
 * The declaration is what makes this safe, and measurement is what makes the declaration: `txid` is
 * unique across all 34 real Kraken rows and `Transaction ID` across all 42 Bitvavo rows, so both are
 * identities; Bitunix's `Trx. ID` is *not* — `T0009` labels two separate ADA deposits, twelve minutes
 * and 538 ADA apart — so Bitunix declares none, and its rows are told apart by their content instead.
 *
 * Reading `tx_id` wherever a column happened to map to it is what made that Bitunix case a live defect:
 * two real deposits would have hashed alike and the second would have overwritten the first. So a
 * source that declares no identity has any mapped `tx_id` actively suppressed, not merely ignored.
 */
export function resolveRowIdentity(
  profile: SourceFormatProfile,
  data: TransactionMappedData,
): { readonly kind: "DECLARED"; readonly value: string } | { readonly kind: "CONTENT_DERIVED" } {
  if (profile.rowIdentity.kind === "CONTENT_DERIVED") return { kind: "CONTENT_DERIVED" };

  const stated = firstNonEmpty(
    profile.rowIdentity.field === "tx_id" ? data.tx_id : data.description,
  );
  // A declared column the row leaves blank states nothing, so it cannot stand in for identity.
  return stated === undefined ? { kind: "CONTENT_DERIVED" } : { kind: "DECLARED", value: stated };
}

/**
 * Whether a column may link two rows into one operation.
 *
 * Default-deny: a column nobody declared a reference is not one. `Grupo` looked like a link because
 * of its name, and merging on it collapsed 706 real rows into 5.
 */
export function isMergeKey(profile: SourceFormatProfile, column: string): boolean {
  const wanted = column.trim().toLowerCase();
  return profile.columnRoles.references.some((c) => c.trim().toLowerCase() === wanted);
}

export type InvariantOutcome =
  | { readonly kind: "VERIFIED"; readonly rowsChecked: number }
  /** The source ships no redundancy independent of the profile's own derivation. */
  | { readonly kind: "NOT_DECLARED" }
  | { readonly kind: "COULD_NOT_VERIFY"; readonly reason: string }
  | {
      readonly kind: "FAILED";
      readonly profileId: SourceFormatProfile["id"];
      readonly rowIndex: number;
      readonly expected: string;
      readonly actual: string;
    };

/** Which running balance a row belongs to: an asset, within a sub-wallet if the source names one. */
function balanceKey(row: MappedRowView): string {
  return `${rowAsset(row) ?? ""}|${row.metadata?.wallet ?? ""}`;
}

/**
 * How much the fee moves the running total, under the convention the profile declares.
 *
 * `null` means the profile states no convention to test. Deriving the expectation from the
 * declaration is what makes the check a test *of* the declaration: a check that always subtracts the
 * fee reconciles Kraken's real rows whatever the profile claims, and would agree with a profile
 * reading every one of those rows wrongly.
 */
function feeEffectOnBalance(
  convention: SourceFormatProfile["feeConvention"],
): "SUBTRACTED" | "ALREADY_INCLUDED" | null {
  switch (convention.kind) {
    case "NET_PLUS_FEE":
      // The reported amount is net, so the fee left the balance on top of it.
      return "SUBTRACTED";
    case "FEE_INSIDE_TOTAL":
    case "GROSS_AND_NET":
      // The reported figure already accounts for the fee; subtracting it would double the charge.
      return "ALREADY_INCLUDED";
    case "UNDETERMINED":
      return null;
  }
}

function checkRunningBalance(
  profile: SourceFormatProfile,
  rows: readonly MappedRowView[],
  rowOrder: "OLDEST_FIRST" | "NEWEST_FIRST",
): InvariantOutcome {
  const feeEffect = feeEffectOnBalance(profile.feeConvention);
  if (feeEffect === null) {
    return {
      kind: "COULD_NOT_VERIFY",
      reason: `${profile.id} declares no fee convention, so no balance can be expected`,
    };
  }
  const order =
    rowOrder === "OLDEST_FIRST"
      ? rows.map((row, index) => ({ row, index }))
      : rows.map((row, index) => ({ row, index })).reverse();

  // `undefined` marks a key whose chain has been broken by a row that stated no balance: later rows
  // for that asset cannot be checked against a total nobody knows.
  const running = new Map<string, Decimal | undefined>();
  let checked = 0;

  for (const { row, index } of order) {
    const key = balanceKey(row);
    const balance = toDecimal(row.balance);
    const amount = toDecimal(row.amount);

    if (balance === undefined || amount === undefined) {
      running.set(key, undefined);
      continue;
    }

    const previous = running.has(key) ? running.get(key) : new Decimal(0);
    if (previous === undefined) {
      running.set(key, balance);
      continue;
    }

    const fee = toDecimal(row.fee_amount) ?? new Decimal(0);
    const expected =
      feeEffect === "SUBTRACTED" ? previous.plus(amount).minus(fee) : previous.plus(amount);
    if (!expected.equals(balance)) {
      return {
        kind: "FAILED",
        profileId: profile.id,
        rowIndex: index,
        expected: expected.toString(),
        actual: row.balance ?? "",
      };
    }

    checked += 1;
    running.set(key, balance);
  }

  if (checked === 0) {
    return {
      kind: "COULD_NOT_VERIFY",
      reason: "no row states both a balance and an amount",
    };
  }
  return { kind: "VERIFIED", rowsChecked: checked };
}

/** How many decimals the source itself wrote, which is the scale its own figure is exact at. */
function decimalPlacesOf(value: string): number {
  const fraction = value.trim().split(".")[1];
  return fraction === undefined ? 0 : fraction.length;
}

function checkOverDeterminedRow(
  profile: SourceFormatProfile,
  rows: readonly MappedRowView[],
): InvariantOutcome {
  const feeEffect = feeEffectOnBalance(profile.feeConvention);
  if (feeEffect === null) {
    return {
      kind: "COULD_NOT_VERIFY",
      reason: `${profile.id} declares no fee convention, so no paid total can be expected`,
    };
  }
  let checked = 0;

  for (const [index, row] of rows.entries()) {
    const quantity = toDecimal(row.amount)?.abs();
    const price = toDecimal(row.price_fiat);
    const paidText = firstNonEmpty(row.total_fiat);
    const paid = toDecimal(paidText)?.abs();
    const feeText = firstNonEmpty(row.fee_amount);
    const fee = toDecimal(feeText);

    if (
      quantity === undefined ||
      price === undefined ||
      paid === undefined ||
      paidText === undefined ||
      fee === undefined
    ) {
      // A deposit or a withdrawal carries no price and no paid total, so there is nothing
      // over-determined about it. Reported as unverifiable rather than as verified.
      continue;
    }

    // The paid column is recorded at the source's own scale — Bitvavo writes it to the cent — so the
    // comparison is made there. Comparing at full precision would need a tolerance, and a tolerance
    // is what hides real drift.
    // Under `FEE_INSIDE_TOTAL` the paid figure contains the fee, so it belongs in the sum. Under
    // `NET_PLUS_FEE` it does not, and including it would agree with a profile reading the row wrongly.
    const gross =
      feeEffect === "ALREADY_INCLUDED" ? quantity.times(price).plus(fee) : quantity.times(price);
    const computed = gross.toDecimalPlaces(decimalPlacesOf(paidText));
    if (!computed.equals(paid)) {
      return {
        kind: "FAILED",
        profileId: profile.id,
        rowIndex: index,
        expected: computed.toString(),
        actual: paidText,
      };
    }
    checked += 1;
  }

  if (checked === 0) {
    return {
      kind: "COULD_NOT_VERIFY",
      reason: "no row states a quantity, a price, a fee and a paid total together",
    };
  }
  return { kind: "VERIFIED", rowsChecked: checked };
}

/**
 * Asserts whatever independent redundancy the source ships, over the rows as given.
 *
 * A profile that declares none reports exactly that. Reporting it as verified would be the failure
 * mode this whole dimension exists to avoid: the appearance of a check where there is none.
 */
export function checkProfileInvariant(
  profile: SourceFormatProfile,
  rows: readonly MappedRowView[],
): InvariantOutcome {
  const invariant = profile.invariant;
  switch (invariant.kind) {
    case "NONE":
      return { kind: "NOT_DECLARED" };
    case "RUNNING_BALANCE":
      return checkRunningBalance(profile, rows, invariant.rowOrder);
    case "OVER_DETERMINED_ROW":
      return checkOverDeterminedRow(profile, rows);
  }
}

/**
 * Applies a profile to one mapped row, and is the single implementation both sides of the ingestion
 * boundary call: the wizard for its preview, the use case for what it persists. Two implementations
 * would be two chances for the preview and the ledger to disagree about a quantity.
 *
 * Idempotent by construction — a reduced row has one side and a filled denomination, so a second pass
 * finds nothing left to do. Ingestion is retried, and a deduction applied twice is a silent loss.
 */
export function applyProfileToRow<Row extends MappedRowView>(
  profile: SourceFormatProfile,
  row: Row,
): Row {
  const applied: Row = { ...row, metadata: { ...(row.metadata ?? {}) } };

  const reduction = reduceDirectionalSides(profile, applied);
  if (reduction.kind === "REDUCED_TO_INBOUND") {
    applied.amount_in = reduction.amountIn;
    applied.asset_in = reduction.asset;
    applied.amount_out = undefined;
    applied.asset_out = undefined;
  } else if (reduction.kind === "REDUCED_TO_OUTBOUND") {
    applied.amount_out = reduction.amountOut;
    applied.asset_out = reduction.asset;
    applied.amount_in = undefined;
    applied.asset_in = undefined;

    if (reduction.feeQuantity !== null) {
      const stated = resolveFeeDenomination(profile, row);
      if (stated.kind === "FIAT_VALUATION") {
        // The source priced the fee in euros; the quantity that actually left the wallet is the
        // difference between the two sides. The valuation is kept because it is the only fiat figure
        // the source gave for this disposal.
        applied.metadata = {
          ...applied.metadata,
          fee_fiat_valuation: row.fee_amount ?? "",
          fee_fiat_currency: stated.currency,
        };
      }
      applied.fee_amount = reduction.feeQuantity;
      applied.fee_currency = reduction.asset;
    }
  }

  /**
   * A fee with no denomination is rejected by the ledger schema and by the SQL CHECK alike, and the
   * profile is the only thing that can say what an omitted fee currency means.
   *
   * A stated zero is denominated too, and for the same reason: the pair invariant admits no row with
   * an amount and no asset, so leaving a `0` undenominated forces it to be stored as `NULL` — which is
   * the state the source uses for a fee it never mentioned. 40 real rows say `0` explicitly.
   */
  if (firstNonEmpty(applied.fee_amount) !== undefined) {
    const denomination = declaredDenomination(profile, applied);
    if (
      denomination.kind === "ASSET_QUANTITY" &&
      firstNonEmpty(applied.fee_currency) === undefined
    ) {
      applied.fee_currency = denomination.asset;
    }
  }

  return applied;
}
