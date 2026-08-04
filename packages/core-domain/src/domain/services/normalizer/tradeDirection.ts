import { isFiatCurrencyCode } from "@kryptofolio/shared-types";
import type { TransactionRow } from "@kryptofolio/shared-types";

/**
 * Reads a trade's direction from the sides it ended up with.
 *
 * `trade` is the same word for a purchase and a sale — Kraken writes it on both legs of both — so the
 * direction lives nowhere in the label and only in which side each leg landed on. That is knowable
 * once the legs are one record and not before, which is why this runs after aggregation rather than
 * inside the per-leg normalizer.
 *
 * A record whose direction cannot be read keeps the source's own word, so `toSpotTxType` rejects it by
 * name. That refusal is the point: mapping the word to `BUY` recorded every sale in the corpus as an
 * acquisition, with the label contradicting the sides of the very same record.
 */
export function resolveTradeDirection(row: TransactionRow): TransactionRow {
  if (row.mappedData.tx_type?.toUpperCase() !== "TRADE") return row;

  const resolved = directionOf(row);
  if (resolved === null) return row;

  return withTxType(row, resolved);
}

/** Generic in the row, so a valid row stays valid and an invalid one keeps its errors. */
function withTxType<T extends TransactionRow>(row: T, tx_type: string): T {
  return { ...row, mappedData: { ...row.mappedData, tx_type } };
}

/** A side is only a side if it names an asset: absent, null and blank are all "no side here". */
function sideAsset(value: string | null | undefined): string | undefined {
  if (value === null || value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function directionOf(row: TransactionRow): "BUY" | "SELL" | "SWAP" | null {
  const assetOut = sideAsset(row.mappedData.asset_out);
  const assetIn = sideAsset(row.mappedData.asset_in);

  if (assetOut !== undefined && assetIn !== undefined) {
    const paidInMoney = isFiatCurrencyCode(assetOut);
    const receivedMoney = isFiatCurrencyCode(assetIn);

    // Money for money is a currency exchange, and no member of the type vocabulary means one.
    if (paidInMoney && receivedMoney) return null;
    if (paidInMoney) return "BUY";
    if (receivedMoney) return "SELL";
    return "SWAP";
  }

  /**
   * A source that states both sides in one row has its fiat side folded onto `total_fiat`, leaving the
   * asset side alone. The folded currency is then the only evidence that money moved at all.
   */
  if (sideAsset(row.mappedData.fiat_currency) === undefined) return null;
  if (assetIn !== undefined) return "BUY";
  if (assetOut !== undefined) return "SELL";

  return null;
}
