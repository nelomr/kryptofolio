# duckdb-risk-metrics Specification

## Purpose
TBD - created by archiving change phase-2b-time-series. Update Purpose after archive.
## Requirements
### Requirement: Compute Rolling All-Time High (ATH)
The system SHALL compute the historical Rolling All-Time High of the portfolio's fiat value natively via DuckDB window functions over the joined timeline.

#### Scenario: Portfolio hits new high
- **WHEN** today's portfolio value exceeds all previous days
- **THEN** the Rolling ATH updates to today's value.

### Requirement: Compute Drawdown Percentage
The system SHALL compute the daily Drawdown Percentage as `(daily_portfolio_fiat_value - rolling_max) / rolling_max` directly in SQL.

#### Scenario: Value drops from 100k to 50k
- **WHEN** the Rolling ATH is 100k EUR and the current day's value is 50k EUR
- **THEN** the computed Drawdown % is strictly `-0.50` (or `-50.00%`).

### Requirement: Compute Annualized Volatility
The system SHALL compute annualized volatility over the daily returns array using standard deviation (`STDDEV(daily_return) * SQRT(365)`).

#### Scenario: Calculating monthly volatility
- **WHEN** requested to calculate volatility grouped by month
- **THEN** the engine computes the standard deviation of daily returns within that partition and scales it by `SQRT(365)`.

### Requirement: Compute Alpha and Beta
The system SHALL compute Beta vs BTC and Alpha against a Risk-Free Rate. This MANDATES the ingestion of a `BTC` historical price benchmark.

#### Scenario: Correlating portfolio against the market
- **WHEN** the portfolio consists exclusively of altcoins (e.g. SOL, ADA)
- **THEN** the system MUST still possess historical daily returns for `BTC` to compute the covariance and variance required for `Beta`.

