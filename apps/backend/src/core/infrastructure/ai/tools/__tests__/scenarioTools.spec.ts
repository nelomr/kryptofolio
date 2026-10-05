import { describe, it, expect, vi } from 'vitest';
import { RequestContext } from '@mastra/core/request-context';
import { noopObserve } from '@mastra/core/tools';
import { declaredFieldNames } from '../../__tests__/support/zodSchemaWalk.js';
import { scenarioPositionValueTool } from '../scenarioPositionValueTool.js';
import { breakevenPriceTool } from '../breakevenPriceTool.js';
import { scenarioPortfolioShockTool } from '../scenarioPortfolioShockTool.js';
import { concentrationRiskTool, concentrationRiskToolInputSchema } from '../concentrationRiskTool.js';
import type { AdvisorRequestContextValues } from '../../advisorRequestContext.js';

const context = () => ({
  requestContext: new RequestContext<AdvisorRequestContextValues>([
    ['locale', 'en'],
    ['baseCurrency', 'EUR'],
  ]),
  observe: noopObserve,
});

const FORBIDDEN = ['quantity', 'costBasis', 'currentValue', 'currency', 'targetCurrency', 'accountId', 'livePrices'];

function exec(tool: { execute?: (input: never, ctx: ReturnType<typeof context>) => Promise<unknown> }, input: unknown) {
  if (!tool.execute) throw new Error('expected tool.execute');
  return tool.execute(input as never, context());
}

const livePrices = new Map([['BTC', '1']]);
const scope = { targetCurrency: 'EUR', livePrices };

describe('scenario_position_value tool', () => {
  const config = { maxChars: 1500, livePrices: async () => livePrices };

  it('forwards a computed outcome and the ledger-derived figures untouched', async () => {
    const outcome = {
      kind: 'computed' as const,
      symbol: 'BTC',
      positionValue: '140000',
      deltaVsCurrent: '40000',
      impliedAllocationPct: '58.3',
      currency: 'EUR',
    };
    const useCase = { positionValue: vi.fn(async () => outcome) };
    const tool = scenarioPositionValueTool(useCase, config);

    const result = await exec(tool, { symbol: 'btc', hypotheticalPrice: '70000' });

    expect(result).toEqual({ kind: 'ok', payload: outcome });
    expect(useCase.positionValue).toHaveBeenCalledWith({ ...scope, symbol: 'BTC', hypotheticalPrice: '70000' });
  });

  it.each([
    [{ kind: 'not_held', symbol: 'XYZ', currency: 'EUR' }],
    [{ kind: 'unvalued', symbol: 'BTC', positionValue: '10', currency: 'EUR' }],
    [{ kind: 'empty_portfolio', symbol: 'BTC', currency: 'EUR' }],
  ] as const)('forwards the %j outcome as a successful result, not a tool error', async (outcome) => {
    const tool = scenarioPositionValueTool({ positionValue: async () => outcome }, config);

    expect(await exec(tool, { symbol: 'BTC', hypotheticalPrice: '1' })).toEqual({ kind: 'ok', payload: outcome });
  });

  it('truncates through the budget gate and declares no quantity or currency input', async () => {
    const tool = scenarioPositionValueTool(
      { positionValue: async () => ({ kind: 'not_held', symbol: 'X', currency: 'EUR' }) },
      { maxChars: 5, livePrices: async () => livePrices },
    );

    expect(await exec(tool, { symbol: 'X', hypotheticalPrice: '1' })).toMatchObject({ kind: 'truncated', maxChars: 5 });
    expect(declaredFieldNames(tool.inputSchema as never)).toEqual(expect.not.arrayContaining(FORBIDDEN));
  });
});

