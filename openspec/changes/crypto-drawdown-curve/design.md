## Context

The portfolio metrics dashboard currently shows ROI and daily volatility but lacks a view of historical drawdowns. A drawdown curve visualizes the peak-to-trough decline of the portfolio, which is essential for risk analysis.

## Goals / Non-Goals

**Goals:**
- Provide a clear visualization of historical drawdowns using `lightweight-charts`.
- Extend the domain port `ICryptoMetricsPort` to support fetching drawdown data.
- Ensure the UI component conforms to the Kryptofolio design system (baseline 0%, loss colors, linear gradient).

**Non-Goals:**
- Real-time streaming of drawdown data.
- Complex filtering beyond the standard `TimeRange` values.

## Decisions

- **Domain Port Extension**: Add `getDrawdownCurve(range: TimeRange): Promise<DrawdownPoint[]>` to `ICryptoMetricsPort`. This strictly adheres to the Hexagonal Architecture by keeping the domain isolated.
- **DTO schemas**: Introduce `DrawdownPointSchema` to safely parse raw API data into `DrawdownPoint` entities, ensuring the `drawdownPercent` is bounded `max(0)`.
- **UI Component Reuse**: The new `DrawdownCurve.vue` will reuse the existing `TimeAreaChart.vue` logic. We will invert the color scheme to use `--loss` and `--loss-medium` and fix the baseline to 0.

## Risks / Trade-offs

- **Risk**: `TimeAreaChart.vue` might not natively support a fixed baseline at 0% and negative-only areas.
- **Mitigation**: We may need to adapt `TimeAreaChart.vue` or its underlying composable (`usePerformanceChart.ts`) to accept a baseline configuration and custom gradients.
