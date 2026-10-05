import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GetPortfolioScenarioUseCase } from '../GetPortfolioScenarioUseCase.js';
import type {
  PortfolioHoldingDto,
  PortfolioSummaryResponse,
} from '../GetPortfolioSummaryUseCase.js';

function holding(symbol: string, amount: string, value: string | undefined, cost = '0'): PortfolioHoldingDto {
  return {
    id: `asset-${symbol}`,
    symbol,
    amount,
    avg_price_fiat: '0',
    cost_basis_fiat: cost,
    cost_basis: { kind: 'NATIVE', amount: cost, currency: 'EUR' },
    current_value_fiat: value,
    currency: 'EUR',
    portfolio_locations: [],
  };
}

function summary(holdings: PortfolioHoldingDto[], currency = 'EUR'): PortfolioSummaryResponse {
  return {
    metrics: {
      rates_incomplete: false,
      prices_incomplete: false,
      total_equity_fiat: '0',
      total_cost_basis_fiat: '0',
      total_realized_pnl_fiat: '0',
      total_unrealized_pnl_fiat: '0',
      total_pnl_fiat: '0',
      currency,
    },
    holdings,
  };
}

const HOLDINGS = [holding('BTC', '2', '100000', '30000'), holding('ETH', '10', '100000', '5000')];

function build(response: PortfolioSummaryResponse = summary(HOLDINGS)) {
  const portfolioSummary = { execute: vi.fn(async () => response) };
  return { useCase: new GetPortfolioScenarioUseCase(portfolioSummary), portfolioSummary };
}

describe('GetPortfolioScenarioUseCase', () => {
  const livePrices = new Map([['BTC', '50000']]);
  const scope = { targetCurrency: 'EUR', livePrices };

  it('reads the whole portfolio once per scenario, for every account, in the request currency', async () => {
    const { useCase, portfolioSummary } = build();

    await useCase.positionValue({ ...scope, symbol: 'BTC', hypotheticalPrice: '70000' });

    expect(portfolioSummary.execute).toHaveBeenCalledTimes(1);
    expect(portfolioSummary.execute).toHaveBeenCalledWith({ targetCurrency: 'EUR', livePrices });
  });

  it('delegates position value to the pure function and states the summary currency', async () => {
    const { useCase } = build(summary(HOLDINGS, 'USD'));

    const result = await useCase.positionValue({ ...scope, symbol: 'BTC', hypotheticalPrice: '70000' });

    expect(result).toMatchObject({
      kind: 'computed',
      currency: 'USD',
      positionValue: '140000',
      deltaVsCurrent: '40000',
    });
  });

  it('delegates breakeven price', async () => {
    const { useCase } = build();

    expect(await useCase.breakeven({ ...scope, symbol: 'BTC' })).toMatchObject({
      kind: 'computed',
      avgUnitCost: '15000',
      currency: 'EUR',
    });
  });

  it('delegates a portfolio shock', async () => {
    const { useCase } = build();

    const result = await useCase.portfolioShock({ ...scope, shock: { kind: 'uniform', pct: '-50' } });

    expect(result).toMatchObject({ kind: 'computed', totalBefore: '200000', totalAfter: '100000', currency: 'EUR' });
  });

  it('delegates concentration', async () => {
    const { useCase } = build();

    const result = await useCase.concentration(scope);

    expect(result.all).toMatchObject({ kind: 'computed', top1Weight: '0.5', hhi: '0.5' });
    expect(result.currency).toBe('EUR');
  });

  it('treats a holding whose cost basis cannot be converted as unvalued, whatever value it carries', async () => {
    const unconvertible: PortfolioHoldingDto = {
      ...holding('ADA', '5', '999'),
      cost_basis: { kind: 'UNCONVERTIBLE', nativeAmount: '1', nativeCurrency: 'USD', requested: 'EUR' },
    };
    const { useCase } = build(summary([...HOLDINGS, unconvertible]));

    expect(await useCase.positionValue({ ...scope, symbol: 'ADA', hypotheticalPrice: '1' })).toMatchObject({
      kind: 'unvalued',
    });
    expect(await useCase.breakeven({ ...scope, symbol: 'ADA' })).toMatchObject({ kind: 'unconvertible_cost_basis' });
  });

  it('passes a not-held outcome through untouched', async () => {
    const { useCase } = build();

    expect(await useCase.breakeven({ ...scope, symbol: 'XYZ' })).toEqual({
      kind: 'not_held',
      symbol: 'XYZ',
      currency: 'EUR',
    });
  });

  it('does no arithmetic of its own: it imports neither Money nor decimal.js', () => {
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../GetPortfolioScenarioUseCase.ts'),
      'utf-8',
    );

    expect(source).not.toMatch(/decimal\.js/);
    expect(source).not.toMatch(/\bMoney\b/);
  });
});
