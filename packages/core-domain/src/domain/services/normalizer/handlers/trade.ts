import Decimal from "decimal.js";
import type { TransactionMappedData } from "@kryptofolio/shared-types";
import { isFiatCurrencyCode } from "@kryptofolio/shared-types";

import type { NormalizerHandler } from "./types";

/**
 * A bare `trade` names an operation without naming its direction, exactly as a bare `transfer` does.
 *
 * Kraken writes one trade as two rows sharing a `refid`, each carrying its own signed amount: the
 * negative leg is what was spent and the positive leg is what was received. Reading both as a
 * purchase — which is what routing `trade` to `handleBuy` did — put a negative quantity in `amount_in`
 * and was survivable only because aggregation used to run first and redistribute it by sign. With
 * direction resolved per leg before anything is grouped, the sign is read where it is written.
 *
 * A `trade` row that states both sides already carries its own direction and is left to `handleBuy`,
 * which folds the outbound side into the fiat total. Bit2Me writes its trades that way.
 */
export const handleTrade: NormalizerHandler = (normalized) => {
  if (!normalized.amount) {
    handleBuy(normalized);
    return;
  }

  const text = normalized.amount.trim();
  const value = new Decimal(text);
  // The sign is removed as text: `new Decimal('7704.160').toString()` is `7704.16`, and the scale a
  // source wrote a quantity at is the scale its own figure is exact at.
  const magnitude = text.startsWith('-') || text.startsWith('+') ? text.slice(1) : text;

  if (value.isNegative()) {
    if (!normalized.amount_out) normalized.amount_out = magnitude;
    if (normalized.asset && !normalized.asset_out) normalized.asset_out = normalized.asset;
    return;
  }

  if (!normalized.amount_in) normalized.amount_in = magnitude;
  if (normalized.asset && !normalized.asset_in) normalized.asset_in = normalized.asset;
};

/**
 * Moves a directional side onto the fiat magnitudes, when that side is money the source did not also
 * report as a total.
 *
 * The two fields move together, and so do the two they leave behind. Folding the asset while keeping
 * the amount left a row with `amount_out` and no `asset_out`, which the ledger's
 * `(amount_out IS NULL) = (asset_out_id IS NULL)` CHECK rejects outright — invisible while this ran
 * only in the client, and a failed insert as soon as it ran behind the ingestion boundary.
 *
 * Only a fiat side is folded. `20000 USDT` paid for BTC is a quantity of an asset, and recording it as
 * a fiat total both invents a currency the user does not report in and loses the disposal.
 */
function foldFiatSide(
  normalized: TransactionMappedData,
  side: "in" | "out",
): void {
  const amount = side === "in" ? normalized.amount_in : normalized.amount_out;
  const asset = side === "in" ? normalized.asset_in : normalized.asset_out;

  if (!amount || !asset) return;
  if (normalized.total_fiat || normalized.fiat_currency) return;
  if (!isFiatCurrencyCode(asset)) return;

  normalized.total_fiat = amount;
  normalized.fiat_currency = asset;
  if (side === "in") {
    delete normalized.amount_in;
    delete normalized.asset_in;
  } else {
    delete normalized.amount_out;
    delete normalized.asset_out;
  }
}

export const handleBuy: NormalizerHandler = (normalized) => {
  // If generic amount/asset is present, a BUY means we RECEIVED this asset
  if (normalized.amount && !normalized.amount_in) {
    normalized.amount_in = normalized.amount;
  }
  if (normalized.asset && !normalized.asset_in) {
    normalized.asset_in = normalized.asset;
  }

  // What was paid, when the source stated it as the outbound side of the row.
  foldFiatSide(normalized, "out");
};

export const handleSell: NormalizerHandler = (normalized) => {
  // If generic amount/asset is present, a SELL means we SENT this asset
  if (normalized.amount && !normalized.amount_out) {
    normalized.amount_out = normalized.amount;
  }
  if (normalized.asset && !normalized.asset_out) {
    normalized.asset_out = normalized.asset;
  }

  // What was received, when the source stated it as the inbound side of the row.
  foldFiatSide(normalized, "in");
};
