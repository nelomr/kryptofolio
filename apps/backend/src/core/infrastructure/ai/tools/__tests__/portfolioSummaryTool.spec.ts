import { describe, it, expect, vi } from 'vitest';
import { RequestContext } from '@mastra/core/request-context';
import { noopObserve } from '@mastra/core/tools';
import {
  buildPortfolioSummaryToolResult,
  portfolioSummaryTool,
  portfolioSummaryToolInputSchema,
  portfolioSummaryToolOutputSchema,
} from '../portfolioSummaryTool.js';
import {
  buildFortyHoldingFixture,
  buildFortyHoldingFixtureWithUnvalued,
} from './fixtures/portfolioSummaryFixture.js';
import type { AdvisorRequestContextValues } from '../../advisorRequestContext.js';
import type {
  PortfolioHoldingDto,
  PortfolioSummaryResponse,
} from '../../../../application/use-cases/GetPortfolioSummaryUseCase.js';

const CONFIG = { topNHoldings: 15, maxChars: 4000 };

function emptyResponse(): PortfolioSummaryResponse {
  return {
    metrics: {
      rates_incomplete: false,
      prices_incomplete: false,
      total_equity_fiat: '0.00',
      total_cost_basis_fiat: '0.00',
      total_realized_pnl_fiat: '0.00',
      total_unrealized_pnl_fiat: '0.00',
      total_pnl_fiat: '0.00',
      currency: 'EUR',
    },
    holdings: [],
  };
}

describe('portfolio_summary tool', () => {
  it('ranks the top 15 of a 40-holding portfolio, all resolved', () => {
    const response = buildFortyHoldingFixture();

    const result = buildPortfolioSummaryToolResult(response, CONFIG);

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') throw new Error('expected ok');
    expect(result.payload.ranked).toHaveLength(15);
    expect(result.payload.omittedCount).toBe(25);
    expect(result.payload.unvaluedCount).toBe(0);
    expect(result.payload.unvalued).toHaveLength(0);

    // Monetary fields are the exact strings from the use case.
    expect(result.payload.ranked[0]!.currentValueFiat).toBe('5500.00');
    expect(typeof result.payload.metrics.totalEquityFiat).toBe('string');

    // The only number-typed fields are integer counts.
    expect(typeof result.payload.omittedCount).toBe('number');
    expect(typeof result.payload.unvaluedCount).toBe('number');

    expect(() => portfolioSummaryToolOutputSchema.parse(result)).not.toThrow();
  });

  it('routes unresolved/unconvertible holdings to unvalued, never treating them as 0', () => {
    const response = buildFortyHoldingFixtureWithUnvalued();

    const result = buildPortfolioSummaryToolResult(response, CONFIG);

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') throw new Error('expected ok');
    expect(result.payload.ranked).toHaveLength(15);
    expect(result.payload.omittedCount).toBe(19);
    expect(result.payload.unvaluedCount).toBe(6);
    expect(result.payload.unvalued).toHaveLength(6);

    for (const holding of result.payload.unvalued) {
      expect(holding).not.toHaveProperty('currentValueFiat');
      expect('currentValueFiat' in holding && (holding as { currentValueFiat: unknown }).currentValueFiat).not.toBe(
        '0',
      );
    }
    for (const holding of result.payload.ranked) {
      expect(holding.currentValueFiat).not.toBe('0');
      expect(holding.currentValueFiat).not.toBeNull();
      expect(holding.currentValueFiat).not.toBe('');
    }

    expect(() => portfolioSummaryToolOutputSchema.parse(result)).not.toThrow();
  });

  it('reports ratesIncomplete/pricesIncomplete for a portfolio with unvalued and unconvertible holdings', () => {
    const response = buildFortyHoldingFixtureWithUnvalued();

    const result = buildPortfolioSummaryToolResult(response, CONFIG);

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') throw new Error('expected ok');
    expect(result.payload.metrics.ratesIncomplete).toBe(true);
    expect(result.payload.metrics.pricesIncomplete).toBe(true);
  });

  it('truncates via enforceBudget when the projected payload exceeds maxChars', () => {
    const response = buildFortyHoldingFixture();

    const result = buildPortfolioSummaryToolResult(response, { topNHoldings: 15, maxChars: 10 });

    expect(result.kind).toBe('truncated');
    expect(() => portfolioSummaryToolOutputSchema.parse(result)).not.toThrow();
  });

  it('rejects an outputSchema payload carrying a field not declared in the schema', () => {
    const response = buildFortyHoldingFixture();
    const result = buildPortfolioSummaryToolResult(response, CONFIG);
    if (result.kind !== 'ok') throw new Error('expected ok');

    const withExtraField = {
      ...result,
      payload: { ...result.payload, unexpectedField: 'should be rejected' },
    };

    expect(() => portfolioSummaryToolOutputSchema.parse(withExtraField)).toThrow();
  });

  it('rejects a model-supplied targetCurrency via .strict() — the inputSchema accepts no input at all', () => {
    const parsed = portfolioSummaryToolInputSchema.safeParse({ targetCurrency: 'EUR' });
    expect(parsed.success).toBe(false);
  });

  it('rejects a model-supplied livePrices via .strict()', () => {
    const parsed = portfolioSummaryToolInputSchema.safeParse({ livePrices: {} });
    expect(parsed.success).toBe(false);
  });

  it("resolves targetCurrency from requestContext's base currency and livePrices from the tool factory's own config — never from tool input, even when a caller supplies them", async () => {
    const livePrices = new Map([['BTC', '75000.00']]);
    const useCase = { execute: vi.fn(async () => emptyResponse()) };
    const resolveLivePrices = vi.fn(async () => livePrices);
    const tool = portfolioSummaryTool(useCase, { ...CONFIG, livePrices: resolveLivePrices });

    const requestContext = new RequestContext<AdvisorRequestContextValues>([
      ['locale', 'en'],
      ['baseCurrency', 'EUR'],
    ]);

    if (!tool.execute) throw new Error('expected tool.execute to be defined');
    // `inputData` can carry nothing (proven by the two `.strict()` rejection tests above —
    // Mastra's own `Tool.execute` re-validates `inputSchema` even on a direct call, so there is no
    // runtime path by which a caller-supplied `targetCurrency`/`livePrices` could ever reach here).
    // This proves the *positive* half of the claim: the real values still come from `requestContext` and
    // the factory's own `config`, not from a (structurally impossible) matching input field.
    const parsedInput = portfolioSummaryToolInputSchema.parse({});
    await tool.execute(parsedInput, { requestContext, observe: noopObserve });

    expect(resolveLivePrices).toHaveBeenCalledWith('EUR');
    expect(useCase.execute).toHaveBeenCalledWith({
      targetCurrency: 'EUR',
      livePrices,
    });
  });
});

