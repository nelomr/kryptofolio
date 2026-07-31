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

/**
 * Applies the classifier, then moves the generic `amount` / `asset` fields into their directional
 * counterparts.
 *
 * An unclassifiable movement keeps `tx_type` exactly as the source reported it, so ingestion can
 * reject the row by name rather than receive a fabricated acquisition.
 */
const applyMovement: NormalizerHandler = (normalized) => {
  const assetSymbol = normalized.asset ?? normalized.asset_in ?? normalized.asset_out ?? "";
  const amount = normalized.amount ?? normalized.amount_in ?? normalized.amount_out ?? null;

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

  // Direction lives in `tx_type` and the directional asset fields, never in the sign.
  const numeric = amount === null ? Number.NaN : Number(amount);
  const magnitude = Number.isFinite(numeric) ? String(Math.abs(numeric)) : null;

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
