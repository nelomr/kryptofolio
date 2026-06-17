import type { NormalizerHandler } from "./types";

export const handleCryptoIncome: NormalizerHandler = (normalized) => {
  if (normalized.amount && !normalized.amount_in) {
    normalized.amount_in = normalized.amount;
  }
  if (normalized.asset && !normalized.asset_in) {
    normalized.asset_in = normalized.asset;
  }
};

export const handleCryptoExpense: NormalizerHandler = (normalized) => {
  if (normalized.amount && !normalized.amount_out) {
    normalized.amount_out = normalized.amount;
  }
  if (normalized.asset && !normalized.asset_out) {
    normalized.asset_out = normalized.asset;
  }
};
