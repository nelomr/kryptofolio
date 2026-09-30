import { z } from 'zod';
import { createTool } from '@mastra/core/tools';
import { isConvertible, preciseAmountSchema } from '@kryptofolio/shared-types';
import { addRealized, rankHoldingsByValue, sumValuedHoldings } from '@kryptofolio/core-domain';
import type {
  GetPortfolioSummaryUseCase,
  PortfolioHoldingDto,
  PortfolioSummaryResponse,
} from '../../../application/use-cases/GetPortfolioSummaryUseCase.js';
import { advisorRequestContextSchema } from '../advisorRequestContext.js';
import { enforceBudget, type EnforceBudgetResult, type RunBudgetTracker } from './enforceBudget.js';

/**
 * The tool takes no input: `.strict()` rejects any field a model supplies. The account scope is
 * always every account; `targetCurrency` comes from `requestContext`'s base-currency setting and
 * `livePrices` from this tool's own factory config — never from tool input.
 */
export const portfolioSummaryToolInputSchema = z.object({}).strict();

const rankedHoldingSchema = z
  .object({
    id: z.string(),
    symbol: z.string(),
    amount: preciseAmountSchema,
    avgPriceFiat: preciseAmountSchema,
    costBasisFiat: preciseAmountSchema,
    currentValueFiat: preciseAmountSchema,
    unrealizedPnlFiat: preciseAmountSchema.optional(),
    currency: z.string(),
  })
  .strict();

const unvaluedHoldingSchema = z
  .object({
    id: z.string(),
    symbol: z.string(),
    amount: preciseAmountSchema,
    costBasisFiat: preciseAmountSchema,
    currency: z.string(),
  })
  .strict();

const portfolioSummaryPayloadSchema = z
  .object({
    metrics: z
      .object({
        ratesIncomplete: z.boolean(),
        pricesIncomplete: z.boolean(),
        totalEquityFiat: preciseAmountSchema,
        totalCostBasisFiat: preciseAmountSchema,
        totalRealizedPnlFiat: preciseAmountSchema,
        totalUnrealizedPnlFiat: preciseAmountSchema,
        totalPnlFiat: preciseAmountSchema,
        currency: z.string(),
      })
      .strict(),
    ranked: z.array(rankedHoldingSchema),
    omittedCount: z.number().int().nonnegative(),
    unvalued: z.array(unvaluedHoldingSchema),
    unvaluedCount: z.number().int().nonnegative(),
  })
  .strict();

/**
 * `enforceBudget`'s own two-arm shape *is* the tool's `outputSchema` — the model never sees an
 * unvalidated, unbounded payload even before the character gate runs, and a truncated result carries
 * no `payload` field at all, so an over-budget shape can never leak through this schema.
 */
export const portfolioSummaryToolOutputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('ok'), payload: portfolioSummaryPayloadSchema }).strict(),
  z
    .object({
      kind: z.literal('truncated'),
      maxChars: z.number().int().positive(),
      actualChars: z.number().int().positive(),
    })
    .strict(),
]);

export type PortfolioSummaryToolPayload = z.infer<typeof portfolioSummaryPayloadSchema>;

/** A holding's resolved value, or `undefined` when it has none — never a comparable `0`. */
function resolvedValueOf(holding: PortfolioHoldingDto): string | undefined {
  if (holding.current_value_fiat === undefined) return undefined;
  if (!isConvertible(holding.cost_basis)) return undefined;
  return holding.current_value_fiat;
}

function toRankedSummary(
  holding: PortfolioHoldingDto,
  currentValueFiat: string,
): PortfolioSummaryToolPayload['ranked'][number] {
  return {
    id: holding.id,
    symbol: holding.symbol,
    amount: holding.amount,
    avgPriceFiat: holding.avg_price_fiat,
    costBasisFiat: holding.cost_basis_fiat,
    currentValueFiat,
    unrealizedPnlFiat: holding.unrealized_pnl_fiat,
    currency: holding.currency,
  };
}

