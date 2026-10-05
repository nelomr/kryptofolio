import { describe, it, expect, vi } from 'vitest';
import { RequestContext } from '@mastra/core/request-context';
import { noopObserve } from '@mastra/core/tools';
import {
  buildDerivativesPnlToolResult,
  derivativesPnlTool,
  derivativesPnlToolInputSchema,
  derivativesPnlToolOutputSchema,
} from '../derivativesPnlTool.js';
import type { DerivativesPnl } from '../../../../domain/ports/IPortfolioAnalyticsPort.js';
import type { AdvisorRequestContextValues } from '../../advisorRequestContext.js';

const pnl = (symbol: string, realizedPnl: string): DerivativesPnl => ({
  symbol,
  contractName: symbol,
  realizedPnl,
  funding: '0',
  fees: '0',
  netPnl: realizedPnl,
  currency: 'USD',
});

const CONFIG = { topNHoldings: 2, maxChars: 4000 };

describe('derivatives_pnl tool', () => {
  it('ranks by absolute realized PnL and caps at topNHoldings with an explicit omittedCount', () => {
    const rows = [pnl('SMALL', '5'), pnl('BIGLOSS', '-900'), pnl('MID', '300'), pnl('TINY', '-1')];

    const result = buildDerivativesPnlToolResult(rows, CONFIG);

    if (result.kind !== 'ok') throw new Error('expected ok');
    expect(result.payload.ranked.map((r) => r.symbol)).toEqual(['BIGLOSS', 'MID']);
    expect(result.payload.omittedCount).toBe(2);
    expect(derivativesPnlToolOutputSchema.parse(result)).toEqual(result);
  });

  it('keeps each row exactly as the use case returned it, with its declared currency', () => {
    const rows = [{ ...pnl('PF', '1.50'), funding: '0.25', fees: '0.10', netPnl: '1.65', currency: 'USD' }];

    const result = buildDerivativesPnlToolResult(rows, CONFIG);

    if (result.kind !== 'ok') throw new Error('expected ok');
    expect(result.payload.ranked[0]).toEqual(rows[0]);
  });

  it('returns an empty list, not an error, when there are no derivatives', () => {
    const result = buildDerivativesPnlToolResult([], CONFIG);

    expect(result).toEqual({ kind: 'ok', payload: { ranked: [], omittedCount: 0 } });
  });

  it('truncates through the budget gate', () => {
    expect(buildDerivativesPnlToolResult([pnl('A', '1')], { ...CONFIG, maxChars: 5 }).kind).toBe('truncated');
  });

  it('takes no input and calls the use case with the request base currency', async () => {
    const useCase = { execute: vi.fn(async () => [pnl('A', '1')]) };
    const tool = derivativesPnlTool(useCase, CONFIG);
    if (!tool.execute) throw new Error('expected tool.execute');

    await tool.execute(
      {},
      {
        requestContext: new RequestContext<AdvisorRequestContextValues>([
          ['locale', 'en'],
          ['baseCurrency', 'EUR'],
        ]),
        observe: noopObserve,
      },
    );

    expect(useCase.execute).toHaveBeenCalledWith('EUR');
    expect(derivativesPnlToolInputSchema.safeParse({ accountId: 'x' }).success).toBe(false);
    expect(derivativesPnlToolInputSchema.safeParse({ currency: 'USD' }).success).toBe(false);
  });
});
