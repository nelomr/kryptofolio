## ADDED Requirements

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
