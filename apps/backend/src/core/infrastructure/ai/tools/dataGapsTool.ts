import { z } from 'zod';
import { createTool } from '@mastra/core/tools';
import { isConvertible, preciseAmountSchema } from '@kryptofolio/shared-types';
import type {
  PortfolioHoldingDto,
  GetPortfolioSummaryUseCase,
  PortfolioSummaryResponse,
} from '../../../application/use-cases/GetPortfolioSummaryUseCase.js';
import type {
  FiscalIntegrityReport,
  GetFiscalIntegrityUseCase,
} from '../../../application/use-cases/GetFiscalIntegrityUseCase.js';
import { advisorRequestContextSchema } from '../advisorRequestContext.js';
import { enforceBudget, type EnforceBudgetResult, type RunBudgetTracker } from './enforceBudget.js';
import { fiscalIntegrityPayloadSchema, projectFiscalIntegrity } from './fiscalIntegrityTool.js';
import { resolvedValueOf } from './portfolioSummaryTool.js';

export const dataGapsToolInputSchema = z.object({}).strict();

const unvaluedItemSchema = z.object({ symbol: z.string(), amount: preciseAmountSchema }).strict();

const NEXT_TOOLS = ['fiscal_integrity_rows', 'holding_detail'] as const;

const dataGapsPayloadSchema = z
  .object({
    unvalued: z
      .object({ no_price: z.array(unvaluedItemSchema), no_rate: z.array(unvaluedItemSchema) })
      .strict(),
    integrity: fiscalIntegrityPayloadSchema.pick({ groups: true, totalDefects: true, needsRecalculation: true }).strict(),
    nextTools: z.array(z.enum(NEXT_TOOLS)),
  })
  .strict();

export const dataGapsToolOutputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('ok'), payload: dataGapsPayloadSchema }).strict(),
  z
    .object({
      kind: z.literal('truncated'),
      maxChars: z.number().int().positive(),
      actualChars: z.number().int().positive(),
    })
    .strict(),
]);

export type DataGapsToolPayload = z.infer<typeof dataGapsPayloadSchema>;

export interface DataGapsToolConfig {
  maxChars: number;
  runBudgetTracker?: RunBudgetTracker;
  livePrices?: (currency: string) => Promise<Map<string, string>>;
}

function toItem(holding: PortfolioHoldingDto): z.infer<typeof unvaluedItemSchema> {
  return { symbol: holding.symbol, amount: holding.amount };
}

/**
 * A holding is unvalued by the same predicate `portfolio_summary` uses. It then has one of two
 * causes the user fixes differently: no price was ever resolved (cost basis converts), or the cost
 * basis itself cannot be expressed in the display currency.
 */
export function buildDataGapsToolResult(
  summary: PortfolioSummaryResponse,
  integrity: FiscalIntegrityReport,
  config: DataGapsToolConfig,
): EnforceBudgetResult<DataGapsToolPayload> {
  const unvalued = summary.holdings.filter((holding) => resolvedValueOf(holding) === undefined);
  const { groups, totalDefects, needsRecalculation } = projectFiscalIntegrity(integrity);

  const payload: DataGapsToolPayload = {
    unvalued: {
      no_price: unvalued.filter((h) => isConvertible(h.cost_basis)).map(toItem),
      no_rate: unvalued.filter((h) => !isConvertible(h.cost_basis)).map(toItem),
    },
    integrity: { groups, totalDefects, needsRecalculation },
    nextTools: [...NEXT_TOOLS],
  };
  return enforceBudget(payload, config.maxChars, config.runBudgetTracker);
}

export interface DataGapsUseCases {
  portfolioSummary: Pick<GetPortfolioSummaryUseCase, 'execute'>;
  fiscalIntegrity: Pick<GetFiscalIntegrityUseCase, 'execute'>;
}

export function dataGapsTool(useCases: DataGapsUseCases, config: DataGapsToolConfig) {
  return createTool({
    id: 'data_gaps',
    description:
      "What is missing from the user's data: holdings that cannot be valued (split into no price and no exchange rate) and the fiscal data-quality defect groups with their totals. Returns counts and symbols only; call fiscal_integrity_rows for the flagged transactions and holding_detail for one holding. Read-only.",
    inputSchema: dataGapsToolInputSchema,
    outputSchema: dataGapsToolOutputSchema,
    requestContextSchema: advisorRequestContextSchema,
    execute: async (_inputData, { requestContext }) => {
      const targetCurrency = requestContext.get('baseCurrency');
      const [summary, integrity] = await Promise.all([
        useCases.portfolioSummary.execute({ targetCurrency, livePrices: await config.livePrices?.(targetCurrency) }),
        useCases.fiscalIntegrity.execute({}),
      ]);
      return buildDataGapsToolResult(summary, integrity, config);
    },
  });
}
