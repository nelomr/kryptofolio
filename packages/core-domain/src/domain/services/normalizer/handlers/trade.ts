import type { NormalizerHandler } from "./types";

export const handleBuy: NormalizerHandler = (normalized) => {
  // If generic amount/asset is present, a BUY means we RECEIVED this asset
  if (normalized.amount && !normalized.amount_in) {
    normalized.amount_in = normalized.amount;
  }
  if (normalized.asset && !normalized.asset_in) {
    normalized.asset_in = normalized.asset;
  }

  // If there's an outgoing generic mapping that should be fiat
  if (normalized.amount_out && !normalized.total_fiat) {
    normalized.total_fiat = normalized.amount_out;
    delete normalized.amount_out;
  }
  if (normalized.asset_out && !normalized.fiat_currency) {
    normalized.fiat_currency = normalized.asset_out;
    delete normalized.asset_out;
  }
};

export const handleSell: NormalizerHandler = (normalized) => {
  // If generic amount/asset is present, a SELL means we SENT this asset
  if (normalized.amount && !normalized.amount_out) {
    normalized.amount_out = normalized.amount;
  }
  if (normalized.asset && !normalized.asset_out) {
    normalized.asset_out = normalized.asset;
  }

  // If there's an incoming generic mapping that should be fiat
  if (normalized.amount_in && !normalized.total_fiat) {
    normalized.total_fiat = normalized.amount_in;
    delete normalized.amount_in;
  }
  if (normalized.asset_in && !normalized.fiat_currency) {
    normalized.fiat_currency = normalized.asset_in;
    delete normalized.asset_in;
  }
};
