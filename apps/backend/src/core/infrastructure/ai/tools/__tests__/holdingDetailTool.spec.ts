import { describe, it, expect, vi } from 'vitest';
import { RequestContext } from '@mastra/core/request-context';
import { noopObserve } from '@mastra/core/tools';
import {
  buildHoldingDetailToolResult,
  holdingDetailTool,
  holdingDetailToolInputSchema,
  holdingDetailToolOutputSchema,
} from '../holdingDetailTool.js';
import {
  buildFortyHoldingFixture,
  buildFortyHoldingFixtureWithUnvalued,
} from './fixtures/portfolioSummaryFixture.js';
import type { AdvisorRequestContextValues } from '../../advisorRequestContext.js';

const CONFIG = { maxChars: 3000 };

function okPayload(result: ReturnType<typeof buildHoldingDetailToolResult>) {
  if (result.kind !== 'ok') throw new Error('expected ok');
  return result.payload;
}

describe('holding_detail tool', () => {
  it('finds a holding that ranks far outside the portfolio_summary top-N', () => {
    const payload = okPayload(buildHoldingDetailToolResult(buildFortyHoldingFixture(), 'SYNTH10', CONFIG));

    expect(payload.kind).toBe('valued');
    if (payload.kind !== 'valued') throw new Error('expected valued');
    expect(payload.holding.symbol).toBe('SYNTH10');
    expect(payload.holding.currentValueFiat).toBe('1925.00');
  });

  it('returns an unvalued holding with quantity and cost basis and no value', () => {
    const response = buildFortyHoldingFixtureWithUnvalued();

    for (const symbol of ['SYNTH18', 'SYNTH21']) {
      const payload = okPayload(buildHoldingDetailToolResult(response, symbol, CONFIG));

      expect(payload.kind, symbol).toBe('unvalued');
      if (payload.kind !== 'unvalued') throw new Error('expected unvalued');
      expect(payload.holding).toEqual({
        id: `asset-${symbol.toLowerCase()}`,
        symbol,
        amount: expect.any(String),
        costBasisFiat: expect.any(String),
        currency: 'USD',
      });
    }
  });

  it('reports a symbol that is not held as a successful not_held result', () => {
    const payload = okPayload(buildHoldingDetailToolResult(buildFortyHoldingFixture(), 'XYZ', CONFIG));

    expect(payload).toEqual({ kind: 'not_held', symbol: 'XYZ' });
  });

  it('truncates through the budget gate like every other tool', () => {
    const result = buildHoldingDetailToolResult(buildFortyHoldingFixture(), 'BTC', { maxChars: 10 });

    expect(result.kind).toBe('truncated');
    expect(() => holdingDetailToolOutputSchema.parse(result)).not.toThrow();
  });

  it('produces a payload its strict output schema accepts for every outcome', () => {
    const response = buildFortyHoldingFixtureWithUnvalued();

    for (const symbol of ['BTC', 'SYNTH18', 'XYZ']) {
      expect(() => holdingDetailToolOutputSchema.parse(buildHoldingDetailToolResult(response, symbol, CONFIG)), symbol).not.toThrow();
    }
  });

  describe('input', () => {
    it('upper-cases the symbol before matching', () => {
      expect(holdingDetailToolInputSchema.parse({ symbol: 'btc' })).toEqual({ symbol: 'BTC' });
    });

    it('rejects a symbol outside SYMBOL_REGEX', () => {
      expect(holdingDetailToolInputSchema.safeParse({ symbol: 'BTC EUR' }).success).toBe(false);
      expect(holdingDetailToolInputSchema.safeParse({ symbol: '' }).success).toBe(false);
    });

    it('rejects an account id and any other extra field', () => {
      expect(holdingDetailToolInputSchema.safeParse({ symbol: 'BTC', accountId: 'acc-1' }).success).toBe(false);
      expect(holdingDetailToolInputSchema.safeParse({ symbol: 'BTC', targetCurrency: 'EUR' }).success).toBe(false);
    });
  });

  it('reads every account uncapped, with the request currency and injected live prices', async () => {
    const livePrices = new Map([['BTC', '75000.00']]);
    const useCase = { execute: vi.fn(async () => buildFortyHoldingFixture()) };
    const resolveLivePrices = vi.fn(async () => livePrices);
    const tool = holdingDetailTool(useCase, { ...CONFIG, livePrices: resolveLivePrices });
    const requestContext = new RequestContext<AdvisorRequestContextValues>([
      ['locale', 'en'],
      ['baseCurrency', 'EUR'],
    ]);
    if (!tool.execute) throw new Error('expected tool.execute to be defined');

    const result = await tool.execute({ symbol: 'btc' }, { requestContext, observe: noopObserve });

    expect(resolveLivePrices).toHaveBeenCalledWith('EUR');
    expect(useCase.execute).toHaveBeenCalledTimes(1);
    expect(useCase.execute).toHaveBeenCalledWith({ targetCurrency: 'EUR', livePrices });
    expect(result).toMatchObject({ kind: 'ok', payload: { kind: 'valued', holding: { symbol: 'BTC' } } });
  });
});
