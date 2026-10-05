import { describe, it, expect } from 'vitest';
import {
  breakevenPriceInputSchema,
  portfolioShockInputSchema,
  scenarioPositionValueInputSchema,
  scenarioPctSchema,
} from '../../src/advisor-scenarios';

describe('scenario percentage', () => {
  it.each(['-100', '1000', '0', '-99.99', '12.5'])('accepts %s', (pct) => {
    expect(scenarioPctSchema.safeParse(pct).success).toBe(true);
  });

  it.each(['-100.01', '1000.01', '-101', '5000'])('rejects %s', (pct) => {
    expect(scenarioPctSchema.safeParse(pct).success).toBe(false);
  });

  it('rejects a malformed value through preciseAmountSchema', () => {
    for (const bad of ['abc', '1e3', '', '10%', ' 5']) expect(scenarioPctSchema.safeParse(bad).success, bad).toBe(false);
  });
});

describe('scenario_position_value input', () => {
  it('upper-cases the symbol and accepts a zero or decimal price', () => {
    expect(scenarioPositionValueInputSchema.parse({ symbol: 'btc', hypotheticalPrice: '0' })).toEqual({
      symbol: 'BTC',
      hypotheticalPrice: '0',
    });
    expect(scenarioPositionValueInputSchema.safeParse({ symbol: 'BTC', hypotheticalPrice: '70000.5' }).success).toBe(true);
  });

  it('rejects a malformed or negative price', () => {
    for (const bad of ['abc', '1e5', '', '-1']) {
      expect(scenarioPositionValueInputSchema.safeParse({ symbol: 'BTC', hypotheticalPrice: bad }).success, bad).toBe(false);
    }
  });

  it('rejects quantity, cost basis, current value, currency and account fields as unknown keys', () => {
    for (const extra of ['quantity', 'costBasis', 'currentValue', 'currency', 'targetCurrency', 'accountId']) {
      const input = { symbol: 'BTC', hypotheticalPrice: '1', [extra]: '1' };
      expect(scenarioPositionValueInputSchema.safeParse(input).success, extra).toBe(false);
    }
  });
});

describe('breakeven_price input', () => {
  it('takes only a symbol', () => {
    expect(breakevenPriceInputSchema.parse({ symbol: 'eth' })).toEqual({ symbol: 'ETH' });
    expect(breakevenPriceInputSchema.safeParse({ symbol: 'ETH', quantity: '1' }).success).toBe(false);
    expect(breakevenPriceInputSchema.safeParse({}).success).toBe(false);
  });
});

describe('scenario_portfolio_shock input', () => {
  const shock = (symbols: number) => ({
    shock: {
      kind: 'per_asset' as const,
      shocks: Array.from({ length: symbols }, (_, i) => ({ symbol: `S${i}`, pct: '5' })),
    },
  });

  it('accepts a uniform shock within the percentage range', () => {
    expect(portfolioShockInputSchema.safeParse({ shock: { kind: 'uniform', pct: '-100' } }).success).toBe(true);
    expect(portfolioShockInputSchema.safeParse({ shock: { kind: 'uniform', pct: '1000.01' } }).success).toBe(false);
  });

  it('accepts one to twenty-five per-asset entries and rejects zero or twenty-six', () => {
    expect(portfolioShockInputSchema.safeParse(shock(1)).success).toBe(true);
    expect(portfolioShockInputSchema.safeParse(shock(25)).success).toBe(true);
    expect(portfolioShockInputSchema.safeParse(shock(0)).success).toBe(false);
    expect(portfolioShockInputSchema.safeParse(shock(26)).success).toBe(false);
  });

  it('bounds each per-asset percentage and upper-cases each symbol', () => {
    const parsed = portfolioShockInputSchema.parse({ shock: { kind: 'per_asset', shocks: [{ symbol: 'btc', pct: '10' }] } });

    expect(parsed.shock).toEqual({ kind: 'per_asset', shocks: [{ symbol: 'BTC', pct: '10' }] });
    expect(
      portfolioShockInputSchema.safeParse({ shock: { kind: 'per_asset', shocks: [{ symbol: 'BTC', pct: '-101' }] } }).success,
    ).toBe(false);
  });

  it('rejects unknown keys at every level and a non-object root', () => {
    expect(portfolioShockInputSchema.safeParse({ shock: { kind: 'uniform', pct: '1', currency: 'EUR' } }).success).toBe(false);
    expect(portfolioShockInputSchema.safeParse({ shock: { kind: 'uniform', pct: '1' }, accountId: 'x' }).success).toBe(false);
    expect(portfolioShockInputSchema.safeParse({ kind: 'uniform', pct: '1' }).success).toBe(false);
  });
});
