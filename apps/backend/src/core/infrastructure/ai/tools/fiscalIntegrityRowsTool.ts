import { z } from 'zod';
import { createTool } from '@mastra/core/tools';
import { FIFO_QUALITY_FLAGS, FLAG_SEVERITIES } from '@kryptofolio/shared-types';
import type {
  FiscalIntegrityReport,
  GetFiscalIntegrityUseCase,
} from '../../../application/use-cases/GetFiscalIntegrityUseCase.js';
import { enforceBudget, type EnforceBudgetResult, type RunBudgetTracker } from './enforceBudget.js';

const dataQualityRowSchema = z
  .object({
    quality_flag: z.enum(FIFO_QUALITY_FLAGS),
    severity: z.enum(FLAG_SEVERITIES),
    asset_id: z.string().nullable(),
    account_id: z.string().nullable(),
    tx_id: z.string().nullable(),
    occurred_at: z.string().nullable(),
    detail_key: z.string(),
    pending_review: z.boolean(),
  })
  .strict();

const fiscalIntegrityRowsPayloadSchema = z
  .object({
    rows: z.array(dataQualityRowSchema),
    page: z.number().int().nonnegative(),
    pageSize: z.number().int().positive(),
    totalPages: z.number().int().nonnegative(),
    totalCount: z.number().int().nonnegative(),
  })
  .strict();

export const fiscalIntegrityRowsToolOutputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('ok'), payload: fiscalIntegrityRowsPayloadSchema }).strict(),
  z
    .object({
      kind: z.literal('truncated'),
      maxChars: z.number().int().positive(),
      actualChars: z.number().int().positive(),
    })
    .strict(),
]);

export type FiscalIntegrityRowsToolPayload = z.infer<typeof fiscalIntegrityRowsPayloadSchema>;

export const fiscalIntegrityRowsToolInputSchema = z
  .object({
    qualityFlag: z.enum(FIFO_QUALITY_FLAGS),
    page: z.number().int().nonnegative().default(0),
  })
  .strict();

export interface FiscalIntegrityRowsToolConfig {
  /** From the resolved execution profile's `rowsPageSize` — 25 metered, 100 local by default. */
  rowsPageSize: number;
  maxChars: number;
  /** The run-wide cap tracker — one instance per advisor run, `undefined` for a metered run. */
  runBudgetTracker?: RunBudgetTracker;
}

/**
 * Pure projection + budget gate. Reads the matching group's own `rows` field — never exposed by the
 * `fiscal_integrity` summary tool — and paginates it at `rowsPageSize`.
 */
export function buildFiscalIntegrityRowsToolResult(
  report: FiscalIntegrityReport,
  qualityFlag: (typeof FIFO_QUALITY_FLAGS)[number],
  page: number,
  config: FiscalIntegrityRowsToolConfig,
): EnforceBudgetResult<FiscalIntegrityRowsToolPayload> {
  const group = report.groups.find((g) => g.quality_flag === qualityFlag);
  const allRows = group?.rows ?? [];
  const totalCount = allRows.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / config.rowsPageSize));
  const start = page * config.rowsPageSize;
  const pageRows = allRows.slice(start, start + config.rowsPageSize);

  const payload: FiscalIntegrityRowsToolPayload = {
    rows: pageRows,
    page,
    pageSize: config.rowsPageSize,
    totalPages,
    totalCount,
  };

  return enforceBudget(payload, config.maxChars, config.runBudgetTracker);
}

/** Structural, not the concrete class: the tool only ever calls `execute`. */
export type FiscalIntegrityRowsUseCaseLike = Pick<GetFiscalIntegrityUseCase, 'execute'>;

/** Constructor takes only the wrapped use case plus pure configuration. */
export function fiscalIntegrityRowsTool(
  useCase: FiscalIntegrityRowsUseCaseLike,
  config: FiscalIntegrityRowsToolConfig,
) {
  return createTool({
    id: 'fiscal_integrity_rows',
    description:
      'Transaction-level data-quality rows for one flag across all of the user\'s accounts, paginated. Read-only; complements fiscal_integrity.',
    inputSchema: fiscalIntegrityRowsToolInputSchema,
    outputSchema: fiscalIntegrityRowsToolOutputSchema,
    execute: async (inputData) => {
      const report = await useCase.execute({});
      return buildFiscalIntegrityRowsToolResult(report, inputData.qualityFlag, inputData.page, config);
    },
  });
}
