# database-migrations Specification

## Purpose
TBD - created by archiving change phase-2b-time-series. Update Purpose after archive.
## Requirements
### Requirement: `spot_transactions.fiat_currency` Column Migration
The system SHALL add `fiat_currency TEXT NOT NULL DEFAULT 'USD'` to the `spot_transactions` table in the `003_currency_schema.sql` migration (extending the existing Phase Parquet migration), preserving the exact native currency used at transaction time.

#### Scenario: Transaction executed in EUR
- **WHEN** a user buys BTC paying with EUR (e.g. from a Bit2Me CSV ingestion)
- **THEN** the system MUST store `total_fiat` and `price_fiat` in EUR, and `fiat_currency = 'EUR'`
- **AND** the FIFO engine MUST use this currency when computing cost-basis in the view `v_calculated_tax_lots`

#### Scenario: Transaction executed in USD (default)
- **WHEN** a new transaction is inserted without explicitly setting `fiat_currency`
- **THEN** the DEFAULT value of `'USD'` MUST be applied automatically, ensuring backward compatibility with all existing rows

---

### Requirement: `futures_transactions.fiat_currency` Column Migration
The system SHALL add `fiat_currency TEXT NOT NULL DEFAULT 'USD'` to the `futures_transactions` table, enabling correct fiscal reporting for PnL settled in non-EUR assets.

#### Scenario: Futures contract settled in USDT
- **WHEN** a futures position is closed with `realized_pnl` settled in USDT
- **THEN** `fiat_currency = 'USD'` MUST be stored
- **AND** the `v_futures_realized_pnl` view MUST use this to apply the correct USD/EUR exchange rate during tax report generation

---

### Requirement: No EUR Hardcodes in DuckDB Views
After migration, the DuckDB FIFO views (`v_flattened_fifo_events`, `v_calculated_tax_lots`, `v_calculated_lot_history_events`, `v_futures_realized_pnl`) SHALL NOT contain any hardcoded `'EUR'` string as a currency. All currency references MUST read from the `fiat_currency` column of the originating transaction.

#### Scenario: Existing FIFO view outputs correct currency
- **WHEN** `v_calculated_tax_lots` is queried for a BTC acquisition paid in USD
- **THEN** the `fiat_currency` column of the result row MUST be `'USD'`, not `'EUR'`

---

### Requirement: Domain Types Consistency
The `LedgerSpotTransaction` and `LedgerFuturesTransaction` interfaces in `ILedgerPort.ts` SHALL include `fiat_currency: string` as a **mandatory** (non-optional) field. The `CsvIngestionUseCase` SHALL resolve `fiat_currency` using the following order: CSV field value → `base_currency` from `IUserSettingsPort.getSetting('base_currency')` → `'USD'` as ultimate fallback. No ingested transaction shall ever have an implicit or defaulted currency.

#### Scenario: Domain type enforces currency
- **WHEN** a `LedgerSpotTransaction` object is created without `fiat_currency`
- **THEN** the TypeScript compiler MUST emit an error (required field missing)

---

### Requirement: Shared Types Zod Schema Update
The `@kryptofolio/shared-types` package SHALL include `fiat_currency: z.string()` (**required, NO `.default()`**) in the `SpotTransactionSchema`, `FuturesTransactionSchema`, `TaxLotSchema`, and `TaxLotEventSchema` Zod schemas. The existing `TaxLotSchema` (L96) and `TaxLotEventSchema` (L112) currently have `.default('EUR')` which MUST be removed — the SQL-level `DEFAULT 'USD'` serves only as a DB safety net; the application layer MUST always provide an explicit value.

#### Scenario: Zod validation rejects missing fiat_currency
- **WHEN** a record missing `fiat_currency` is validated against `SpotTransactionSchema`
- **THEN** the Zod parse MUST fail with a validation error ("Required" error on `fiat_currency`)
- **AND** the same behavior MUST apply to `FuturesTransactionSchema`, `TaxLotSchema`, and `TaxLotEventSchema`

---

### Requirement: SQL Injection Remediation (Pre-requisite)
All DuckDB adapter methods (`getHoldingsSnapshot`, `getDerivativesPnl`, `calculateLotsAndEvents`, `getSpanishTaxReport`) SHALL use DuckDB parameterized queries for ALL user-supplied values (`accountId`, `year`). String interpolation of user input directly into SQL strings is STRICTLY FORBIDDEN.

#### Scenario: Malicious accountId input
- **WHEN** `getHoldingsSnapshot` is called with `accountId = "'; DROP TABLE tax_lots; --"`
- **THEN** the parameterized query MUST safely escape the value, and no SQL injection occurs
- **AND** the query returns zero results (no matching accountId)

