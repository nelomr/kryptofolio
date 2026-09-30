## Why

`DuckDbMetricsAdapter.getPerformanceHistory(days, _targetCurrency)` ignores its currency parameter and returns the canonical EUR series from `v_portfolio_daily_valuation`, so the performance chart and the AI advisor's `performance_history` tool show EUR values while the rest of the portfolio honours the user's display currency. The correct conversion already exists next to it (`VALUATION_CONVERTED`, used by `getKpis`), so the series is the remaining outlier.

## What Changes

- `getPerformanceHistory` converts each daily point at its own date through the existing `VALUATION_CONVERTED` pattern (ASOF join on `v_fx_daily`, currency bound as a parameter per call), instead of reading the EUR view directly.
- A point with no FX rate for its date stays unconverted and is reported as such, never guessed or silently shown as EUR.
- `PerformanceHistoryPoint` models the unconvertible state explicitly (discriminated union) instead of a non-null `portfolioValue` string.
- The AI advisor's `performance_history` tool reads the base currency from request context, like `kpis`, and the fixed `PERFORMANCE_HISTORY_CURRENCY = 'EUR'` limitation is removed.
- Out of scope: `drawdown_curve` and `volatility_heatmap` (percentages/statistics, not money), FIFO views, the materializer, and custody.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `crypto-performance-history`: performance points are expressed in the requested display currency, converted at each point's own date, with an explicit unconvertible state.
- `display-currency-conversion`: the aggregated valuation series requirement extends to the performance-history read path (same rate-date rule, same unconvertible outcome).

## Impact

- **Backend**: `DuckDbMetricsAdapter.ts`, `IMetricsPort.ts`, `GetPerformanceHistoryUseCase.ts`, `routes/metrics.ts`, `ai/tools/performanceHistoryTool.ts`, `di/advisorComposition.ts`.
- **Frontend**: `ICryptoMetricsPort.ts`, `RestCryptoMetricsAdapter.ts` and its DTO, `useCryptoMetricsQueries.ts`, and the Portfolio performance chart, which must render unconvertible points.
- **Docs**: `docs/ai-advisor.md` limitation text; `docs/database-architecture.md` section 5.5 stays authoritative and is not changed in substance.
- **User-visible**: the performance chart and advisor answers show values in the chosen display currency instead of EUR; days without an FX rate appear as gaps or marked points.
- **Rules**: rule 4 (money stays `PreciseAmount`, no floats); rule 5 (unconvertible point as a union, not a flag); rule 6 (no FIFO or custody change); rule 8 (display currency remains a bound parameter supplied by the use case, never DuckDB-side settings state, per database-architecture section 5.5).
- **Dependency**: `add-ai-portfolio-advisor` (in flight) owns design D16 and the `ai-advisor-agent` spec that document the EUR limitation. This change does not edit that change's files. Its limitation text is updated there, or after it is archived.

## Open questions

1. **Other consumers and double conversion.** Verified consumers: `routes/metrics.ts`, `di/container.ts`, `advisorComposition.ts`, and on the frontend `RestCryptoMetricsAdapter.ts` / `useCryptoMetricsQueries.ts`. Not yet verified: whether the frontend chart converts values itself today. If it does, that conversion must be removed.
2. **`drawdownPct`.** It comes from `v_portfolio_ath_drawdown`, which is computed on the EUR series, so in another currency it differs from the converted values. `kpis` and `risk_metrics` have the same pre-existing issue. Proposed: out of scope, and stated explicitly in the spec.
3. **Unconvertible point shape.** `PerformanceHistoryPoint.portfolioValue` is a non-null string today. The exact union shape and how it crosses the RPC boundary still need to be settled in design (candidate: `kind: 'converted' | 'unconvertible'`).