describe('portfolio_summary tool — aggregates over the valued holdings', () => {
  function holding(
    id: string,
    value: string | undefined,
    cost: string,
    overrides: Partial<PortfolioHoldingDto> = {},
  ): PortfolioHoldingDto {
    return {
      id,
      symbol: id.toUpperCase(),
      amount: '1',
      avg_price_fiat: cost,
      cost_basis_fiat: cost,
      cost_basis: { kind: 'NATIVE', amount: cost, currency: 'EUR' },
      current_value_fiat: value,
      currency: 'EUR',
      portfolio_locations: [],
      ...overrides,
    };
  }

  function responseOf(
    holdings: PortfolioHoldingDto[],
    metrics: Partial<PortfolioSummaryResponse['metrics']> = {},
  ): PortfolioSummaryResponse {
    return {
      metrics: {
        rates_incomplete: false,
        prices_incomplete: false,
        total_equity_fiat: '999.00',
        total_cost_basis_fiat: '888.00',
        total_realized_pnl_fiat: '12.34',
        total_unrealized_pnl_fiat: '777.00',
        total_pnl_fiat: '789.34',
        currency: 'EUR',
        ...metrics,
      },
      holdings,
    };
  }

  function metricsOf(response: PortfolioSummaryResponse, topNHoldings = 15) {
    const result = buildPortfolioSummaryToolResult(response, { topNHoldings, maxChars: 8000 });
    if (result.kind !== 'ok') throw new Error('expected ok');
    return result.payload.metrics;
  }

  const UNCONVERTIBLE = {
    kind: 'UNCONVERTIBLE',
    nativeAmount: '10.00',
    nativeCurrency: 'USD',
    requested: 'EUR',
  } as const;

  it('aggregates agree with the re-valued holdings', () => {
    const response = responseOf([
      holding('a', '100.00', '60.00'),
      holding('b', '50.00', '40.00'),
      holding('c', undefined, '25.00'),
    ]);

    const metrics = metricsOf(response);

    expect(metrics.totalEquityFiat).toBe('150.00');
    expect(metrics.totalCostBasisFiat).toBe('100.00');
    expect(metrics.totalUnrealizedPnlFiat).toBe('50.00');
    expect(metrics.totalRealizedPnlFiat).toBe('12.34');
    expect(metrics.totalPnlFiat).toBe('62.34');
    expect(metrics.currency).toBe('EUR');
  });

  it('sums every valued holding, including those omitted from the top-N', () => {
    const response = responseOf([holding('a', '100.00', '60.00'), holding('b', '50.00', '40.00')]);

    const result = buildPortfolioSummaryToolResult(response, { topNHoldings: 1, maxChars: 8000 });
    if (result.kind !== 'ok') throw new Error('expected ok');

    expect(result.payload.ranked).toHaveLength(1);
    expect(result.payload.omittedCount).toBe(1);
    expect(result.payload.metrics.totalEquityFiat).toBe('150.00');
    expect(result.payload.metrics.totalCostBasisFiat).toBe('100.00');
  });

  it('clears pricesIncomplete when every holding is valued, whatever the KPI flag says', () => {
    const response = responseOf([holding('a', '100.00', '60.00')], { prices_incomplete: true });

    expect(metricsOf(response).pricesIncomplete).toBe(false);
  });

  it('sets pricesIncomplete when a convertible holding has no value', () => {
    const response = responseOf([holding('a', '100.00', '60.00'), holding('b', undefined, '5.00')]);

    expect(metricsOf(response).pricesIncomplete).toBe(true);
  });

  it('does not count an unconvertible holding as a missing price', () => {
    const response = responseOf([
      holding('a', '100.00', '60.00'),
      holding('b', '7.00', '10.00', { cost_basis: UNCONVERTIBLE }),
    ]);

    expect(metricsOf(response).pricesIncomplete).toBe(false);
  });

  it('sets ratesIncomplete for an unconvertible cost basis even when the KPI flag is false', () => {
    const response = responseOf([
      holding('a', '100.00', '60.00'),
      holding('b', '7.00', '10.00', { cost_basis: UNCONVERTIBLE }),
    ]);

    expect(metricsOf(response).ratesIncomplete).toBe(true);
  });

  it('keeps ratesIncomplete true when the KPI flag is true', () => {
    const response = responseOf([holding('a', '100.00', '60.00')], { rates_incomplete: true });

    expect(metricsOf(response).ratesIncomplete).toBe(true);
  });

  it('leaves realized PnL byte-identical to the KPI figure whatever the holdings are worth', () => {
    const realized = '1234.567890123456789012';
    for (const value of ['1.00', '1000000.00', '0.01']) {
      const response = responseOf([holding('a', value, '60.00')], {
        total_realized_pnl_fiat: realized,
      });

      expect(metricsOf(response).totalRealizedPnlFiat).toBe(realized);
    }
  });
});

