import { describe, it, expect } from 'vitest';
import {
  buildSpanishTaxReportToolResult,
  spanishTaxReportToolInputSchema,
  spanishTaxReportToolOutputSchema,
} from '../spanishTaxReportTool.js';
import type { SpanishTaxReportResponse } from '../../../../application/use-cases/GetSpanishTaxReportUseCase.js';

/** More than 20 disposal events, dated across the year, so top-20-by-date-descending is meaningful. */
function buildReport(): SpanishTaxReportResponse {
  const audit_trail = Array.from({ length: 30 }, (_, i) => ({
    id: `evt-${i}`,
    disposal_date: `2024-${String((i % 12) + 1).padStart(2, '0')}-01`,
    amount_from_lot: '1.0',
    sale_price: { kind: 'NATIVE' as const, amount: '100.00', currency: 'EUR' as const },
    gain_loss: { kind: 'NATIVE' as const, amount: '10.00', currency: 'EUR' as const },
    sale_fee: null,
    is_taxable: true,
    operation_type: 'SELL' as const,
    asset_symbol: `SYM${i}`,
  }));

  return {
    year: 2024,
    method: 'FIFO',
    currency: 'EUR',
    conversion: { kind: 'NATIVE' },
    unconvertibleEvents: [],
    spotCapitalGains: '300.00',
    savingsBaseYields: '0',
    generalBaseAirdrops: '0',
    summary: {
      capital_gains: '300.00',
      capital_losses: '0',
      savings_base_yields: '0',
      general_base_airdrops: '0',
      net_patrimonial_result: '300.00',
      estimated_irpf: '57.00',
    },
    excludedFlaggedEvents: 0,
    excludedUnresolvedIncomeCount: 0,
    manuallyAssignedCount: 0,
    audit_trail,
  } as SpanishTaxReportResponse;
}

// Large enough that the budget gate never trips here — this file tests audit-trail capping in isolation.
const CONFIG = { maxChars: 20000 };

describe('spanish_tax_report tool', () => {
  it('caps audit_trail at the top 20 rows by disposal_date descending, with a correct omittedCount', () => {
    const report = buildReport();
    const result = buildSpanishTaxReportToolResult(report, CONFIG);

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') throw new Error('expected ok');
    expect(result.payload.auditTrail).toHaveLength(20);
    expect(result.payload.omittedCount).toBe(10);
    const dates = result.payload.auditTrail.map((row) => row.disposalDate);
    expect(dates.every((date, i) => i === 0 || dates[i - 1] >= date)).toBe(true);
    expect(new Set(dates).size).toBeGreaterThan(1);
    expect(() => spanishTaxReportToolOutputSchema.parse(result)).not.toThrow();
  });

  it('carries the headline summary, exclusion counts, and unconvertibleEvents count', () => {
    const report = buildReport();
    const result = buildSpanishTaxReportToolResult(report, CONFIG);

    if (result.kind !== 'ok') throw new Error('expected ok');
    expect(result.payload.summary).toEqual(report.summary);
    expect(result.payload.unconvertibleEventsCount).toBe(0);
    expect(result.payload.excludedFlaggedEvents).toBe(0);
  });

  it('inputSchema requires year and accepts optional method', () => {
    expect(() => spanishTaxReportToolInputSchema.parse({})).toThrow();
    expect(() => spanishTaxReportToolInputSchema.parse({ year: 2024 })).not.toThrow();
    expect(() => spanishTaxReportToolInputSchema.parse({ year: 2024, method: 'FIFO' })).not.toThrow();
  });
});
