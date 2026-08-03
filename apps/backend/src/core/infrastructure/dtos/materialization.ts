import { z } from 'zod';

/**
 * Outbound DTOs for everything a rebuild reports.
 *
 * The response is parsed through these before it leaves the process, so a summary that lost a field
 * on its way out fails here rather than in the UI, where the only symptom would be a missing count.
 */

const reconciliationSummarySchema = z.object({
  inserted: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
  retired: z.number().int().nonnegative(),
  reactivated: z.number().int().nonnegative(),
});

export const materializationSummarySchema = z.object({
  taxLots: reconciliationSummarySchema,
  lotHistoryEvents: reconciliationSummarySchema,
  custodyEntries: reconciliationSummarySchema,
  flagged: z.number().int().nonnegative(),
  pendingReview: z.number().int().nonnegative(),
});

/** Shared by the automatic path and the explicit retry, so the two cannot drift apart. */
export const rebuildOutcomeSchema = z.object({
  materialized: z.boolean(),
  materialization: materializationSummarySchema.nullable(),
  materializationError: z.string().nullable(),
  /** Rows a user can resolve by declaring a value or a destination. `0` when no rebuild ran. */
  pendingReview: z.number().int().nonnegative(),
});

export const ingestionOutcomeSchema = rebuildOutcomeSchema.extend({
  status: z.literal('success'),
  processedCount: z.number().int().nonnegative(),
  message: z.string(),
});

/** What an override mutation reports: what it wrote, and the rebuild that followed. */
export const overrideOutcomeSchema = z.object({
  applied: z.number().int().nonnegative(),
  materialization: materializationSummarySchema.nullable(),
  pendingReview: z.number().int().nonnegative(),
});

export type OverrideOutcomeDto = z.infer<typeof overrideOutcomeSchema>;
export type RebuildOutcomeDto = z.infer<typeof rebuildOutcomeSchema>;
export type IngestionOutcomeDto = z.infer<typeof ingestionOutcomeSchema>;
