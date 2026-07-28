# duckdb-time-series-generation Specification

## Purpose
TBD - created by archiving change phase-2b-time-series. Update Purpose after archive.
## Requirements
### Requirement: Daily Continuous Timeline Generation
The system SHALL generate a continuous, gap-less daily timeline from the earliest transaction date up to the current date using DuckDB's `GENERATE_SERIES`.

#### Scenario: First transaction was 10 days ago
- **WHEN** the engine computes the timeline
- **THEN** it yields exactly 11 distinct date rows (inclusive of start and current date)

---

### Requirement: Vectorized Running Balance
The system SHALL calculate the cumulative running balance (quantity) for each asset on every day of the generated timeline utilizing DuckDB window functions:
```sql
SUM(amount) OVER (PARTITION BY asset_id ORDER BY date ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
```

#### Scenario: Asset has no transactions on a given day
- **WHEN** the running balance is computed for a day with zero trades
- **THEN** the balance is carried over directly from the previous day's cumulative sum

---

### Requirement: Historical Multi-Currency Valuation via ASOF JOIN
The system SHALL compute the daily fiat value of the portfolio by:
1. Performing an `ASOF JOIN` between daily running balances and `historical_prices` (Parquet) to match the closest preceding price for each asset.
2. Performing a second join against `exchange_rates` (SQLite) using the user's `base_currency` (read from `user_settings`) to convert the native price to the target reporting currency. The `exchange_rates.pair` format is `FROM/TO` (e.g., `'USD/EUR'`), so the join condition is `pair = historical_prices.currency || '/' || :base_currency`.

#### Scenario: Price missing for a weekend day
- **WHEN** joining prices for Saturday where only Friday's price exists in `historical_prices`
- **THEN** the engine MUST use Friday's closing price via `ASOF JOIN` to value Saturday's balance — not zero, not NULL

#### Scenario: Multi-currency conversion (EUR user, USD prices)
- **WHEN** the user's `base_currency = 'EUR'` and `historical_prices.currency = 'USD'`
- **THEN** the engine MUST look up `exchange_rates` for `pair = 'USD/EUR'` at the closest preceding date
- **AND** compute `daily_value = running_balance * close_price_usd * usd_to_eur_rate`
- **AND** the result MUST match the expected EUR value within DECIMAL(38,18) precision

#### Scenario: No conversion needed (same currency)
- **WHEN** the user's `base_currency = 'USD'` and `historical_prices.currency = 'USD'`
- **THEN** the exchange rate is 1.0 (identity) — no conversion applied
- **AND** `daily_value = running_balance * close_price_usd`

#### Scenario: User switches base currency to USD
- **WHEN** the user changes `user_settings.base_currency` from 'EUR' to 'USD'
- **THEN** the next DuckDB query for `v_portfolio_daily_valuation` MUST return values in USD (exchange rate = 1.0, no conversion needed)
- **AND** the frontend Pinia Colada cache MUST be invalidated for this settings change (keys: `["portfolio-summary"]`, `["crypto-metrics-kpis"]`, `["crypto-performance-history"]`, `["crypto-asset-allocation"]`, `["crypto-volatility-heatmap"]`, `["crypto-risk-metrics"]`, `["crypto-drawdown-curve"]`)

