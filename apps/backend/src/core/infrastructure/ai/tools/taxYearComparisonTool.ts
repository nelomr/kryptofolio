import { z } from 'zod';
import { createTool } from '@mastra/core/tools';
import { compareTaxSummaries, TAX_SUMMARY_FIELDS, type TaxYearReport } from '@kryptofolio/core-domain';
import { preciseAmountSchema } from '@kryptofolio/shared-types';
import type {
  GetSpanishTaxReportUseCase,
  SpanishTaxReportResponse,
} from '../../../application/use-cases/GetSpanishTaxReportUseCase.js';
import { enforceBudget, type EnforceBudgetResult, type RunBudgetTracker } from './enforceBudget.js';

/** IRPF figures are filed in euros, so both years are always read in EUR regardless of the display currency. */
const REPORT_CURRENCY = 'EUR';
const FIRST_TAX_YEAR = 2009;

export const taxYearComparisonToolInputSchema = z
  .object({
    yearA: z.number().int().min(FIRST_TAX_YEAR),
    yearB: z.number().int().min(FIRST_TAX_YEAR),
    method: z.string().optional(),
  })
  .strict()
  .refine((input) => input.yearA !== input.yearB, { message: 'yearA and yearB must differ' });

const summarySchema = z.object(
  Object.fromEntries(TAX_SUMMARY_FIELDS.map((field) => [field, preciseAmountSchema])) as Record<
    (typeof TAX_SUMMARY_FIELDS)[number],
    typeof preciseAmountSchema
  >,
).strict();

const completenessSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('complete') }).strict(),
  z
    .object({
      kind: z.literal('incomplete'),
      reasons: z.array(z.enum(['unconvertible_events', 'excluded_flagged_events', 'excluded_unresolved_income'])),
    })
    .strict(),
]);

const yearSchema = z
  .object({
    year: z.number().int(),
    currency: z.string(),
    summary: summarySchema,
    unconvertibleCount: z.number().int().nonnegative(),
    excludedFlaggedEvents: z.number().int().nonnegative(),
    excludedUnresolvedIncomeCount: z.number().int().nonnegative(),
    completeness: completenessSchema,
  })
  .strict();

const deltaSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('delta'), value: preciseAmountSchema }).strict(),
  z.object({ kind: z.literal('delta_incomparable'), value: preciseAmountSchema }).strict(),
]);

const payloadSchema = z
  .object({
    yearA: yearSchema,
    yearB: yearSchema,
    deltas: z.object(
      Object.fromEntries(TAX_SUMMARY_FIELDS.map((field) => [field, deltaSchema])) as Record<
        (typeof TAX_SUMMARY_FIELDS)[number],
        typeof deltaSchema
      >,
    ).strict(),
  })
  .strict();

export const taxYearComparisonToolOutputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('ok'), payload: payloadSchema }).strict(),
  z
    .object({
      kind: z.literal('truncated'),
      maxChars: z.number().int().positive(),
      actualChars: z.number().int().positive(),
    })
    .strict(),
]);

export type TaxYearComparisonToolPayload = z.infer<typeof payloadSchema>;

export interface TaxYearComparisonToolConfig {
  maxChars: number;
  runBudgetTracker?: RunBudgetTracker;
}

function toYear(response: SpanishTaxReportResponse, report: TaxYearReport): TaxYearComparisonToolPayload['yearA'] {
  return {
    year: response.year,
    currency: response.currency,
    summary: report.summary,
    unconvertibleCount: report.unconvertibleCount,
    excludedFlaggedEvents: report.excludedFlaggedEvents,
    excludedUnresolvedIncomeCount: report.excludedUnresolvedIncomeCount,
    completeness: report.completeness,
  };
}

function figuresOf(response: SpanishTaxReportResponse) {
  return {
    summary: response.summary,
    unconvertibleCount: response.unconvertibleEvents.length,
    excludedFlaggedEvents: response.excludedFlaggedEvents,
    excludedUnresolvedIncomeCount: response.excludedUnresolvedIncomeCount,
  };
}

/** The audit trail is deliberately dropped: a comparison needs the totals and their completeness, not the events. */
export function buildTaxYearComparisonToolResult(
  a: SpanishTaxReportResponse,
  b: SpanishTaxReportResponse,
  config: TaxYearComparisonToolConfig,
): EnforceBudgetResult<TaxYearComparisonToolPayload> {
  const comparison = compareTaxSummaries(figuresOf(a), figuresOf(b));
  const payload: TaxYearComparisonToolPayload = {
    yearA: toYear(a, comparison.yearA),
    yearB: toYear(b, comparison.yearB),
    deltas: comparison.deltas,
  };
  return enforceBudget(payload, config.maxChars, config.runBudgetTracker);
}

export type TaxYearComparisonUseCaseLike = Pick<GetSpanishTaxReportUseCase, 'execute'>;

export function taxYearComparisonTool(useCase: TaxYearComparisonUseCaseLike, config: TaxYearComparisonToolConfig) {
  return createTool({
    id: 'tax_year_comparison',
    description:
      "Compares the Spanish IRPF report of two different years over all of the user's accounts, in EUR. Each difference is computed for you as the second year minus the first; never subtract the two years yourself. A year whose totals leave events out is flagged incomplete, and then every difference comes back as delta_incomparable, which you must tell the user. Read-only.",
    inputSchema: taxYearComparisonToolInputSchema,
    outputSchema: taxYearComparisonToolOutputSchema,
    execute: async (inputData) => {
      const read = (year: number) =>
        useCase.execute({ year, method: inputData.method, targetCurrency: REPORT_CURRENCY });
      const [a, b] = await Promise.all([read(inputData.yearA), read(inputData.yearB)]);
      return buildTaxYearComparisonToolResult(a, b, config);
    },
  });
}
