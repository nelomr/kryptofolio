/**
 * Merges an active `spot_transaction_overrides` row onto its imported `spot_transactions` row for
 * DISPLAY: the per-field `*_edited` flags decide, field by field, whether the edited value or the
 * original one is shown — mirroring `v_effective_spot_transactions` in DuckDB (design.md D5), but
 * here for the read model `GET /tax/transactions/spot` returns, which reads SQLite directly and
 * never touches that DuckDB view.
 *
 * Real defect this fixes: `withOverrideView` (routes/tax.ts) tagged an edited row with
 * `override.kind === 'ACTIVE'` but always returned the row's ORIGINAL values — the Ledgers table
 * showed the "edited" badge with none of the edited figures behind it, on first load and on every
 * reload, because the row it received never carried them.
 *
 * Pure domain (rule 3): no SQL, no Zod, no I/O. Identity/routing fields (`id`, `id_hash`,
 * `account_id`, `transfer_group_id`, `status`) are never touched, even if an override happened to
 * carry a value for one — same invariant `v_effective_spot_transactions` enforces in DuckDB.
 */
import type { LedgerSpotTransaction, LedgerSpotTransactionOverride } from '../ports/ILedgerPort';

export function toEffectiveSpotTransaction(
  tx: LedgerSpotTransaction,
  override: LedgerSpotTransactionOverride | null
): LedgerSpotTransaction {
  if (!override) return tx;

  const effective: LedgerSpotTransaction = { ...tx };

  if (override.amount_in_edited) effective.amount_in = override.amount_in ?? undefined;
  if (override.amount_out_edited) effective.amount_out = override.amount_out ?? undefined;
  if (override.total_fiat_edited) effective.total_fiat = override.total_fiat;
  if (override.price_edited) {
    effective.price_fiat = override.price_fiat;
    // A price edit requires its own currency (the port/migration CHECK enforces this), so it's
    // always non-null here — the `?? tx.fiat_currency` fallback exists only to satisfy the type,
    // never to paper over a genuinely missing value.
    effective.fiat_currency = override.fiat_currency ?? tx.fiat_currency;
  }
  if (override.timestamp_edited && override.timestamp) effective.timestamp = override.timestamp;
  if (override.tx_type_edited && override.tx_type) effective.tx_type = override.tx_type;

  switch (override.fee_kind) {
    case 'NONE':
      effective.fee_amount = undefined;
      effective.fee_asset_id = undefined;
      break;
    case 'CHARGED':
      effective.fee_amount = override.fee_amount ?? undefined;
      effective.fee_asset_id = override.fee_asset_id ?? undefined;
      break;
    case 'UNCHANGED':
      break;
  }

  return effective;
}
