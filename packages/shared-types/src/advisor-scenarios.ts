import { z } from 'zod';
import Decimal from 'decimal.js';
import { SYMBOL_REGEX } from './advisor-stream.js';
import { preciseAmountSchema } from './schemas/transactions.js';

/** A model often types `btc` for `BTC`; the boundary upper-cases once and then enforces the ledger's symbol shape. */
export const upperCasedSymbolSchema = z
  .string()
  .transform((value) => value.toUpperCase())
  .pipe(z.string().regex(SYMBOL_REGEX));

const MIN_PCT = new Decimal(-100);
const MAX_PCT = new Decimal(1000);
export const MAX_SHOCK_ENTRIES = 25;

/** A refinement still runs after the base format check fails, so it must not assume a parseable decimal. */
function parseDecimal(value: string): Decimal | undefined {
  try {
    return new Decimal(value);
  } catch {
    return undefined;
  }
}

/** A price cannot be negative; zero is a valid scenario (the asset goes to nothing). */
export const scenarioPriceSchema = preciseAmountSchema.refine((value) => parseDecimal(value)?.isNegative() === false, {
  message: 'A hypothetical price cannot be negative',
});

/** Closed range: below -100 the shocked value would turn negative, above 1000 the scenario stops being a what-if. */
export const scenarioPctSchema = preciseAmountSchema.refine(
  (value) => {
    const pct = parseDecimal(value);
    return pct !== undefined && pct.gte(MIN_PCT) && pct.lte(MAX_PCT);
  },
  { message: 'A percentage must be between -100 and 1000' },
);

export const scenarioPositionValueInputSchema = z
  .object({ symbol: upperCasedSymbolSchema, hypotheticalPrice: scenarioPriceSchema })
  .strict();

export const breakevenPriceInputSchema = z.object({ symbol: upperCasedSymbolSchema }).strict();

const shockSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('uniform'), pct: scenarioPctSchema }).strict(),
  z
    .object({
      kind: z.literal('per_asset'),
      shocks: z
        .array(z.object({ symbol: upperCasedSymbolSchema, pct: scenarioPctSchema }).strict())
        .min(1)
        .max(MAX_SHOCK_ENTRIES),
    })
    .strict(),
]);

/** Wrapped in an object because model providers require a tool's root input schema to be an object, not a union. */
export const portfolioShockInputSchema = z.object({ shock: shockSchema }).strict();
