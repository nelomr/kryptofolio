import { z } from "zod";
import { nonNegativePreciseAmountSchema } from "./transactions.js";
import { SPOT_TX_TYPES } from "./spot-tx-types.js";

/**
 * Per-field edit discriminant: a field is either left as-is, or explicitly set to a new value.
 * Modeled as a union (rule 5) rather than an optional value, so "not edited" and "edited to a
 * falsy/empty value" cannot be confused — the same shape the fee union below extends for the
 * three-way "unchanged / removed / charged" distinction.
 */
function editable<T extends z.ZodTypeAny>(valueSchema: T) {
  return z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("UNCHANGED") }),
    z.object({ kind: z.literal("SET"), value: valueSchema }),
  ]);
}

/**
 * The price field is not a plain `editable()` — an edited price without its currency is not
 * interpretable (the same rule `ManualPriceOverrideSchema` already enforced), so `fiatCurrency`
 * rides along on the `SET` arm exactly like `fee`'s `CHARGED` arm carries `assetId`.
 */
const priceFieldSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("UNCHANGED") }),
  z.object({
    kind: z.literal("SET"),
    value: nonNegativePreciseAmountSchema,
    fiatCurrency: z.string().min(3).max(3),
  }),
]);

const feeFieldSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("UNCHANGED") }),
  z.object({ kind: z.literal("NONE") }),
  z.object({
    kind: z.literal("CHARGED"),
    amount: nonNegativePreciseAmountSchema,
    assetId: z.string().min(1),
  }),
]);

/**
 * Editable fields of a spot transaction (rule 6): everything that affects P&L or FIFO order.
 * `account_id`, `asset_in_id`, `asset_out_id`, `transfer_group_id` and `status` are deliberately
 * absent — editing them is out of scope (see design.md D4/D9) and `.strict()` rejects a payload
 * that tries to set them, rather than silently ignoring extra keys.
 */
const spotTransactionEditShape = z
  .object({
    amount_in: editable(nonNegativePreciseAmountSchema),
    amount_out: editable(nonNegativePreciseAmountSchema),
    price_fiat: priceFieldSchema,
    total_fiat: editable(nonNegativePreciseAmountSchema.nullable()),
    fee: feeFieldSchema,
    timestamp: editable(z.string().datetime()),
    tx_type: editable(z.enum(SPOT_TX_TYPES)),
  })
  .strict();

export type SpotTransactionEditInput = z.infer<typeof spotTransactionEditShape>;

export const spotTransactionEditSchema = spotTransactionEditShape.refine(
  (payload) => !isAllUnchanged(payload),
  {
    message: "at least one field must be edited; use Restore to remove an override instead",
  },
);

export type EditableField =
  | "amount_in"
  | "amount_out"
  | "price_fiat"
  | "total_fiat"
  | "fee"
  | "timestamp"
  | "tx_type";

export type SpotEditBalanceCheck =
  | { kind: "CLEAN" }
  | {
      kind: "NEGATIVE_BALANCE";
      entries: readonly {
        assetId: string;
        accountId: string;
        balance: string;
        tolerance: string;
      }[];
    };

/**
 * True when a payload edits nothing at all — every union field is `UNCHANGED` and the fee is
 * `UNCHANGED`. Used both by the schema-level refine above and by the route (group 4), which needs
 * to distinguish this case from a genuine 422 to point the user at Restore instead.
 */
export function isAllUnchanged(payload: SpotTransactionEditInput): boolean {
  return (
    payload.amount_in.kind === "UNCHANGED" &&
    payload.amount_out.kind === "UNCHANGED" &&
    payload.price_fiat.kind === "UNCHANGED" &&
    payload.total_fiat.kind === "UNCHANGED" &&
    payload.fee.kind === "UNCHANGED" &&
    payload.timestamp.kind === "UNCHANGED" &&
    payload.tx_type.kind === "UNCHANGED"
  );
}
