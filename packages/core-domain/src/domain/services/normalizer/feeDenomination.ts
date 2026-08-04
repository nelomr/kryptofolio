import type { TransactionMappedData } from "@kryptofolio/shared-types";

/**
 * Gives a fee amount the denomination its source left implicit.
 *
 * Some exports carry a fee column and no fee-currency column — Kraken spot is one — because the fee is
 * understood to be charged in the same asset the row moves. That understanding has to be made explicit
 * here: an amount without a denomination is rejected by the ledger schema and by the SQL CHECK alike,
 * so the row cannot be persisted at all.
 *
 * It runs beside the label handlers rather than inside them because the rule is indifferent to the
 * label — a trade, a deposit and a withdrawal all need it — and because this is the last point at which
 * the row's own asset is still in scope. Row aggregation, which fills the denomination for merged
 * groups, never sees a single-leg row, which is why those rows had none.
 */
export function fillImplicitFeeDenomination(normalized: TransactionMappedData): void {
  // An empty cell is an absent fee, and absence must stay distinguishable from an explicit zero.
  const feeAmount = normalized.fee_amount
  if (feeAmount === undefined || feeAmount === null || feeAmount.trim() === "") return;

  const statedCurrency = normalized.fee_currency
  if (statedCurrency !== undefined && statedCurrency !== null && statedCurrency.trim() !== "") return;

  const rowAsset = normalized.asset ?? normalized.asset_out ?? normalized.asset_in;
  if (!rowAsset || rowAsset.trim() === "") return;

  normalized.fee_currency = rowAsset;
}
