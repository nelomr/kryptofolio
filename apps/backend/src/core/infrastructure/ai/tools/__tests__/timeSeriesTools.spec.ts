import { describe, it, expect } from 'vitest';
import {
  buildDrawdownCurveToolResult,
  drawdownCurveToolInputSchema,
  drawdownCurveToolOutputSchema,
} from '../drawdownCurveTool.js';
import {
  buildPerformanceHistoryToolResult,
  performanceHistoryToolInputSchema,
  performanceHistoryToolOutputSchema,
} from '../performanceHistoryTool.js';
import {
  buildVolatilityHeatmapToolResult,
  volatilityHeatmapToolInputSchema,
  volatilityHeatmapToolOutputSchema,
} from '../volatilityHeatmapTool.js';
import type { DrawdownPoint, PerformanceHistoryPoint, VolatilityHeatmapCell } from '../../../../domain/ports/IMetricsPort.js';

/** A synthetic full year — no single real ledger is guaranteed to span one, so this covers the worst-case shape instead. */
function buildYear(): { drawdown: DrawdownPoint[]; performance: PerformanceHistoryPoint[]; heatmap: VolatilityHeatmapCell[] } {
  const drawdown: DrawdownPoint[] = [];
  const performance: PerformanceHistoryPoint[] = [];
  const heatmap: VolatilityHeatmapCell[] = [];
  for (let i = 0; i < 365; i++) {
    const date = new Date(2024, 0, i + 1).toISOString().slice(0, 10);
    drawdown.push({ date, drawdownPct: `${i % 10}.0` });
    performance.push({ date, portfolioValue: `${1000 + i}.00`, drawdownPct: `${i % 10}.0` });
    heatmap.push({ date, volatility: `${i % 5}.0` });
  }
  return { drawdown, performance, heatmap };
}

// Large enough that the budget gate never trips here — this file tests downsample capping in
// isolation, not the per-tool character budget (which is exercised separately in toolBudgets.spec.ts).
const CONFIG = { maxChars: 20000 };

describe('drawdown_curve, performance_history, volatility_heatmap tools', () => {
  it('drawdown_curve downsamples a 365-point series to at most 120 points with a correct omittedCount', () => {
    const { drawdown } = buildYear();
    const result = buildDrawdownCurveToolResult(drawdown, CONFIG);

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') throw new Error('expected ok');
    expect(result.payload.points.length).toBeLessThanOrEqual(120);
    expect(result.payload.omittedCount).toBe(365 - result.payload.points.length);
    expect(() => drawdownCurveToolOutputSchema.parse(result)).not.toThrow();
  });

  it('performance_history downsamples a 365-point series to at most 120 points with a correct omittedCount', () => {
    const { performance } = buildYear();
    const result = buildPerformanceHistoryToolResult(performance, CONFIG);

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') throw new Error('expected ok');
    expect(result.payload.points.length).toBeLessThanOrEqual(120);
    expect(result.payload.omittedCount).toBe(365 - result.payload.points.length);
    expect(() => performanceHistoryToolOutputSchema.parse(result)).not.toThrow();
  });

  it('volatility_heatmap downsamples a 365-cell series to at most 120 cells with a correct omittedCount', () => {
    const { heatmap } = buildYear();
    const result = buildVolatilityHeatmapToolResult(heatmap, CONFIG);

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') throw new Error('expected ok');
    expect(result.payload.cells.length).toBeLessThanOrEqual(120);
    expect(result.payload.omittedCount).toBe(365 - result.payload.cells.length);
    expect(() => volatilityHeatmapToolOutputSchema.parse(result)).not.toThrow();
  });

  it('drawdown_curve/performance_history inputSchema accepts optional days, no accountId', () => {
    expect(() => drawdownCurveToolInputSchema.parse({ days: 90 })).not.toThrow();
    expect(() => drawdownCurveToolInputSchema.parse({ accountId: 'acc-1' })).toThrow();
    expect(() => performanceHistoryToolInputSchema.parse({ days: 90 })).not.toThrow();
    expect(() => performanceHistoryToolInputSchema.parse({ accountId: 'acc-1' })).toThrow();
  });

  it('volatility_heatmap inputSchema accepts optional year, no accountId', () => {
    expect(() => volatilityHeatmapToolInputSchema.parse({ year: 2024 })).not.toThrow();
    expect(() => volatilityHeatmapToolInputSchema.parse({ accountId: 'acc-1' })).toThrow();
  });
});

describe('the currency each time-series tool declares', () => {
  it('performance_history states that its portfolio values are in EUR, the currency the analytics view aggregates in', () => {
    const { performance } = buildYear();
    const result = buildPerformanceHistoryToolResult(performance, CONFIG);

    if (result.kind !== 'ok') throw new Error('expected ok');
    expect(result.payload.currency).toBe('EUR');
    expect(() => performanceHistoryToolOutputSchema.parse(result)).not.toThrow();
  });

  it('performance_history rejects a payload with no declared currency', () => {
    const { performance } = buildYear();
    const result = buildPerformanceHistoryToolResult(performance, CONFIG);
    if (result.kind !== 'ok') throw new Error('expected ok');
    const { currency: _currency, ...withoutCurrency } = result.payload;

    expect(performanceHistoryToolOutputSchema.safeParse({ kind: 'ok', payload: withoutCurrency }).success).toBe(false);
  });
});
