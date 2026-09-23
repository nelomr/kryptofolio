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

### Requirement: Risk and Time-Series Metrics Read the Materialized Chain

Risk, drawdown, volatility and performance queries SHALL read the materialized derived relations (`v_daily_running_balances`, `v_portfolio_daily_valuation` and the calculated lot/event relations backed by `m_*` tables) instead of recomputing the derived FIFO chain per request. Their numeric results SHALL be unchanged by this: the values produced from the materialized chain SHALL equal those produced by executing the corresponding definition views over the same committed ledger state.

#### Scenario: Drawdown query does not recompute the FIFO

- **WHEN** the drawdown metric is computed
- **THEN** its SQL MUST read the public derived relations backed by materialized tables
- **AND** it MUST NOT re-execute the FIFO matching window computation

#### Scenario: Materialized results equal computed results

- **WHEN** the risk, drawdown, volatility and performance responses are produced from the materialized chain and, separately, from the definition views over the same committed ledger state
- **THEN** the two responses MUST be identical, with every decimal compared as an exact string

#### Scenario: Ordered metric output does not rely on heap order

- **WHEN** a metric response returns a sequence whose order is observable, such as a daily time series
- **THEN** the query MUST carry an explicit `ORDER BY`
- **AND** two consecutive calls over the same materialized state MUST return the sequence in identical order

