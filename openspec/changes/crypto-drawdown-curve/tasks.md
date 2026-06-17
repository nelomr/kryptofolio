## 1. Domain and Infrastructure Updates

- [x] 1.1 Update `ICryptoMetricsPort.ts` to include `DrawdownPoint` interface and `getDrawdownCurve` method.
- [x] 1.2 Add `DrawdownPointSchema` to Zod DTO schemas (e.g., in a new `DrawdownMetricsSchema.ts` or inside the adapter).
- [x] 1.3 Implement `getDrawdownCurve` in `RestCryptoMetricsAdapter.ts` to fetch and parse the data.

## 2. State Management

- [x] 2.1 Add `useDrawdownCurveQuery` composable in `useCryptoMetricsQueries.ts` to fetch drawdown data using `pinia-colada`.

## 3. UI Implementation

- [x] 3.1 Verify and if necessary, adapt `TimeAreaChart.vue` to support custom baseline and color gradients for negative values.
- [x] 3.2 Create `DrawdownCurve.vue` in `src/views/Portfolio/components/metrics/`.
- [x] 3.3 Connect `DrawdownCurve.vue` to `useDrawdownCurveQuery` and implement the layout with `Card`, `CardHeader`, `CardTitle`, and `CardContent`.
- [x] 3.4 Integrate `DrawdownCurve.vue` into the main Portfolio `Metrics` tab layout next to or below the Volatility Heatmap.

## 4. Time Range Expansion & Consistency Refinement

- [x] 4.1 Expand `TimeFilter.vue` options and types to include `5Y` range.
- [x] 4.2 Map `5Y` range to its respective days in `RestCryptoMetricsAdapter.ts`.
- [x] 4.3 Replace `moment.js` with `luxon.js` in the API gateway for all mock date calculations.
- [x] 4.4 Refactor `/api/metrics/drawdown` to call `generateDrawdownCurve(days)` helper instead of inline random values.
- [x] 4.5 Synchronize performance history and drawdown mock endpoints by querying slices of a shared 10-year master history.
- [x] 4.6 Remove `10Y` option (since it is redundant with `ALL`).

