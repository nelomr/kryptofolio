/**
 * FiscalIntegritySchemas — anti-corruption layer for the pending-review surface and the
 * rebuild/ingestion/override outcome payloads group 10 added to the backend.
 *
 * The fixtures below are typed against the backend's own DTO/use-case definitions
 * (type-only deep imports, erased at build time — no backend runtime code executes) so a
 * drift in the backend's actual shape fails this test at compile time, not only at runtime
 * against a fixture this file invented independently.
 */
import { describe, it, expect } from 'vitest'
import type { FiscalIntegrityReport } from '@kryptofolio/backend/src/core/application/use-cases/GetFiscalIntegrityUseCase.js'
import type { FiscalIntegrityReportDto } from '@kryptofolio/backend/src/core/infrastructure/dtos/fiscal-integrity.js'
import type {
  IngestionOutcomeDto,
  OverrideOutcomeDto,
  RebuildOutcomeDto,
} from '@kryptofolio/backend/src/core/infrastructure/dtos/materialization.js'
import {
  ExternalFiscalIntegritySchema,
  ExternalRebuildOutcomeSchema,
  ExternalIngestionOutcomeSchema,
  ExternalOverrideOutcomeSchema,
} from '../FiscalIntegritySchemas'

describe('ExternalFiscalIntegritySchema — pending-review surface', () => {
  it('parses a payload shaped exactly like the backend report DTO', () => {
    const backendPayload: FiscalIntegrityReportDto = {
      groups: [
        {
          quality_flag: 'UNTRACKED_INFLOW',
          severity: 'high',
          count: 2,
          pendingReview: 1,
          rows: [
            {
              quality_flag: 'UNTRACKED_INFLOW',
              severity: 'high',
              asset_id: 'XRP',
              account_id: 'ownwallet-XRP',
              tx_id: null,
              occurred_at: '2024-06-01T00:00:00Z',
              detail_key: 'fifo_quality.untracked_inflow',
              pending_review: true,
            },
          ],
        },
      ],
      totalDefects: 2,
      pendingReview: 1,
      needsRecalculation: false,
    }

    const result = ExternalFiscalIntegritySchema.safeParse(backendPayload)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.totalDefects).toBe(2)
      expect(result.data.groups[0].qualityFlag).toBe('UNTRACKED_INFLOW')
      expect(result.data.groups[0].rows[0].detailKey).toBe('fifo_quality.untracked_inflow')
      expect(result.data.groups[0].rows[0].pendingReview).toBe(true)
    }
  })

  it('rejects a quality_flag outside the canonical vocabulary', () => {
    const result = ExternalFiscalIntegritySchema.safeParse({
      groups: [
        {
          quality_flag: 'NOT_A_REAL_FLAG',
          severity: 'high',
          count: 1,
          pendingReview: 0,
          rows: [],
        },
      ],
      totalDefects: 1,
      pendingReview: 0,
      needsRecalculation: false,
    })
    expect(result.success).toBe(false)
  })

  it('is structurally satisfied by the same object the use case returns', () => {
    // Compile-time proof: a genuine GetFiscalIntegrityUseCase result is a valid input.
    const useCaseResult: FiscalIntegrityReport = {
      groups: [],
      totalDefects: 0,
      pendingReview: 0,
      needsRecalculation: true,
    }
    const result = ExternalFiscalIntegritySchema.safeParse(useCaseResult)
    expect(result.success).toBe(true)
  })
})

describe('ExternalRebuildOutcomeSchema — rebuild summary', () => {
  it('parses a payload shaped exactly like the backend rebuild outcome DTO', () => {
    const backendPayload: RebuildOutcomeDto = {
      materialized: true,
      materialization: {
        taxLots: { inserted: 1, updated: 0, retired: 0, reactivated: 0 },
        lotHistoryEvents: { inserted: 2, updated: 0, retired: 0, reactivated: 0 },
        custodyEntries: { inserted: 0, updated: 0, retired: 0, reactivated: 0 },
        flagged: 0,
        pendingReview: 0,
      },
      materializationError: null,
      pendingReview: 0,
    }

    const result = ExternalRebuildOutcomeSchema.safeParse(backendPayload)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.materialization?.taxLots.inserted).toBe(1)
      expect(result.data.materializationError).toBeNull()
    }
  })

  it('accepts a null materialization when nothing was rebuilt', () => {
    const result = ExternalRebuildOutcomeSchema.safeParse({
      materialized: false,
      materialization: null,
      materializationError: 'boom',
      pendingReview: 0,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.materialization).toBeNull()
      expect(result.data.materializationError).toBe('boom')
    }
  })
})

describe('ExternalIngestionOutcomeSchema — ingestion summary with structured rejections', () => {
  it('parses a payload shaped exactly like the backend ingestion outcome DTO', () => {
    const backendPayload: IngestionOutcomeDto = {
      status: 'success',
      processedCount: 3,
      message: '3 transactions ingested successfully, 1 rejected: unmapped tx_type',
      materialized: true,
      materialization: null,
      materializationError: null,
      pendingReview: 0,
      rejected: [
        { idHash: 'abc123', timestamp: '2024-01-01T00:00:00Z', txType: 'FOO', reason: 'unmapped tx_type' },
      ],
      unresolvedFiat: 1,
      pendingFeeReview: [
        { idHash: 'fee456', timestamp: '2024-01-02T00:00:00Z', reason: "could not verify Bitvavo's fee convention" },
      ],
    }

    const result = ExternalIngestionOutcomeSchema.safeParse(backendPayload)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.rejected).toHaveLength(1)
      expect(result.data.rejected[0].reason).toBe('unmapped tx_type')
      expect(result.data.unresolvedFiat).toBe(1)
      // Distinct from `rejected` (a refused row) and from `pendingReview` (an unresolved price):
      // this is a persisted row whose fee could not be resolved under any declared convention.
      expect(result.data.pendingFeeReview).toHaveLength(1)
      expect(result.data.pendingFeeReview[0].reason).toBe("could not verify Bitvavo's fee convention")
    }
  })

  it('rejects a rejection row with an empty reason', () => {
    const result = ExternalIngestionOutcomeSchema.safeParse({
      status: 'success',
      processedCount: 1,
      message: 'ok',
      materialized: false,
      materialization: null,
      materializationError: null,
      pendingReview: 0,
      rejected: [{ idHash: 'abc', timestamp: '2024-01-01T00:00:00Z', txType: null, reason: '' }],
      unresolvedFiat: 0,
      pendingFeeReview: [],
    })
    expect(result.success).toBe(false)
  })

  it('rejects a pending-fee-review row with an empty reason', () => {
    const result = ExternalIngestionOutcomeSchema.safeParse({
      status: 'success',
      processedCount: 1,
      message: 'ok',
      materialized: false,
      materialization: null,
      materializationError: null,
      pendingReview: 0,
      rejected: [],
      unresolvedFiat: 0,
      pendingFeeReview: [{ idHash: 'fee1', timestamp: '2024-01-01T00:00:00Z', reason: '' }],
    })
    expect(result.success).toBe(false)
  })
})

describe('ExternalOverrideOutcomeSchema — override mutation outcome', () => {
  it('parses a payload shaped exactly like the backend override outcome DTO', () => {
    const backendPayload: OverrideOutcomeDto = {
      applied: 2,
      materialization: null,
      pendingReview: 1,
    }

    const result = ExternalOverrideOutcomeSchema.safeParse(backendPayload)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.applied).toBe(2)
      expect(result.data.pendingReview).toBe(1)
    }
  })
})