describe('breakeven_price tool', () => {
  const config = { maxChars: 1500, livePrices: async () => livePrices };

  it('forwards an unconvertible cost basis as a successful result', async () => {
    const outcome = { kind: 'unconvertible_cost_basis' as const, symbol: 'BTC', currency: 'EUR' };
    const useCase = { breakeven: vi.fn(async () => outcome) };
    const tool = breakevenPriceTool(useCase, config);

    expect(await exec(tool, { symbol: 'BTC' })).toEqual({ kind: 'ok', payload: outcome });
    expect(useCase.breakeven).toHaveBeenCalledWith({ ...scope, symbol: 'BTC' });
  });

  it('forwards computed, not_held and zero_quantity outcomes', async () => {
    for (const outcome of [
      { kind: 'computed' as const, symbol: 'BTC', avgUnitCost: '15000', currency: 'EUR' },
      { kind: 'not_held' as const, symbol: 'BTC', currency: 'EUR' },
      { kind: 'zero_quantity' as const, symbol: 'BTC', currency: 'EUR' },
    ]) {
      const tool = breakevenPriceTool({ breakeven: async () => outcome }, config);
      expect(await exec(tool, { symbol: 'BTC' })).toEqual({ kind: 'ok', payload: outcome });
    }
  });

  it('is strict, id-less and currency-less, and its description names the holdings cost basis caveat', () => {
    const tool = breakevenPriceTool({ breakeven: async () => ({ kind: 'not_held', symbol: 'X', currency: 'EUR' }) }, config);

    expect([...new Set(declaredFieldNames(tool.inputSchema as never))]).toEqual(['symbol']);
    expect(tool.description).toMatch(/cost basis/i);
    expect(tool.description).toMatch(/kpis/);
  });
});

describe('scenario_portfolio_shock tool', () => {
  const computed = (count: number) => ({
    kind: 'computed' as const,
    assets: Array.from({ length: count }, (_, i) => ({ symbol: `S${i}`, before: '10', after: '5' })),
    totalBefore: '100',
    totalAfter: '50',
    delta: '-50',
    unvaluedSymbols: ['ADA'],
    notHeld: ['XYZ'],
    currency: 'EUR',
  });
  const config = { topNHoldings: 2, maxChars: 4000, livePrices: async () => livePrices };

  it('forwards the shock input and caps the per-asset list with an explicit omittedCount', async () => {
    const useCase = { portfolioShock: vi.fn(async () => computed(3)) };
    const tool = scenarioPortfolioShockTool(useCase, config);

    const result = await exec(tool, { shock: { kind: 'uniform', pct: '-50' } });

    expect(useCase.portfolioShock).toHaveBeenCalledWith({ ...scope, shock: { kind: 'uniform', pct: '-50' } });
    expect(result).toMatchObject({
      kind: 'ok',
      payload: { kind: 'computed', omittedCount: 1, totalAfter: '50', unvaluedSymbols: ['ADA'], notHeld: ['XYZ'] },
    });
    expect((result as { payload: { assets: unknown[] } }).payload.assets).toHaveLength(2);
  });

  it('forwards empty_portfolio as a successful result', async () => {
    const tool = scenarioPortfolioShockTool(
      { portfolioShock: async () => ({ kind: 'empty_portfolio', currency: 'EUR' }) },
      config,
    );

    expect(await exec(tool, { shock: { kind: 'uniform', pct: '1' } })).toEqual({
      kind: 'ok',
      payload: { kind: 'empty_portfolio', currency: 'EUR' },
    });
  });

  it('declares no quantity, currency or account input', () => {
    const tool = scenarioPortfolioShockTool({ portfolioShock: async () => computed(0) }, config);

    expect(declaredFieldNames(tool.inputSchema as never)).toEqual(expect.not.arrayContaining(FORBIDDEN));
  });
});

describe('concentration_risk tool', () => {
  const outcome = {
    all: { kind: 'computed' as const, top1Weight: '0.5', top3Weight: '1', hhi: '0.5', effectiveHoldings: '2' },
    excludingStablecoins: { kind: 'empty' as const },
    stablecoinWeight: '0.5',
    unvaluedCount: 1,
    currency: 'EUR',
  };
  const config = { maxChars: 2000, livePrices: async () => livePrices };

  it('forwards both blocks, the stablecoin weight and the unvalued count', async () => {
    const useCase = { concentration: vi.fn(async () => outcome) };
    const tool = concentrationRiskTool(useCase, config);

    expect(await exec(tool, {})).toEqual({ kind: 'ok', payload: outcome });
    expect(useCase.concentration).toHaveBeenCalledWith(scope);
  });

  it('takes no input at all', () => {
    const tool = concentrationRiskTool({ concentration: async () => outcome }, config);

    expect(tool.id).toBe('concentration_risk');
    expect(concentrationRiskToolInputSchema.safeParse({ currency: 'EUR' }).success).toBe(false);
    expect(concentrationRiskToolInputSchema.safeParse({}).success).toBe(true);
  });
});
