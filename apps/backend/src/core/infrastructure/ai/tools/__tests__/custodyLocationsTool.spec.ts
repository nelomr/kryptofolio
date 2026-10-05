import { describe, it, expect, vi } from 'vitest';
import { RequestContext } from '@mastra/core/request-context';
import { noopObserve } from '@mastra/core/tools';
import {
  buildCustodyLocationsToolResult,
  custodyLocationsTool,
  custodyLocationsToolInputSchema,
  custodyLocationsToolOutputSchema,
} from '../custodyLocationsTool.js';

const holding = (symbol: string, accountName: string, quantity: string, lotCount = 1) => ({
  symbol,
  accountName,
  quantity,
  lotCount,
});

const CONFIG = { topNHoldings: 2, maxChars: 4000 };

describe('custody_locations tool', () => {
  it('lists each non-synthetic location and reports synthetic rows only as a count', () => {
    const result = buildCustodyLocationsToolResult(
      { holdings: [holding('BTC', 'Kraken', '1.5', 3)], syntheticRowCount: 4 },
      CONFIG,
    );

    expect(result).toEqual({
      kind: 'ok',
      payload: { locations: [holding('BTC', 'Kraken', '1.5', 3)], omittedCount: 0, syntheticRowCount: 4 },
    });
    expect(custodyLocationsToolOutputSchema.parse(result)).toEqual(result);
  });

  it('caps the list at topNHoldings with an explicit omittedCount', () => {
    const result = buildCustodyLocationsToolResult(
      {
        holdings: [holding('A', 'X', '1'), holding('B', 'X', '1'), holding('C', 'X', '1')],
        syntheticRowCount: 0,
      },
      CONFIG,
    );

    if (result.kind !== 'ok') throw new Error('expected ok');
    expect(result.payload.locations).toHaveLength(2);
    expect(result.payload.omittedCount).toBe(1);
  });

  it('truncates through the budget gate', () => {
    expect(
      buildCustodyLocationsToolResult({ holdings: [holding('A', 'X', '1')], syntheticRowCount: 0 }, { ...CONFIG, maxChars: 5 }).kind,
    ).toBe('truncated');
  });

  it('upper-cases an optional symbol and rejects an account id or currency', () => {
    expect(custodyLocationsToolInputSchema.parse({})).toEqual({});
    expect(custodyLocationsToolInputSchema.parse({ symbol: 'btc' })).toEqual({ symbol: 'BTC' });
    expect(custodyLocationsToolInputSchema.safeParse({ symbol: 'BTC EUR' }).success).toBe(false);
    expect(custodyLocationsToolInputSchema.safeParse({ accountId: 'k' }).success).toBe(false);
    expect(custodyLocationsToolInputSchema.safeParse({ currency: 'EUR' }).success).toBe(false);
  });

  it('passes the symbol through and states that custody has no tax effect', async () => {
    const useCase = { execute: vi.fn(async () => ({ holdings: [], syntheticRowCount: 0 })) };
    const tool = custodyLocationsTool(useCase, CONFIG);
    if (!tool.execute) throw new Error('expected tool.execute');

    await tool.execute({ symbol: 'BTC' }, { requestContext: new RequestContext(), observe: noopObserve });

    expect(useCase.execute).toHaveBeenCalledWith({ symbol: 'BTC' });
    expect(tool.description).toMatch(/no effect on taxation/i);
  });
});
