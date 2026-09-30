import { describe, it, expect, vi } from 'vitest';
import { RequestContext } from '@mastra/core/request-context';
import { noopObserve } from '@mastra/core/tools';
import {
  assetAllocationTool,
  assetAllocationToolInputSchema,
  assetAllocationToolOutputSchema,
  buildAssetAllocationToolResult,
} from '../assetAllocationTool.js';
import type { AdvisorRequestContextValues } from '../../advisorRequestContext.js';
import type { AssetAllocationItem } from '../../../../domain/ports/IMetricsPort.js';

function buildItems(count: number): AssetAllocationItem[] {
  return Array.from({ length: count }, (_, i) => ({
    kind: 'valued' as const,
    assetId: `asset-${i}`,
    symbol: `SYM${i}`,
    amount: `${i + 1}.5`,
    allocationPct: `${i}.00`,
    valueFiat: `${1000 - i}.00`,
    currency: 'EUR',
  }));
}

const CONFIG = { topNHoldings: 15, maxChars: 3000 };

describe('asset_allocation tool', () => {
  it('ranks by valueFiat via rankHoldingsByValue, top topNHoldings, with omittedCount', () => {
    const items = buildItems(40);

    const result = buildAssetAllocationToolResult(items, CONFIG);

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') throw new Error('expected ok');
    expect(result.payload.ranked).toHaveLength(15);
    expect(result.payload.ranked[0]!.assetId).toBe('asset-0');
    expect(result.payload.omittedCount).toBe(25);
    expect(result.payload.unvalued).toHaveLength(0);

    expect(() => assetAllocationToolOutputSchema.parse(result)).not.toThrow();
  });

  it('rejects an outputSchema payload carrying an undeclared field', () => {
    const result = buildAssetAllocationToolResult(buildItems(1), CONFIG);
    if (result.kind !== 'ok') throw new Error('expected ok');

    const withExtraField = { ...result, payload: { ...result.payload, unexpectedField: 'nope' } };

    expect(() => assetAllocationToolOutputSchema.parse(withExtraField)).toThrow();
  });

  it('carries the held quantity of each ranked asset', () => {
    const result = buildAssetAllocationToolResult(buildItems(2), CONFIG);
    if (result.kind !== 'ok') throw new Error('expected ok');

    expect(result.payload.ranked.map((r) => r.amount)).toEqual(['1.5', '2.5']);
  });

  it('rejects a ranked amount that is not an exact decimal string', () => {
    const result = buildAssetAllocationToolResult(buildItems(1), CONFIG);
    if (result.kind !== 'ok') throw new Error('expected ok');
    const bad = { ...result, payload: { ...result.payload, ranked: [{ ...result.payload.ranked[0]!, amount: '1e3' }] } };

    expect(assetAllocationToolOutputSchema.safeParse(bad).success).toBe(false);
  });

  it('routes a holding with no computable value to the unvalued bucket with its quantity', () => {
    const items: AssetAllocationItem[] = [
      ...buildItems(2),
      { kind: 'unvalued', assetId: 'mystery', symbol: 'MYS', amount: '42', currency: 'EUR' },
    ];

    const result = buildAssetAllocationToolResult(items, CONFIG);

    if (result.kind !== 'ok') throw new Error('expected ok');
    expect(result.payload.ranked).toHaveLength(2);
    expect(result.payload.unvalued).toEqual([{ kind: 'unvalued', assetId: 'mystery', symbol: 'MYS', amount: '42' }]);
    expect(() => assetAllocationToolOutputSchema.parse(result)).not.toThrow();
  });

  it('truncates when the payload exceeds maxChars', () => {
    const result = buildAssetAllocationToolResult(buildItems(15), { topNHoldings: 15, maxChars: 1 });

    expect(result.kind).toBe('truncated');
  });

  it('describes the quantity so the model knows it is available', () => {
    const tool = assetAllocationTool({ execute: vi.fn(async () => []) }, CONFIG);

    expect(tool.description).toMatch(/quantity/i);
    expect(tool.description).toMatch(/unvalued/i);
  });

  it('inputSchema accepts no accountId — the wrapped use case takes none', () => {
    expect(() => assetAllocationToolInputSchema.parse({ accountId: 'acc-1' })).toThrow();
    expect(() => assetAllocationToolInputSchema.parse({})).not.toThrow();
  });
});

describe('asset_allocation base currency resolution', () => {
  it('asks its use case for the request base currency', async () => {
    const useCase = { execute: vi.fn(async () => buildItems(1)) };
    const tool = assetAllocationTool(useCase, CONFIG);
    if (!tool.execute) throw new Error('expected tool.execute to be defined');
    const requestContext = new RequestContext<AdvisorRequestContextValues>([
      ['locale', 'en'],
      ['baseCurrency', 'USD'],
    ]);

    await tool.execute({}, { requestContext, observe: noopObserve });

    expect(useCase.execute).toHaveBeenCalledWith('USD');
  });
});

describe('asset_allocation boundary validation', () => {
  it('surfaces a tool error naming the field, and forwards no value, when the use case returns an amount preciseAmountSchema rejects', async () => {
    const [valued] = buildItems(1);
    if (valued === undefined || valued.kind !== 'valued') throw new Error('expected a valued fixture');
    const tool = assetAllocationTool({ execute: vi.fn(async () => [{ ...valued, amount: '1e3' }]) }, CONFIG);
    if (!tool.execute) throw new Error('expected tool.execute to be defined');
    const requestContext = new RequestContext<AdvisorRequestContextValues>([
      ['locale', 'en'],
      ['baseCurrency', 'EUR'],
    ]);

    const result = await tool.execute({}, { requestContext, observe: noopObserve });

    expect(result).toMatchObject({ error: true, message: expect.stringContaining('payload.ranked.0.amount') });
    expect(result).not.toHaveProperty('payload');
    expect(result).not.toHaveProperty('kind');
  });
});
