import Decimal from "decimal.js";

import type { NormalizerHandler } from "./types";
import { classifyCustodyMovement } from "../../custodyClassifier";

/**
 * Movement handlers. They delegate the meaning of the source label to `classifyCustodyMovement`,
 * which resolves it from the moved asset: crypto becomes non-taxable custody
 * (`TRANSFER_IN` / `TRANSFER_OUT`), fiat becomes funding (`DEPOSIT` / `WITHDRAWAL`).
 */

/**
 * `METADATA_DICTIONARY` renames Kraken's `subclass` column to `subtype`, so the normalised key is
 * the one present by the time a handler runs. Both are read: `subtype` after normalisation,
 * `subclass` for callers that invoke a handler directly.
 */
function readSubclass(
  metadata: Record<string, string> | undefined
): "crypto" | "fiat" | undefined {
  const raw = (metadata?.subtype ?? metadata?.subclass)?.trim().toLowerCase();
  return raw === "crypto" || raw === "fiat" ? raw : undefined;
}

/** `null` for anything that is not a number, so an unreadable cell fills no directional field. */
function magnitudeOf(amount: string): string | null {
  try {
    const value = new Decimal(amount);
    return value.isFinite() ? value.abs().toString() : null;
  } catch {
    return null;
  }
}

function firstPresent(...values: (string | null | undefined)[]): string | null {
  for (const value of values) {
    if (value !== null && value !== undefined && value.trim() !== "") return value;
  }
  return null;
}

/**
 * Applies the classifier, then moves the generic `amount` / `asset` fields into their directional
 * counterparts.
 *
 * An unclassifiable movement keeps `tx_type` exactly as the source reported it, so ingestion can
 * reject the row by name rather than receive a fabricated acquisition.
 */
const applyMovement: NormalizerHandler = (normalized) => {
  // First *non-empty* value, not first non-nullish: the column mapper writes "" for a cell the source
  // left blank, and a withdrawal's inbound columns are blank. Stopping at "" told the classifier the
  // movement had no asset, which rejected the row for want of information that was in the next field.
  const assetSymbol = firstPresent(normalized.asset, normalized.asset_in, normalized.asset_out) ?? "";
  const amount = firstPresent(normalized.amount, normalized.amount_in, normalized.amount_out);

  const classification = classifyCustodyMovement({
    rawType: normalized.tx_type ?? "",
    assetSymbol,
    amount,
    subclass: readSubclass(normalized.metadata),
  });

  if (classification.kind === "UNCLASSIFIED") return;

  normalized.tx_type = classification.txType;

  const isInbound =
    classification.txType === "TRANSFER_IN" || classification.txType === "DEPOSIT";

  // Direction lives in `tx_type` and the directional asset fields, never in the sign. The magnitude
  // is taken through `Decimal` rather than `Number`: a satoshi-scale quantity renders as `1e-8` and a
  // long one loses its last digits, and both figures are quantities of an asset a lot still holds.
  const magnitude = amount === null ? null : magnitudeOf(amount);

  if (isInbound) {
    if (magnitude !== null && !normalized.amount_in) normalized.amount_in = magnitude;
    if (assetSymbol && !normalized.asset_in) normalized.asset_in = assetSymbol;
  } else {
    if (magnitude !== null && !normalized.amount_out) normalized.amount_out = magnitude;
    if (assetSymbol && !normalized.asset_out) normalized.asset_out = assetSymbol;
  }
};

export const handleDeposit: NormalizerHandler = applyMovement;
export const handleWithdrawal: NormalizerHandler = applyMovement;
export const handleTransfer: NormalizerHandler = applyMovement;
