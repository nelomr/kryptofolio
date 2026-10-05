import { describe, it, expect, vi } from 'vitest';
import { RequestContext } from '@mastra/core/request-context';
import { noopObserve } from '@mastra/core/tools';
import {
  taxYearComparisonTool,
  taxYearComparisonToolInputSchema,
  taxYearComparisonToolOutputSchema,
} from '../taxYearComparisonTool.js';
import type {
  GetSpanishTaxReportRequest,
  SpanishTaxReportResponse,
} from '../../../../application/use-cases/GetSpanishTaxReportUseCase.js';

function report(year: number, overrides: Partial<SpanishTaxReportResponse> = {}): SpanishTaxReportResponse {
  return {
    year,
    method: 'FIFO',
    currency: 'EUR',
    conversion: { kind: 'NATIVE' },
    unconvertibleEvents: [],
    spotCapitalGains: '0',
    savingsBaseYields: '0',
    generalBaseAirdrops: '0',
    summary: {
      capital_gains: year === 2024 ? '100' : '300',
      capital_losses: '0',
      savings_base_yields: '0',
      general_base_airdrops: '0',
      net_patrimonial_result: year === 2024 ? '100' : '300',
      estimated_irpf: year === 2024 ? '19' : '57',
    },
    excludedFlaggedEvents: 0,
    excludedUnresolvedIncomeCount: 0,
    manuallyAssignedCount: 0,
    audit_trail: [
      {
        id: 'evt-1',
        disposal_date: `${year}-03-01`,
        amount_from_lot: '1',
        sale_price: null,
        gain_loss: null,
        sale_fee: null,
        is_taxable: true,
        operation_type: 'SELL',
      },
    ],
    ...overrides,
  };
}

function build(overrides: Partial<Record<number, Partial<SpanishTaxReportResponse>>> = {}) {
  const useCase = {
    execute: vi.fn(async (request: GetSpanishTaxReportRequest) => report(request.year, overrides[request.year])),
  };
  return { useCase, tool: taxYearComparisonTool(useCase, { maxChars: 4000 }) };
}

async function run(tool: ReturnType<typeof build>['tool'], input: unknown) {
  if (!tool.execute) throw new Error('expected tool.execute');
  return tool.execute(input as never, {
    requestContext: new RequestContext(),
    observe: noopObserve,
  });
}

describe('tax_year_comparison tool', () => {
  it('reads both years in EUR across all accounts and returns deltas computed in code', async () => {
    const { tool, useCase } = build();

    const result = taxYearComparisonToolOutputSchema.parse(await run(tool, { yearA: 2024, yearB: 2025 }));

    expect(useCase.execute).toHaveBeenCalledTimes(2);
    expect(useCase.execute).toHaveBeenCalledWith({ year: 2024, method: undefined, targetCurrency: 'EUR' });
    expect(useCase.execute).toHaveBeenCalledWith({ year: 2025, method: undefined, targetCurrency: 'EUR' });
    if (result.kind !== 'ok') throw new Error('expected ok');
    expect(result.payload.deltas.capital_gains).toEqual({ kind: 'delta', value: '200' });
    expect(result.payload.deltas.estimated_irpf).toEqual({ kind: 'delta', value: '38' });
    expect(result.payload.yearA.year).toBe(2024);
    expect(result.payload.yearB.completeness).toEqual({ kind: 'complete' });
  });

  it('forwards an optional method to both reads', async () => {
    const { tool, useCase } = build();

    await run(tool, { yearA: 2024, yearB: 2025, method: 'LIFO' });

    expect(useCase.execute).toHaveBeenCalledWith(expect.objectContaining({ year: 2024, method: 'LIFO' }));
    expect(useCase.execute).toHaveBeenCalledWith(expect.objectContaining({ year: 2025, method: 'LIFO' }));
  });

  it('marks every delta incomparable and names the reason when a year leaves events out', async () => {
    const { tool } = build({ 2025: { excludedFlaggedEvents: 2 } });

    const result = taxYearComparisonToolOutputSchema.parse(await run(tool, { yearA: 2024, yearB: 2025 }));

    if (result.kind !== 'ok') throw new Error('expected ok');
    expect(result.payload.yearB.completeness).toEqual({ kind: 'incomplete', reasons: ['excluded_flagged_events'] });
    expect(result.payload.yearB.excludedFlaggedEvents).toBe(2);
    expect(Object.values(result.payload.deltas).every((d) => d.kind === 'delta_incomparable')).toBe(true);
    expect(Object.values(result.payload.deltas).some((d) => 'comparability' in d)).toBe(false);
  });

  it('counts unconvertible events instead of listing them', async () => {
    const { tool } = build({
      2024: { unconvertibleEvents: [{ id: 'e', occurredOn: '2024-01-01', nativeAmount: '1', nativeCurrency: 'USD' }] },
    });

    const result = taxYearComparisonToolOutputSchema.parse(await run(tool, { yearA: 2024, yearB: 2025 }));

    if (result.kind !== 'ok') throw new Error('expected ok');
    expect(result.payload.yearA.unconvertibleCount).toBe(1);
  });

  it('returns no audit trail', async () => {
    const { tool } = build();

    const result = await run(tool, { yearA: 2024, yearB: 2025 });

    expect(JSON.stringify(result)).not.toContain('audit');
    expect(JSON.stringify(result)).not.toContain('evt-1');
  });

  it('truncates through the budget gate', async () => {
    const useCase = { execute: vi.fn(async (request: GetSpanishTaxReportRequest) => report(request.year)) };
    const tool = taxYearComparisonTool(useCase, { maxChars: 20 });

    expect(await run(tool, { yearA: 2024, yearB: 2025 })).toMatchObject({ kind: 'truncated', maxChars: 20 });
  });

  describe('input', () => {
    const INVALID: Array<[string, Record<string, unknown>]> = [
      ['equal years', { yearA: 2024, yearB: 2024 }],
      ['a year before 2009', { yearA: 2008, yearB: 2024 }],
      ['a year before 2009 on the other side', { yearA: 2024, yearB: 2008 }],
      ['a non-integer year', { yearA: 2024.5, yearB: 2025 }],
      ['an account id', { yearA: 2024, yearB: 2025, accountId: 'x' }],
      ['a currency', { yearA: 2024, yearB: 2025, currency: 'USD' }],
    ];

    it.each(INVALID)('rejects %s', (_label, input) => {
      expect(taxYearComparisonToolInputSchema.safeParse(input).success).toBe(false);
    });

    it('accepts the 2009 boundary', () => {
      expect(taxYearComparisonToolInputSchema.safeParse({ yearA: 2009, yearB: 2010 }).success).toBe(true);
    });

    it('does not invoke the report use case for an invalid call', async () => {
      const { tool, useCase } = build();

      await run(tool, { yearA: 2024, yearB: 2024 });

      expect(useCase.execute).not.toHaveBeenCalled();
    });
  });
});
