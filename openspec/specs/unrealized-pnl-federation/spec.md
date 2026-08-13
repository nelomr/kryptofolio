# Unrealized Pnl Federation Specification

## Purpose

Injecting market data through the Appender API, and computing unrealized PnL from it.

## Requirements

### Requirement: Market Data Injection via Appender API
The Infrastructure layer SHALL inject real-time market prices into the ephemeral DuckDB instance (using the DuckDB Node Appender API or equivalent high-speed ingestion) before calculating unrealized performance.

#### Scenario: Passing live asset prices
- **WHEN** the frontend requests current portfolio equity
- **THEN** the backend fetches live prices from the external oracle and pushes them into a temporary DuckDB structure (e.g., `live_prices`)

### Requirement: Unrealized PnL Calculation
The DuckDB engine SHALL perform an `ASOF JOIN` or standard join between the internal historical ledger (cost basis) and the injected market data to output the `unrealized_pnl_eur` and `current_value_eur` per asset.

#### Scenario: Computing active holding gains
- **WHEN** the user holds 2 ETH with an aggregated cost basis of €3000 and the live price injected is €2000 per ETH
- **THEN** the engine calculates the current value as €4000
- **THEN** the engine outputs an Unrealized PnL of +€1000 for ETH
