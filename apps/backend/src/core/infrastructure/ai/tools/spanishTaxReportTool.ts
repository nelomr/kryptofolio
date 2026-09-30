import { z } from 'zod';
import { createTool } from '@mastra/core/tools';
import { orderByIsoDateDescending } from '@kryptofolio/core-domain';
import { convertedAmountSchema, preciseAmountSchema } from '@kryptofolio/shared-types';
import type {
  GetSpanishTaxReportUseCase,
  SpanishTaxReportResponse,
  TaxReportAuditTrailEventDto,
} from '../../../application/use-cases/GetSpanishTaxReportUseCase.js';
import { enforceBudget, type EnforceBudgetResult, type RunBudgetTracker } from './enforceBudget.js';

/** The fixed row cap for the audit trail — same row-capping precedent `token_history` already sets. */
const MAX_AUDIT_TRAIL_ROWS = 20;

const taxReportSummarySchema = z
  .object({
    capital_gains: preciseAmountSchema,
    capital_losses: preciseAmountSchema,
    savings_base_yields: preciseAmountSchema,
    general_base_airdrops: preciseAmountSchema,
    net_patrimonial_result: preciseAmountSchema,
    estimated_irpf: preciseAmountSchema,
  })
  .strict();

const auditTrailEventSchema = z
  .object({
    id: z.string(),
    disposalDate: z.string(),
    amountFromLot: preciseAmountSchema,
    salePrice: convertedAmountSchema.nullable(),
    gainLoss: convertedAmountSchema.nullable(),
    isTaxable: z.boolean(),
    operationType: z.string(),
    assetSymbol: z.string().optional(),
    exchangeName: z.string().optional(),
  })
  .strict();

const spanishTaxReportPayloadSchema = z
  .object({
    year: z.number().int(),
    method: z.string(),
    currency: z.string(),
    summary: taxReportSummarySchema,
    unconvertibleEventsCount: z.number().int().nonnegative(),
    excludedFlaggedEvents: z.number().int().nonnegative(),
    excludedUnresolvedIncomeCount: z.number().int().nonnegative(),
    auditTrail: z.array(auditTrailEventSchema),
    omittedCount: z.number().int().nonnegative(),
  })
  .strict();

export const spanishTaxReportToolOutputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('ok'), payload: spanishTaxReportPayloadSchema }).strict(),
  z
    .object({
      kind: z.literal('truncated'),
      maxChars: z.number().int().positive(),
      actualChars: z.number().int().positive(),
    })
    .strict(),
]);

export type SpanishTaxReportToolPayload = z.infer<typeof spanishTaxReportPayloadSchema>;

export const spanishTaxReportToolInputSchema = z
  .object({
    year: z.number().int().min(2009),
    method: z.string().optional(),
  })
  .strict();

function toAuditRow(evt: TaxReportAuditTrailEventDto): SpanishTaxReportToolPayload['auditTrail'][number] {
  return {
    id: evt.id,
    disposalDate: evt.disposal_date,
    amountFromLot: evt.amount_from_lot,
    salePrice: evt.sale_price,
    gainLoss: evt.gain_loss,
    isTaxable: evt.is_taxable,
    operationType: evt.operation_type,
    assetSymbol: evt.asset_symbol,
    exchangeName: evt.exchange_name,
  };
}

export interface SpanishTaxReportToolConfig {
  maxChars: number;
  /** The run-wide cap tracker — one instance per advisor run, `undefined` for a metered run. */
  runBudgetTracker?: RunBudgetTracker;
}

/**
 * Pure projection + budget gate. `auditTrail` is ordered by `disposal_date` descending (a date-string
 * comparison, not a monetary one — permitted) and capped at `MAX_AUDIT_TRAIL_ROWS`, never the full trail.
 */
export function buildSpanishTaxReportToolResult(
  response: SpanishTaxReportResponse,
  config: SpanishTaxReportToolConfig,
): EnforceBudgetResult<SpanishTaxReportToolPayload> {
  const ordered = orderByIsoDateDescending(response.audit_trail, (row) => row.disposal_date);
  const topRows = ordered.slice(0, MAX_AUDIT_TRAIL_ROWS);

  const payload: SpanishTaxReportToolPayload = {
    year: response.year,
    method: response.method,
    currency: response.currency,
    summary: {
      capital_gains: response.summary.capital_gains,
      capital_losses: response.summary.capital_losses,
      savings_base_yields: response.summary.savings_base_yields,
      general_base_airdrops: response.summary.general_base_airdrops,
      net_patrimonial_result: response.summary.net_patrimonial_result,
      estimated_irpf: response.summary.estimated_irpf,
    },
    unconvertibleEventsCount: response.unconvertibleEvents.length,
    excludedFlaggedEvents: response.excludedFlaggedEvents,
    excludedUnresolvedIncomeCount: response.excludedUnresolvedIncomeCount,
    auditTrail: topRows.map(toAuditRow),
    omittedCount: Math.max(0, ordered.length - topRows.length),
  };

  return enforceBudget(payload, config.maxChars, config.runBudgetTracker);
}

/** Structural, not the concrete class: the tool only ever calls `execute`. */
export type SpanishTaxReportUseCaseLike = Pick<GetSpanishTaxReportUseCase, 'execute'>;

/** Constructor takes only the wrapped use case plus pure configuration. */
export function spanishTaxReportTool(
  useCase: SpanishTaxReportUseCaseLike,
  config: SpanishTaxReportToolConfig,
) {
  return createTool({
    id: 'spanish_tax_report',
    description:
      'The Spanish IRPF tax report for one year over all of the user\'s accounts (tax is computed per asset, never per account), with a capped audit trail. Read-only; the only tool in this catalogue requiring an input.',
    inputSchema: spanishTaxReportToolInputSchema,
    outputSchema: spanishTaxReportToolOutputSchema,
    execute: async (inputData) => {
      const response = await useCase.execute({
        year: inputData.year,
        method: inputData.method,
      });
      return buildSpanishTaxReportToolResult(response, config);
    },
  });
}
