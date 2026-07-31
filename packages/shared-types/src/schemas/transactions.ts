import { z } from "zod";
import Decimal from "decimal.js";

export const preciseAmountSchema = z
  .string()
  .regex(/^-?\d+(\.\d+)?$/, "Must be a valid decimal string")
  .refine((val) => {
    try {
      new Decimal(val);
      return true;
    } catch {
      return false;
    }
  }, "Invalid financial number");

/**
 * A precise amount that must be a non-negative MAGNITUDE.
 *
 * Fiat values (`total_fiat`, `price_fiat`, `unit_cost_fiat`, …) carry no direction: that is
 * conveyed by `tx_type` together with `asset_in_id` / `asset_out_id`. Permitting a sign is what
 * let a Kraken CSV's negative EUR cost leg reach the ledger as `total_fiat = '-300.00'`,
 * producing a `unit_cost_fiat` of `-1.6724 €/XRP` and turning zero-priced transfer disposals into
 * *positive* capital gains.
 *
 * Use `preciseAmountSchema` only where a value is a genuine signed delta, such as
 * `lot_custody_entries.qty_delta`.
 */
export const nonNegativePreciseAmountSchema = preciseAmountSchema.refine(
  (val) => !new Decimal(val).isNegative(),
  "Fiat magnitudes must be non-negative; direction is carried by tx_type, not by sign"
);
