import { z } from 'zod';
import { createTool } from '@mastra/core/tools';
import { orderByCountDescending } from '@kryptofolio/core-domain';
import { FIFO_QUALITY_FLAGS, FLAG_SEVERITIES } from '@kryptofolio/shared-types';
import type {
  FiscalIntegrityGroup,
  FiscalIntegrityReport,
  GetFiscalIntegrityUseCase,
} from '../../../application/use-cases/GetFiscalIntegrityUseCase.js';
import { enforceBudget, type EnforceBudgetResult, type RunBudgetTracker } from './enforceBudget.js';

/** At most this many defect groups reach the model, ranked by count — fixed, not profile-derived. */
const MAX_GROUPS = 10;

export const groupSummarySchema = z
  .object({
    qualityFlag: z.enum(FIFO_QUALITY_FLAGS),
    severity: z.enum(FLAG_SEVERITIES),
    count: z.number().int().nonnegative(),
    pendingReview: z.number().int().nonnegative(),
  })
  .strict();

export const fiscalIntegrityPayloadSchema = z
  .object({
    groups: z.array(groupSummarySchema),
    totalDefects: z.number().int().nonnegative(),
    pendingReview: z.number().int().nonnegative(),
    needsRecalculation: z.boolean(),
  })
  .strict();

export const fiscalIntegrityToolOutputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('ok'), payload: fiscalIntegrityPayloadSchema }).strict(),
  z
    .object({
      kind: z.literal('truncated'),
      maxChars: z.number().int().positive(),
      actualChars: z.number().int().positive(),
    })
    .strict(),
]);

export type FiscalIntegrityToolPayload = z.infer<typeof fiscalIntegrityPayloadSchema>;

function toGroupSummary(group: FiscalIntegrityGroup): FiscalIntegrityToolPayload['groups'][number] {
  return {
    qualityFlag: group.quality_flag,
    severity: group.severity,
    count: group.count,
    pendingReview: group.pendingReview,
  };
}

export interface FiscalIntegrityToolConfig {
  maxChars: number;
  /** The run-wide cap tracker — one instance per advisor run, `undefined` for a metered run. */
  runBudgetTracker?: RunBudgetTracker;
}

/**
 * The projection without the budget gate, reused by `data_gaps`. The use case's own `groups` are
 * already ranked by severity then flag order (`GetFiscalIntegrityUseCase`'s `groupDefects`); this only
 * re-ranks by the integer `count` each group already carries and caps at `MAX_GROUPS` — no monetary
 * comparison, and the per-transaction `rows` field never reaches the projected summary.
 */
export function projectFiscalIntegrity(report: FiscalIntegrityReport): FiscalIntegrityToolPayload {
  const ranked = orderByCountDescending(report.groups, (group) => group.count).slice(0, MAX_GROUPS);

  return {
    groups: ranked.map(toGroupSummary),
    totalDefects: report.totalDefects,
    pendingReview: report.pendingReview,
    needsRecalculation: report.needsRecalculation,
  };
}

/** Pure projection + budget gate. */
export function buildFiscalIntegrityToolResult(
  report: FiscalIntegrityReport,
  config: FiscalIntegrityToolConfig,
): EnforceBudgetResult<FiscalIntegrityToolPayload> {
  return enforceBudget(projectFiscalIntegrity(report), config.maxChars, config.runBudgetTracker);
}

export const fiscalIntegrityToolInputSchema = z.object({}).strict();

/** Structural, not the concrete class: the tool only ever calls `execute`. */
export type FiscalIntegrityUseCaseLike = Pick<GetFiscalIntegrityUseCase, 'execute'>;

/**
 * Constructor takes only the wrapped use case plus pure configuration.
 */
export function fiscalIntegrityTool(
  useCase: FiscalIntegrityUseCaseLike,
  config: FiscalIntegrityToolConfig,
) {
  return createTool({
    id: 'fiscal_integrity',
    description:
      'Data-quality flags on the fiscal ledger across all of the user\'s accounts, grouped and counted. Read-only; returns no transaction-level rows.',
    inputSchema: fiscalIntegrityToolInputSchema,
    outputSchema: fiscalIntegrityToolOutputSchema,
    execute: async () => {
      const report = await useCase.execute({});
      return buildFiscalIntegrityToolResult(report, config);
    },
  });
}
