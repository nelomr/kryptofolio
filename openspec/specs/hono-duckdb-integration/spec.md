# hono-duckdb-integration Specification

## Purpose
TBD - created by archiving change phase-2b-time-series. Update Purpose after archive.
## Requirements
### Requirement: Expose Analytics and Tax Reports via Hono
The system SHALL register both `DuckDbPortfolioAnalyticsAdapter` and `DuckDbTaxCalculatorAdapter` in the DI container, and wire them to Hono routes. All routes MUST read `base_currency` from `user_settings` and pass it as a `targetCurrency` parameter to the Use Case / Adapter. The adapters do NOT read settings directly (Hexagonal isolation).

#### Scenario: Requesting Tax Report 2023
- **WHEN** a client hits `GET /report/2023`
- **THEN** the Hono router delegates to `DuckDbTaxCalculatorAdapter`, which queries `ledger.lot_history_events` directly (NOT the heavy computed view `v_calculated_lot_history_events`)
- **AND** returns the valid 18-decimal precision PnL report for 2023 in the user's `base_currency`

#### Scenario: Currency respected in summary endpoint
- **WHEN** the user's `base_currency = 'EUR'` and `GET /summary` is called
- **THEN** the Hono handler reads `base_currency` from `user_settings`, passes it as `targetCurrency` to `GetPortfolioSummaryUseCase`
- **AND** the returned `HoldingsSnapshot[]` objects MUST have `currency: 'EUR'` and EUR-denominated values

---

### Requirement: Expose Risk Metrics via Hono (metrics.ts refactor)
The system SHALL create an `IMetricsPort` interface and `DuckDbMetricsAdapter` implementation to serve all risk-related data (KPIs, Performance History, Asset Allocation, Drawdown Curve, Volatility Heatmap, Risk Metrics). The `metrics.ts` route MUST be refactored to a factory pattern `createMetricsApi(container: DIContainer)` and connect each endpoint to `container.metricsPort`. It MUST read `base_currency` from `user_settings`.

#### Scenario: Requesting Drawdown Curve
- **WHEN** a client hits `GET /metrics/drawdown`
- **THEN** the endpoint delegates to `container.metricsPort.getDrawdownCurve()` passing the appropriate `targetCurrency`
- **AND** returns a valid array of `DrawdownPoint` objects

#### Scenario: Requesting Volatility Heatmap
- **WHEN** a client hits `GET /metrics/heatmap`
- **THEN** the endpoint queries `container.metricsPort.getVolatilityHeatmap()`
- **AND** the mock data generators in `metrics.ts` MUST be entirely removed

---

### Requirement: Portfolio Route Factory Pattern
The `portfolio.ts` route file SHALL be refactored from static mock responses to a factory function `createPortfolioApi(container: DIContainer)` that receives the DI container, matching the existing pattern in `ingestion.ts`. All imports and usage of `mockPortfolio.js` SHALL be removed.

#### Scenario: Route receives DI container
- **WHEN** the portfolio API is mounted in `app.ts`
- **THEN** it MUST be created via `createPortfolioApi(container)`, receiving access to `portfolioAnalyticsPort`, `taxCalculatorPort`, and `userSettingsPort`

---

### Requirement: Expose Derivatives PnL
The system SHALL expose `GET /derivatives/pnl` connected to the `v_futures_realized_pnl` DuckDB view. The response MUST include an explicit `currency` field.

#### Scenario: Requesting Futures PnL
- **WHEN** a client hits `GET /derivatives/pnl`
- **THEN** the endpoint returns aggregated realized PnL and funding fees per derivative contract as calculated by the refactored (EUR-hardcode-free) DuckDB view
- **AND** each result object includes `currency` matching the user's `base_currency`

---

### Requirement: No SQL Injection via String Interpolation
All Hono route handlers and DuckDB adapters SHALL use parameterized queries or explicit input validation (Zod) for all user-supplied values. String interpolation of `accountId`, `year`, or any user input directly into SQL strings is STRICTLY FORBIDDEN.

#### Scenario: Malicious accountId input
- **WHEN** a request arrives with `accountId = "'; DROP TABLE tax_lots; --"`
- **THEN** the Zod schema MUST reject the input before it reaches any SQL adapter
- **AND** no SQL must be executed with the unvalidated string

---

### Requirement: DI Container Registration
The DI container (`container.ts`) SHALL expose `portfolioAnalyticsPort: IPortfolioAnalyticsPort`, `taxCalculatorPort: ITaxCalculatorPort`, and `metricsPort: IMetricsPort` as public readonly fields. These MUST be initialized via the `setDuckDbAdapter()` late-init pattern already established for `DuckDbParquetPriceAdapter`. The `app.ts` MUST be updated to pass `container` to all refactored route factory functions (`createPortfolioApi`, `createMetricsApi`, `createTaxApi`).

#### Scenario: DuckDB adapter initialized after startup
- **WHEN** `container.setDuckDbAdapter(duckDb)` is called in `index.ts`
- **THEN** both `portfolioAnalyticsPort` and `taxCalculatorPort` MUST have their internal DuckDB reference updated
- **AND** subsequent route calls MUST use the initialized adapters

