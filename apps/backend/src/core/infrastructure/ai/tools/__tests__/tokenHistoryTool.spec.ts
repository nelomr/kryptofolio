import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import {
  buildTokenHistoryToolResult,
  tokenHistoryToolOutputSchema,
  tokenHistoryToolInputSchema,
} from '../tokenHistoryTool.js';
import type {
  GetTokenHistoryResponse,
  TokenLotHistoryEventDto,
} from '../../../../application/use-cases/GetTokenHistoryUseCase.js';
import { toPreciseAmount } from '../../../../domain/value-objects/PreciseAmount.js';

const CONFIG = { lotsPageSize: 20, maxChars: 6000 };

function buildResponse(lotCount: number): GetTokenHistoryResponse {
  const lots = Array.from({ length: lotCount }, (_, i) => ({
    id: `lot-${i}`,
    symbol: 'BTC',
    date: `2025-01-${String((i % 28) + 1).padStart(2, '0')}`,
    exchange: 'kraken',
    original_qty: toPreciseAmount(i + 1),
    remaining_qty: toPreciseAmount(i + 1),
    unit_cost: toPreciseAmount('50000.00'),
    total_cost: toPreciseAmount((i + 1) * 50000),
    status: 'OPEN' as const,
    quality_flag: null,
    custody: [],
  }));

  const history: GetTokenHistoryResponse['history'] = {};
  const relocations: GetTokenHistoryResponse['relocations'] = {};
  for (let i = 0; i < lotCount; i++) {
    const event: TokenLotHistoryEventDto = {
      id: `evt-${i}`,
      disposal_date: `2025-02-${String((i % 28) + 1).padStart(2, '0')}`,
      amount_from_lot: toPreciseAmount(1),
      sale_price: null,
      gain_loss: null,
      is_taxable: true,
      operation_type: 'SELL',
    };
    history[`lot-${i}`] = [event];
    relocations[`lot-${i}`] = [];
  }

  return { lots, history, relocations };
}

describe('token_history tool', () => {
  it('caps at the top 20 lots and counts history/relocation events without exposing them', () => {
    const response = buildResponse(25);

    const result = buildTokenHistoryToolResult(response, CONFIG);

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') throw new Error('expected ok');
    expect(result.payload.lots.length).toBeLessThanOrEqual(20);
    expect(result.payload.omittedCount).toBe(5);
    for (const lot of result.payload.lots) {
      expect(typeof lot.historyCount).toBe('number');
      expect(typeof lot.relocationCount).toBe('number');
      expect(JSON.stringify(lot)).not.toContain('evt-');
    }

    expect(() => tokenHistoryToolOutputSchema.parse(result)).not.toThrow();
  });

  it('rejects a symbol that fails the model-facing regex before the use case would ever run', () => {
    const parsed = tokenHistoryToolInputSchema.safeParse({ symbol: 'not a valid symbol!' });

    expect(parsed.success).toBe(false);
  });

  it('never invokes the use case for an invalid symbol', async () => {
    const useCase = { execute: vi.fn() };
    const { tokenHistoryTool } = await import('../tokenHistoryTool.js');
    const tool = tokenHistoryTool(useCase, CONFIG);

    const parsed = tokenHistoryToolInputSchema.safeParse({ symbol: 'nope!' });
    expect(parsed.success).toBe(false);
    // The tool's own execute is never reached with an invalid symbol — Mastra validates
    // `inputSchema` before calling `execute`, so this only re-confirms the schema rejects it and
    // no manual invocation of `execute` happens in this test.
    expect(useCase.execute).not.toHaveBeenCalled();
    expect(tool.id).toBe('token_history');
  });

  it('keeps exactly the 20 most recent lots by acquisition date descending, dropping the oldest, not merely any 20', () => {
    // Distinct, strictly monotonic dates (no wraparound) — unlike `buildResponse`'s `(i % 28) + 1`
    // cycling dates, this makes "which 20 survive" a genuine, non-coincidental assertion.
    const lots = Array.from({ length: 25 }, (_, i) => ({
      id: `lot-${i}`,
      symbol: 'BTC',
      date: `2025-${String(Math.floor(i / 28) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`,
      exchange: 'kraken',
      original_qty: toPreciseAmount(1),
      remaining_qty: toPreciseAmount(1),
      unit_cost: toPreciseAmount('50000.00'),
      total_cost: toPreciseAmount(50000),
      status: 'OPEN' as const,
      quality_flag: null,
      custody: [],
    }));
    const response: GetTokenHistoryResponse = { lots, history: {}, relocations: {} };

    const result = buildTokenHistoryToolResult(response, CONFIG);

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') throw new Error('expected ok');
    expect(result.payload.lots).toHaveLength(20);
    expect(result.payload.omittedCount).toBe(5);
    // Lots 5..24 are the 20 most recent (strictly increasing dates by index); 0..4 are the oldest
    // and must be dropped.
    const keptIds = result.payload.lots.map((lot) => lot.id);
    expect(keptIds).toEqual(
      Array.from({ length: 20 }, (_, i) => `lot-${24 - i}`), // most recent first (24 down to 5)
    );
    expect(keptIds).not.toContain('lot-0');
    expect(keptIds).not.toContain('lot-4');
    for (let i = 0; i < result.payload.lots.length - 1; i++) {
      expect(result.payload.lots[i]!.date >= result.payload.lots[i + 1]!.date).toBe(true);
    }
  });

  it('truncates via enforceBudget when the projected payload exceeds maxChars', () => {
    const response = buildResponse(25);

    const result = buildTokenHistoryToolResult(response, { lotsPageSize: 20, maxChars: 10 });

    expect(result.kind).toBe('truncated');
    expect(() => tokenHistoryToolOutputSchema.parse(result)).not.toThrow();
  });

  it('rejects an outputSchema payload carrying a field not declared in the schema', () => {
    const response = buildResponse(3);
    const result = buildTokenHistoryToolResult(response, CONFIG);
    if (result.kind !== 'ok') throw new Error('expected ok');

    const withExtraField = { ...result, payload: { ...result.payload, unexpectedField: 'nope' } };

    expect(() => tokenHistoryToolOutputSchema.parse(withExtraField)).toThrow();
  });
});
