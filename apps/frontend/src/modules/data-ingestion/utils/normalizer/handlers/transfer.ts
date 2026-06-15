import type { NormalizerHandler } from "./types";

export const handleDeposit: NormalizerHandler = (normalized) => {
  if (normalized.amount && !normalized.amount_in) {
    normalized.amount_in = normalized.amount;
  }
  if (normalized.asset && !normalized.asset_in) {
    normalized.asset_in = normalized.asset;
  }
};

export const handleWithdrawal: NormalizerHandler = (normalized) => {
  if (normalized.amount && !normalized.amount_out) {
    normalized.amount_out = normalized.amount;
  }
  if (normalized.asset && !normalized.asset_out) {
    normalized.asset_out = normalized.asset;
  }
};

export const handleTransfer: NormalizerHandler = (normalized) => {
  // If we have a generic amount and it's positive, we received it (TRANSFER_IN)
  // If it's negative, we sent it (TRANSFER_OUT)
  if (normalized.amount && normalized.asset) {
    const amountVal = Number(normalized.amount);
    if (amountVal > 0 && !normalized.amount_in) {
      normalized.tx_type = "TRANSFER_IN";
      normalized.amount_in = String(amountVal);
      normalized.asset_in = normalized.asset;
    } else if (amountVal < 0 && !normalized.amount_out) {
      normalized.tx_type = "TRANSFER_OUT";
      normalized.amount_out = String(Math.abs(amountVal));
      normalized.asset_out = normalized.asset;
    }
  }
};
