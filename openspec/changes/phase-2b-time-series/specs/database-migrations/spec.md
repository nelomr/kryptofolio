## ADDED Requirements

### Requirement: `spot_transactions.fiat_currency` Column Migration
The system SHALL add `fiat_currency TEXT NOT NULL DEFAULT 'USD'` to the `spot_transactions` table in the `003_currency_schema.sql` migration, preserving the exact native currency used at transaction time.

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
