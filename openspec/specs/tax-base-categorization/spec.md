## ADDED Requirements

### Requirement: Spanish Tax Law Base Routing
The DuckDB views SHALL categorize taxable events based on the `operationType` to support Spanish IRPF declarations, strictly distinguishing between Savings Base and General Base income.

#### Scenario: Routing Staking and Earn Yields
- **WHEN** transactions are tagged with `STAKING`, `EARN`, or `DIVIDENDS`
- **THEN** the engine aggregates their fiat values into the Savings Base (Base del Ahorro) metrics

#### Scenario: Routing Airdrops and Mining
- **WHEN** transactions are tagged with `AIRDROP` or `MINING`
- **THEN** the engine aggregates their fiat values into the General Base (Base General) metrics
