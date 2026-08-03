import { z } from 'zod';
import { FIFO_QUALITY_FLAGS, FLAG_SEVERITIES } from '@kryptofolio/shared-types';

/**
 * Outbound DTO for the pending-review surface.
 *
 * The vocabularies come from the shared package, so a flag or a severity the rest of the system
 * does not know cannot leave the process. Parsed on the way out for the same reason the rebuild
 * outcome is: a lost count would otherwise surface as a silently healthy report.
 */

const dataQualityRowSchema = z.object({
  quality_flag: z.enum(FIFO_QUALITY_FLAGS),
  severity: z.enum(FLAG_SEVERITIES),
  asset_id: z.string().nullable(),
  account_id: z.string().nullable(),
  tx_id: z.string().nullable(),
  occurred_at: z.string().nullable(),
  /** An i18n key, never prose: the backend emits no user-facing copy. */
  detail_key: z.string().min(1),
  pending_review: z.boolean(),
});

const dataQualityGroupSchema = z.object({
  quality_flag: z.enum(FIFO_QUALITY_FLAGS),
  severity: z.enum(FLAG_SEVERITIES),
  count: z.number().int().nonnegative(),
  pendingReview: z.number().int().nonnegative(),
  rows: z.array(dataQualityRowSchema),
});

export const fiscalIntegrityReportSchema = z.object({
  groups: z.array(dataQualityGroupSchema),
  totalDefects: z.number().int().nonnegative(),
  pendingReview: z.number().int().nonnegative(),
  needsRecalculation: z.boolean(),
});

export type FiscalIntegrityReportDto = z.infer<typeof fiscalIntegrityReportSchema>;
