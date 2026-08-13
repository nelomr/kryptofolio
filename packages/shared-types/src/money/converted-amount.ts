import { z } from "zod";
import { SUPPORTED_CURRENCIES } from "./models.js";
import { preciseAmountSchema } from "../schemas/transactions.js";

/**
 * The outcome of expressing a figure in the user's display currency.
 *
 * Deliberately disjoint from `FIFO_QUALITY_FLAGS`. A quality flag means the engine
 * could not build a lot's cost basis, is persisted under a SQLite CHECK, and is read
 * by the tax report. A conversion outcome means the lot is sound and the *view*
 * cannot express it in the requested currency — it is read-time, never persisted,
 * and could not be: the display currency is unknown at materialisation time, which
 * is when the flag column is written.
 *
 * A lot may of course carry a genuine `MISSING_FX_RATE` as well; the two signals
 * travel independently and mean different things.
 */
export const CONVERSION_OUTCOMES = ["CONVERTED", "NATIVE", "UNCONVERTIBLE"] as const;

export type ConversionOutcome = (typeof CONVERSION_OUTCOMES)[number];

const fiatCurrencySchema = z.enum(SUPPORTED_CURRENCIES);
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be an ISO YYYY-MM-DD date");

/**
 * `NATIVE` is a separate arm rather than `CONVERTED` with a rate of `1`, so the
 * identity case is visible in the type instead of inferred from a rate value.
 * `exchange_rates` stores `USD/EUR` only and `EUR/USD` is an inversion bounded at
 * twelve decimals, so a USD figure round-tripped through EUR comes back changed in
 * its last places. A conversion to the currency you were already in must be the
 * identity function.
 */
export const convertedAmountSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("CONVERTED"),
      amount: preciseAmountSchema,
      currency: fiatCurrencySchema,
      rate: preciseAmountSchema,
      rateDate: isoDateSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("NATIVE"),
      amount: preciseAmountSchema,
      currency: fiatCurrencySchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("UNCONVERTIBLE"),
      nativeAmount: preciseAmountSchema,
      // Not narrowed to SUPPORTED_CURRENCIES, unlike every other currency in this union. The
      // native currency is whatever the source stated on the row — a ledger may hold a code the
      // money model cannot represent, and that is *itself* a reason a figure is unconvertible.
      // Narrowing it would force a cast at the one boundary where the unrepresentable case is the
      // case being reported.
      nativeCurrency: z.string().min(3).max(3),
      // Always narrowed: the requested currency is chosen from SUPPORTED_CURRENCIES, never parsed.
      requested: fiatCurrencySchema,
    })
    .strict(),
]);

export type ConvertedAmount = z.infer<typeof convertedAmountSchema>;

/** Whether the figure reached the requested currency — only `UNCONVERTIBLE` did not. */
export function isConvertible(value: ConvertedAmount): boolean {
  return value.kind !== "UNCONVERTIBLE";
}

/**
 * The honest figure and the currency it is actually denominated in.
 *
 * `UNCONVERTIBLE` keeps its native amount precisely so the UI can show the real
 * number in the wrong currency rather than a blank, a zero, or a plausible wrong
 * number produced by a fallback rate.
 */
export function nativeAmountOf(value: ConvertedAmount): {
  readonly amount: string;
  readonly currency: string;
} {
  return value.kind === "UNCONVERTIBLE"
    ? { amount: value.nativeAmount, currency: value.nativeCurrency }
    : { amount: value.amount, currency: value.currency };
}