function toUnvaluedSummary(holding: PortfolioHoldingDto): PortfolioSummaryToolPayload['unvalued'][number] {
  return {
    id: holding.id,
    symbol: holding.symbol,
    amount: holding.amount,
    costBasisFiat: holding.cost_basis_fiat,
    currency: holding.currency,
  };
}

export interface PortfolioSummaryToolConfig {
  /** From the resolved execution profile's `topNHoldings` — 15 metered, 50 local by default. */
  topNHoldings: number;
  maxChars: number;
  /** The run-wide cap tracker — one instance per advisor run, `undefined` for a metered run. */
  runBudgetTracker?: RunBudgetTracker;
  /**
   * Resolved at call time for the run's base currency by whatever composes the tool — never taken
   * from the model's tool input, which is why `portfolioSummaryToolInputSchema` has no `livePrices`
   * field at all.
   */
  livePrices?: (currency: string) => Promise<Map<string, string>>;
}

/**
 * Pure projection + budget gate, factored out of the Mastra `execute` closure so it is directly
 * unit-testable without constructing a `Tool`. Ranking goes through `rankHoldingsByValue` only: this
 * file orders nothing itself, compares no monetary value, and does no floating-point conversion or
 * formatting of one.
 */
export function buildPortfolioSummaryToolResult(
  response: PortfolioSummaryResponse,
  config: PortfolioSummaryToolConfig,
): EnforceBudgetResult<PortfolioSummaryToolPayload> {
  const { ranked, omittedCount, unvalued } = rankHoldingsByValue(
    response.holdings,
    resolvedValueOf,
    config.topNHoldings,
  );

  const totals = sumValuedHoldings(response.holdings, (h) => {
    const value = resolvedValueOf(h);
    return value === undefined ? undefined : { value, costBasis: h.cost_basis_fiat };
  });

  const payload: PortfolioSummaryToolPayload = {
    metrics: {
      ratesIncomplete:
        response.metrics.rates_incomplete ||
        response.holdings.some((h) => !isConvertible(h.cost_basis)),
      pricesIncomplete: unvalued.some((h) => isConvertible(h.cost_basis)),
      totalEquityFiat: totals.equity,
      totalCostBasisFiat: totals.costBasis,
      totalRealizedPnlFiat: response.metrics.total_realized_pnl_fiat,
      totalUnrealizedPnlFiat: totals.unrealized,
      totalPnlFiat: addRealized(totals, response.metrics.total_realized_pnl_fiat),
      currency: response.metrics.currency,
    },
    ranked: ranked.flatMap((holding) => {
      const value = resolvedValueOf(holding);
      return value === undefined ? [] : [toRankedSummary(holding, value)];
    }),
    omittedCount,
    unvalued: unvalued.map(toUnvaluedSummary),
    unvaluedCount: unvalued.length,
  };

  return enforceBudget(payload, config.maxChars, config.runBudgetTracker);
}

/** Structural, not the concrete class: the tool only ever calls `execute`. */
export type PortfolioSummaryUseCaseLike = Pick<GetPortfolioSummaryUseCase, 'execute'>;

/**
 * Constructor takes only the wrapped use case plus pure configuration — no
 * lower-level ledger, tax-calculation, or storage port reaches this file.
 */
export function portfolioSummaryTool(
  useCase: PortfolioSummaryUseCaseLike,
  config: PortfolioSummaryToolConfig,
) {
  return createTool({
    id: 'portfolio_summary',
    description:
      'Current holdings across all of the user\'s accounts, ranked by value, with incompleteness flags. Equity, cost basis, unrealized and total PnL are totals over the valued holdings at the live snapshot price; realized PnL is the FIFO ledger figure. Differs by design from `kpis`, which is the last daily close with flagged lots excluded. Read-only; returns no more than the top holdings.',
    inputSchema: portfolioSummaryToolInputSchema,
    outputSchema: portfolioSummaryToolOutputSchema,
    requestContextSchema: advisorRequestContextSchema,
    execute: async (_inputData, { requestContext }) => {
      const targetCurrency = requestContext.get('baseCurrency');
      const response = await useCase.execute({
        targetCurrency,
        livePrices: await config.livePrices?.(targetCurrency),
      });
      return buildPortfolioSummaryToolResult(response, config);
    },
  });
}