describe('portfolio_summary boundary validation', () => {
  function executeWith(mutate: (holding: PortfolioHoldingDto) => PortfolioHoldingDto) {
    const response = buildFortyHoldingFixture();
    const [first, ...rest] = response.holdings;
    if (first === undefined) throw new Error('expected a holding fixture');
    const corrupted = { ...response, holdings: [mutate(first), ...rest] };
    const tool = portfolioSummaryTool({ execute: vi.fn(async () => corrupted) }, CONFIG);
    if (!tool.execute) throw new Error('expected tool.execute to be defined');
    const requestContext = new RequestContext<AdvisorRequestContextValues>([
      ['locale', 'en'],
      ['baseCurrency', 'EUR'],
    ]);
    return tool.execute({}, { requestContext, observe: noopObserve });
  }

  it('surfaces a tool error naming the field, and forwards no value, when a held amount is not an exact decimal string', async () => {
    const result = await executeWith((holding) => ({ ...holding, amount: '1e3', current_value_fiat: '9999999.00' }));

    expect(result).toMatchObject({ error: true, message: expect.stringContaining('payload.ranked.0.amount') });
    expect(result).not.toHaveProperty('kind');
  });

  it('rejects rather than ranking or coercing when a holding value is not an exact decimal string', async () => {
    await expect(executeWith((holding) => ({ ...holding, current_value_fiat: '1e3' }))).rejects.toThrow(
      /valid decimal string/,
    );
  });
});
