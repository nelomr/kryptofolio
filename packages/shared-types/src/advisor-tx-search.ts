import { z } from 'zod';
import { upperCasedSymbolSchema } from './advisor-scenarios.js';
import { SPOT_TX_TYPES } from './schemas/spot-tx-types.js';

/** A calendar day, not just a shaped string: `2024-02-30` is rejected. */
const isoDaySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
  }, 'Must be a real calendar date');

export const txSearchInputSchema = z
  .object({
    symbol: upperCasedSymbolSchema.optional(),
    from: isoDaySchema.optional(),
    to: isoDaySchema.optional(),
    types: z.array(z.enum(SPOT_TX_TYPES)).min(1).optional(),
    page: z.number().int().min(1).default(1),
  })
  .strict();
