/**
 * FiscalIntegritySchemas — Anti-Corruption Layer for the pending-review surface and the
 * rebuild/ingestion/override outcome payloads.
 *
 * Mirrors, field for field, `apps/backend/src/core/infrastructure/dtos/fiscal-integrity.ts` and
 * `.../dtos/materialization.ts` — no field is invented beyond what those two files (and the use
 * cases behind them) actually expose.
 *
 * @see openspec/specs/fiscal-integrity/spec.md
 */

import { z } from 'zod'
import {
  FIFO_QUALITY_FLAGS,
  FLAG_SEVERITIES,
} from '@kryptofolio/shared-types'
import type {
  FiscalIntegrityDefectEntity,
  FiscalIntegrityGroupEntity,
  FiscalIntegrityReportEntity,
  MaterializationSummaryEntity,
  ReconciliationSummaryEntity,
  RebuildOutcomeEntity,
  IngestionOutcomeEntity,
  IngestionRejectionEntity,
  OverrideOutcomeEntity,
} from '@/core/domain/models/FiscalEntities'

// ---------------------------------------------------------------------------
// ExternalFiscalIntegritySchema — the pending-review surface
// ---------------------------------------------------------------------------

const ExternalFiscalIntegrityDefectSchema = z
  .object({
    quality_flag: z.enum(FIFO_QUALITY_FLAGS),
    severity: z.enum(FLAG_SEVERITIES),
    asset_id: z.string().nullable(),
    account_id: z.string().nullable(),
    tx_id: z.string().nullable(),
    occurred_at: z.string().nullable(),
    detail_key: z.string().min(1),
    pending_review: z.boolean(),
  })
  .transform(
    (raw): FiscalIntegrityDefectEntity => ({
      qualityFlag: raw.quality_flag,
      severity: raw.severity,
      assetId: raw.asset_id,
      accountId: raw.account_id,
      txId: raw.tx_id,
      occurredAt: raw.occurred_at,
      detailKey: raw.detail_key,
      pendingReview: raw.pending_review,
    }),
  )

const ExternalFiscalIntegrityGroupSchema = z
  .object({
    quality_flag: z.enum(FIFO_QUALITY_FLAGS),
    severity: z.enum(FLAG_SEVERITIES),
    count: z.number().int().nonnegative(),
    pendingReview: z.number().int().nonnegative(),
    rows: z.array(ExternalFiscalIntegrityDefectSchema),
  })
  .transform(
    (raw): FiscalIntegrityGroupEntity => ({
      qualityFlag: raw.quality_flag,
      severity: raw.severity,
      count: raw.count,
      pendingReview: raw.pendingReview,
      rows: raw.rows,
    }),
  )

export const ExternalFiscalIntegritySchema = z
  .object({
    groups: z.array(ExternalFiscalIntegrityGroupSchema),
    totalDefects: z.number().int().nonnegative(),
    pendingReview: z.number().int().nonnegative(),
    needsRecalculation: z.boolean(),
  })
  .transform(
    (raw): FiscalIntegrityReportEntity => ({
      groups: raw.groups,
      totalDefects: raw.totalDefects,
      pendingReview: raw.pendingReview,
      needsRecalculation: raw.needsRecalculation,
    }),
  )

export type ExternalFiscalIntegrityDTO = z.infer<typeof ExternalFiscalIntegritySchema>

// ---------------------------------------------------------------------------
// Materialization summary — shared by the rebuild, ingestion and override outcomes
// ---------------------------------------------------------------------------

const ExternalReconciliationSummarySchema = z.object({
  inserted: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
  retired: z.number().int().nonnegative(),
  reactivated: z.number().int().nonnegative(),
}) satisfies z.ZodType<ReconciliationSummaryEntity>

const ExternalMaterializationSummarySchema = z.object({
  taxLots: ExternalReconciliationSummarySchema,
  lotHistoryEvents: ExternalReconciliationSummarySchema,
  custodyEntries: ExternalReconciliationSummarySchema,
  flagged: z.number().int().nonnegative(),
  pendingReview: z.number().int().nonnegative(),
}) satisfies z.ZodType<MaterializationSummaryEntity>

// ---------------------------------------------------------------------------
// ExternalRebuildOutcomeSchema — shared by the automatic path and the explicit retry
// ---------------------------------------------------------------------------

export const ExternalRebuildOutcomeSchema = z.object({
  materialized: z.boolean(),
  materialization: ExternalMaterializationSummarySchema.nullable(),
  materializationError: z.string().nullable(),
  pendingReview: z.number().int().nonnegative(),
}) satisfies z.ZodType<RebuildOutcomeEntity>

export type ExternalRebuildOutcomeDTO = z.infer<typeof ExternalRebuildOutcomeSchema>

// ---------------------------------------------------------------------------
// ExternalIngestionOutcomeSchema — the ingestion response, with structured rejections
// ---------------------------------------------------------------------------

const ExternalIngestionRejectionSchema = z.object({
  idHash: z.string().min(1),
  timestamp: z.string(),
  txType: z.string().nullable(),
  // Required: a rejection without a reason leaves the user unable to correct the row.
  reason: z.string().min(1),
}) satisfies z.ZodType<IngestionRejectionEntity>

export const ExternalIngestionOutcomeSchema = ExternalRebuildOutcomeSchema.and(
  z.object({
    status: z.literal('success'),
    processedCount: z.number().int().nonnegative(),
    message: z.string(),
    rejected: z.array(ExternalIngestionRejectionSchema),
    unresolvedFiat: z.number().int().nonnegative(),
  }),
) satisfies z.ZodType<IngestionOutcomeEntity>

export type ExternalIngestionOutcomeDTO = z.infer<typeof ExternalIngestionOutcomeSchema>

// ---------------------------------------------------------------------------
// ExternalOverrideOutcomeSchema — what an override mutation wrote, and the rebuild that followed
// ---------------------------------------------------------------------------

export const ExternalOverrideOutcomeSchema = z.object({
  applied: z.number().int().nonnegative(),
  materialization: ExternalMaterializationSummarySchema.nullable(),
  pendingReview: z.number().int().nonnegative(),
}) satisfies z.ZodType<OverrideOutcomeEntity>

export type ExternalOverrideOutcomeDTO = z.infer<typeof ExternalOverrideOutcomeSchema>
