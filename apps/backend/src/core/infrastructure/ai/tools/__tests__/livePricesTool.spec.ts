import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { RequestContext } from '@mastra/core/request-context';
import { noopObserve } from '@mastra/core/tools';
import { findIdentifiers } from '../../__tests__/support/advisorSourceScan.js';
import {
  buildLivePricesToolResult,
  livePricesTool,
  livePricesToolInputSchema,
  livePricesToolOutputSchema,
} from '../livePricesTool.js';
import type { AssetPrice } from '@kryptofolio/shared-types';

const CONFIG = { maxChars: 2000, currency: 'EUR', now: () => new Date('2025-01-01T00:00:10Z') };

const BTC_PRICE: AssetPrice = {
  symbol: 'BTC',
  currency: 'EUR',
  price: '50000.00',
  change24hPercent: '1.2',
  provider: 'kraken',
  timestamp: '2025-01-01T00:00:00Z',
};

describe('live_prices tool', () => {
  it('resolves a cached price with computed stalenessSeconds and lists an untracked symbol in notTracked, never fabricating a price', () => {
    const result = buildLivePricesToolResult(
      [
        { symbol: 'BTC', price: BTC_PRICE },
        { symbol: 'NOPE', price: null },
      ],
      CONFIG,
    );

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') throw new Error('expected ok');
    expect(result.payload.prices).toHaveLength(1);
    expect(result.payload.prices[0]).toEqual({
      symbol: 'BTC',
      price: '50000.00',
      currency: 'EUR',
      timestamp: '2025-01-01T00:00:00Z',
      provider: 'kraken',
      stalenessSeconds: 10,
    });
    expect(result.payload.notTracked).toEqual(['NOPE']);
    expect(() => livePricesToolOutputSchema.parse(result)).not.toThrow();
  });

  it('inputSchema accepts only symbols (1-25), no accountId, no currency', () => {
    expect(() => livePricesToolInputSchema.parse({ symbols: ['BTC'] })).not.toThrow();
    expect(() => livePricesToolInputSchema.parse({ symbols: [] })).toThrow();
    expect(() =>
      livePricesToolInputSchema.parse({ symbols: Array.from({ length: 26 }, () => 'BTC') }),
    ).toThrow();
    expect(() => livePricesToolInputSchema.parse({ symbols: ['BTC'], accountId: 'acc-1' })).toThrow();
    expect(() => livePricesToolInputSchema.parse({ symbols: ['BTC'], currency: 'USD' })).toThrow();
  });

  it('runs by calling only getLatest once per requested symbol, and touches nothing else on its dependency', async () => {
    const calls: Array<[string, string]> = [];
    const touched: string[] = [];
    const port = new Proxy(
      {
        getLatest: async (symbol: string, currency: string): Promise<AssetPrice | null> => {
          calls.push([symbol, currency]);
          return symbol === 'BTC' ? BTC_PRICE : null;
        },
      },
      {
        get(target, property, receiver) {
          touched.push(String(property));
          return Reflect.get(target, property, receiver);
        },
      },
    );
    const tool = livePricesTool(port, CONFIG);
    if (!tool.execute) throw new Error('expected tool.execute to be defined');

    const result = await tool.execute({ symbols: ['BTC', 'NOPE'] }, { requestContext: new RequestContext(), observe: noopObserve });

    expect(calls).toEqual([
      ['BTC', 'EUR'],
      ['NOPE', 'EUR'],
    ]);
    expect(new Set(touched)).toEqual(new Set(['getLatest']));
    expect(result).toMatchObject({ kind: 'ok', payload: { notTracked: ['NOPE'] } });
  });

  it('references no market-data provider, stream use case or connection in its source', () => {
    const source = readFileSync(new URL('../livePricesTool.ts', import.meta.url), 'utf8');

    expect(source.length).toBeGreaterThan(1000);
    expect(findIdentifiers(source, /MarketDataProvider|StreamNormalizedMarketData|WebSocket|connect|subscribe/i)).toEqual([]);
  });

  it('the identifier scan sees a provider import and ignores a comment naming it', () => {
    expect(findIdentifiers('import type { IMarketDataProvider } from "../ports/IMarketDataProvider.js";', /MarketDataProvider/)).not.toEqual([]);
    expect(findIdentifiers('// IMarketDataProvider\nconst note = "StreamNormalizedMarketDataUC";', /MarketDataProvider|StreamNormalizedMarketData/)).toEqual([]);
  });
});
