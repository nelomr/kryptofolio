## ADDED Requirements

### Requirement: Live Data Fetching via Pinia Colada
The Vue 3 application SHALL fetch portfolio data (holdings, PnL, risk metrics) using `@pinia/colada` queries (`useQuery`), discarding all mock static data in `usePortfolioData.ts` and `useTaxQueries.ts`. The `user_settings.base_currency` (already persisted in the backend) is the single source of truth for currency display — the frontend reads it via the existing `useSettingsQueries.ts` composable and does NOT manage currency conversion itself.

#### Scenario: Fetching Portfolio Summary
- **WHEN** `usePortfolioData().summary` is accessed in a component
- **THEN** it executes `GET /summary` via the REST API, caches the server-state using Pinia Colada with `staleTime: Infinity`
- **AND** the response payload MUST include an explicit `currency` field matching the user's `base_currency`

---

### Requirement: Zod 18-Decimal Validation and Currency Fields
The application SHALL validate all incoming analytical payloads using strictly typed Zod DTO schemas. Monetary values MUST remain as exact strings. The `currency` field MUST be present in all holding and valuation DTOs.

#### Scenario: Backend returns large floating number
- **WHEN** the backend payload contains `totalCostFiat: "0.300000000000000004"` as a string
- **THEN** the Zod schema MUST pass validation without coercing it to a lossy JavaScript `number`

#### Scenario: Currency field missing
- **WHEN** the backend response omits the `currency` field from a `HoldingsSnapshot`
- **THEN** the Zod schema MUST fail validation and emit a controlled error to the `errorBus`
- **AND** the component MUST display an error state, not render with undefined currency

---

### Requirement: Event-Driven Cache Invalidation
The application SHALL use Pinia Colada with `staleTime: Infinity` for historical time-series and risk metrics, invalidating ONLY on new transaction or daily OHLCV update events.

#### Scenario: Viewing the Drawdown Chart
- **WHEN** a user navigates to the Portfolio summary
- **THEN** the frontend fetches the DuckDB-generated risk metrics once and caches them without polling

#### Scenario: Adding a new transaction
- **WHEN** the user successfully records a new trade
- **THEN** the frontend MUST call `queryCache.invalidateQueries({ key: ['portfolio', 'summary'] })` AND `queryCache.invalidateQueries({ key: ['portfolio', 'risk_metrics'] })` to force DuckDB recalculation

#### Scenario: User changes base_currency setting
- **WHEN** the user updates `base_currency` from 'USD' to 'EUR' via the Settings page
- **THEN** the `useSettingsMutations.ts` mutation (which already invalidates `['settings', 'base_currency']`) MUST ALSO invalidate `['portfolio', 'summary']` and `['portfolio', 'risk_metrics']` so all displayed values refresh in the new currency
