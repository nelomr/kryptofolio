## ADDED Requirements

### Requirement: Expose Analytics and Tax Reports via Hono
The system SHALL register both `DuckDbPortfolioAnalyticsAdapter` and `DuckDbTaxCalculatorAdapter` in the DI container, and wire them to Hono routes. All routes MUST read `base_currency` from `user_settings` and pass it as a parameter to the DuckDB queries for currency conversion.

#### Scenario: Requesting Tax Report 2023
- **WHEN** a client hits `GET /report/2023`
- **THEN** the Hono router delegates to `DuckDbTaxCalculatorAdapter`, which queries `ledger.lot_history_events` directly (NOT the heavy computed view `v_calculated_lot_history_events`)
- **AND** returns the valid 18-decimal precision PnL report for 2023 in the user's `base_currency`

#### Scenario: Currency respected in summary endpoint
- **WHEN** the user's `base_currency = 'EUR'` and `GET /summary` is called
- **THEN** the Hono handler reads `base_currency` from `user_settings`, passes it to `GetPortfolioSummaryUseCase`
- **AND** the returned `HoldingsSnapshot[]` objects MUST have `currency: 'EUR'` and EUR-denominated values

---

### Requirement: Expose Derivatives PnL
The system SHALL expose `GET /derivatives/pnl` connected to the `v_futures_realized_pnl` DuckDB view.

#### Scenario: Requesting Futures PnL
- **WHEN** a client hits `GET /derivatives/pnl`
- **THEN** the endpoint returns aggregated realized PnL and funding fees per derivative contract as calculated by the refactored (EUR-hardcode-free) DuckDB view

---

### Requirement: No SQL Injection via String Interpolation
All Hono route handlers and DuckDB adapters SHALL use parameterized queries or explicit input validation (Zod) for all user-supplied values. String interpolation of `accountId` or any user input directly into SQL strings is STRICTLY FORBIDDEN.

#### Scenario: Malicious accountId input
- **WHEN** a request arrives with `accountId = "'; DROP TABLE tax_lots; --"`
- **THEN** the Zod schema MUST reject the input before it reaches any SQL adapter
- **AND** no SQL must be executed with the unvalidated string
