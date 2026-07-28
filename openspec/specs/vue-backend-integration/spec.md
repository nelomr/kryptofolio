# vue-backend-integration Specification

## Purpose
TBD - created by archiving change phase-2b-time-series. Update Purpose after archive.
## Requirements
### Requirement: Live Data Fetching via Pinia Colada
The Vue 3 application SHALL fetch portfolio data (holdings, PnL, risk metrics) using `@pinia/colada` queries (`useQuery`), discarding all mock static data in `usePortfolioData.ts` and `useTaxQueries.ts`. The `user_settings.base_currency` (already persisted in the backend) is the single source of truth for currency display — the frontend reads it via the existing `useSettingsQueries.ts` composable and does NOT manage currency conversion itself.

#### Scenario: Fetching Portfolio Summary
- **WHEN** `usePortfolioData().summary` is accessed in a component
- **THEN** it executes `GET /summary` via the REST API, caches the server-state using Pinia Colada with `staleTime: Infinity`
- **AND** the response payload MUST include an explicit `currency` field matching the user's `base_currency`

---

### Requirement: Currency-Agnostic Frontend Domain Entities (Audit C1)
The frontend domain entities (`CryptoAssetEntity`, `PortfolioMetricsEntity`) SHALL use `*Fiat` suffix instead of `*Eur` for all monetary fields and include an explicit `currency: string` field. The Zod DTOs (`ExternalPortfolioSchemas.ts`, `MockDtoSchemas.ts`) SHALL be updated to match. All consuming components and tests MUST be updated.

#### Scenario: Backend returns USD-denominated values
- **WHEN** the user's `base_currency` is `'USD'` and the backend returns `{ avg_price_fiat: 62000, currency: 'USD' }`
- **THEN** `CryptoAssetEntity.avgPriceFiat` MUST be `62000` and `CryptoAssetEntity.currency` MUST be `'USD'`
- **AND** the field name MUST NOT contain `Eur`

### Requirement: Zod 18-Decimal Validation and Currency Fields
The application SHALL validate all incoming analytical payloads using strictly typed Zod DTO schemas. Monetary values MUST remain as exact strings. The `currency` field MUST be present in all holding, valuation, and derivatives DTOs.

#### Scenario: Backend returns large floating number
- **WHEN** the backend payload contains `totalCostFiat: "0.300000000000000004"` as a string
- **THEN** the Zod schema MUST pass validation without coercing it to a lossy JavaScript `number`

#### Scenario: Currency field missing from HoldingsSnapshot
- **WHEN** the backend response omits the `currency` field from a `HoldingsSnapshot`
- **THEN** the Zod schema MUST fail validation and emit a controlled error to the `errorBus`
- **AND** the component MUST display an error state, not render with undefined currency

#### Scenario: Currency field missing from DerivativesPnl
- **WHEN** the backend response omits the `currency` field from a `DerivativesPnl` object
- **THEN** the Zod schema MUST fail validation identically to the `HoldingsSnapshot` case

---

### Requirement: Event-Driven Cache Invalidation
The application SHALL use Pinia Colada with `staleTime: Infinity` for historical time-series and risk metrics, invalidating ONLY on new transaction, daily OHLCV update events, or `base_currency` setting changes.

#### Scenario: Viewing the Drawdown Chart
- **WHEN** a user navigates to the Portfolio summary
- **THEN** the frontend fetches the DuckDB-generated risk metrics once and caches them without polling

#### Scenario: Adding a new transaction
- **WHEN** the user successfully records a new trade
- **THEN** the frontend MUST invalidate ALL data-dependent query keys: `["portfolio-summary"]`, `["crypto-metrics-kpis"]`, `["crypto-performance-history"]`, `["crypto-asset-allocation"]`, `["crypto-volatility-heatmap"]`, `["crypto-risk-metrics"]`, `["crypto-drawdown-curve"]`

#### Scenario: User changes base_currency setting
- **WHEN** the user updates `base_currency` from 'USD' to 'EUR' via the Settings page
- **THEN** the `useSettingsMutations.ts` mutation (which already invalidates `['settings', 'base_currency']`) MUST ALSO invalidate ALL portfolio and metrics keys: `["portfolio-summary"]`, `["crypto-metrics-kpis"]`, `["crypto-performance-history"]`, `["crypto-asset-allocation"]`, `["crypto-volatility-heatmap"]`, `["crypto-risk-metrics"]`, `["crypto-drawdown-curve"]`
- **AND** the UI MUST re-render all monetary values with the correct currency symbol and amounts

