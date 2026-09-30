import { describe, it, expect } from 'vitest';
import { resolveExecutionProfile } from '../../models/resolveExecutionProfile.js';
import {
  buildTokenLotsToolResult,
  tokenLotsToolInputSchema,
  tokenLotsToolOutputSchema,
} from '../tokenLotsTool.js';
import type { GetTokenHistoryResponse } from '../../../../application/use-cases/GetTokenHistoryUseCase.js';
import { toPreciseAmount } from '../../../../domain/value-objects/PreciseAmount.js';

function buildResponse(lotCount: number): GetTokenHistoryResponse {
  const lots = Array.from({ length: lotCount }, (_, i) => ({
    id: `lot-${i}`,
    symbol: 'BTC',
    date: `2024-${String((i % 12) + 1).padStart(2, '0')}-01`,
    exchange: 'kraken',
    original_qty: toPreciseAmount(1),
    remaining_qty: toPreciseAmount(1),
    unit_cost: toPreciseAmount('30000.00'),
    total_cost: toPreciseAmount('30000.00'),
    status: 'OPEN' as const,
    quality_flag: null,
    custody: [],
  }));

  return { lots, history: {}, relocations: {} };
}

// Large enough that the budget gate never trips here — this file tests pagination in isolation.
const CONFIG = { lotsPageSize: 20, maxChars: 20000 };

describe('token_lots tool', () => {
  it('paginates the full lot list beyond the first page, with page/pageSize/totalPages/totalCount', () => {
    const response = buildResponse(45);

    const result = buildTokenLotsToolResult(response, 0, CONFIG);

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') throw new Error('expected ok');
    expect(result.payload.totalCount).toBe(45);
    expect(result.payload.pageSize).toBe(20);
    expect(result.payload.totalPages).toBe(3);
    expect(result.payload.lots).toHaveLength(20);
    expect(() => tokenLotsToolOutputSchema.parse(result)).not.toThrow();
  });

  it('a later page returns lots beyond the first page', () => {
    const response = buildResponse(45);

    const page0 = buildTokenLotsToolResult(response, 0, CONFIG);
    const page2 = buildTokenLotsToolResult(response, 2, CONFIG);

    if (page0.kind !== 'ok' || page2.kind !== 'ok') throw new Error('expected ok');
    expect(page2.payload.lots).toHaveLength(5);
    expect(page2.payload.lots[0]?.id).not.toBe(page0.payload.lots[0]?.id);
  });

  it('inputSchema requires symbol, defaults page to 0', () => {
    expect(() => tokenLotsToolInputSchema.parse({})).toThrow();
    const parsed = tokenLotsToolInputSchema.parse({ symbol: 'BTC' });
    expect(parsed.page).toBe(0);
    expect(() => tokenLotsToolInputSchema.parse({ symbol: 'BTC', page: 1 })).not.toThrow();
  });

  describe('page size follows the execution profile the run resolved', () => {
    const local = [{ providerId: 'ollama' as const, modelId: 'llama', contextWindow: 8192 }];
    const metered = [{ providerId: 'openai' as const, modelId: 'gpt', apiKey: 'sk-x' }];

    it.each([
      ['a metered chain', metered, 20, 7],
      ['a mixed chain', [...local, ...metered], 20, 7],
      ['a local chain', local, 100, 2],
    ])('%s pages 130 lots at its profile lot size', (_label, chain, expectedPageSize, expectedPages) => {
      const config = { maxChars: 1_000_000, lotsPageSize: resolveExecutionProfile(chain).settings.lotsPageSize };

      const result = buildTokenLotsToolResult(buildResponse(130), 0, config);

      if (result.kind !== 'ok') throw new Error('expected ok');
      expect(result.payload.pageSize).toBe(expectedPageSize);
      expect(result.payload.lots).toHaveLength(expectedPageSize);
      expect(result.payload.totalPages).toBe(expectedPages);
    });
  });
});
