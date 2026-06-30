## ADDED Requirements

### Requirement: DuckDB Engine Initialization
The infrastructure layer SHALL initialize an ephemeral DuckDB connection on application start and attach the primary SQLite ledger via the `sqlite` scanner extension.

#### Scenario: Successful Ledger Federation
- **WHEN** the backend service initializes the DuckDbAnalyticsAdapter
- **THEN** it executes `ATTACH 'kryptofolio_ledger.db' AS ledger (TYPE SQLITE)`
- **THEN** the adapter successfully queries data from the SQLite schema without errors

### Requirement: Analytical Bulk Ingestion Interface
The `packages/database` layer SHALL expose a dedicated `IAnalyticalDatabasePort` separating analytical columnar operations (e.g., Appender API) from generic transaction operations (`IDatabasePort`).

#### Scenario: Bulk price injection
- **WHEN** the backend needs to inject 10,000 price ticks into DuckDB
- **THEN** it uses `IAnalyticalDatabasePort.bulkInsert` (or equivalent Appender wrapper) instead of 10,000 `INSERT` statements
- **THEN** the native DuckDB Appender API is utilized, drastically reducing write time

### Requirement: Decimal Precision Casting
The DuckDB configuration and core utility functions SHALL strictly cast all financial floating-point numbers to `DECIMAL(38,18)` to prevent precision loss.

#### Scenario: Aggregation of micro-fractions
- **WHEN** summing multiple fractional asset balances (e.g., 0.00000001 BTC)
- **THEN** DuckDB outputs the exact mathematical sum without floating-point approximations
