## MODIFIED Requirements

### Requirement: DuckDB Engine Initialization
The infrastructure layer SHALL initialize a DuckDB instance on application start and attach the primary SQLite ledger via the `sqlite` scanner extension. Initialization SHALL expose a pooled connection interface rather than a single process-wide shared connection, and SHALL declare the derived FIFO chain as definition views (`v_<name>__def`) plus public views (`v_<name>`) over materialized tables (`m_<name>`) rather than as a stack of recomputing views. Initialization SHALL drop any pre-existing `m_<name>` tables so the chain starts in the `never-built` stale state and is built by the first read.

#### Scenario: Successful Ledger Federation
- **WHEN** the backend service initializes the DuckDbAnalyticsAdapter
- **THEN** it executes `ATTACH 'kryptofolio_ledger.db' AS ledger (TYPE SQLITE)` once at instance level
- **THEN** the adapter successfully queries data from the SQLite schema without errors
- **AND** the attachment MUST be visible from every connection the pool subsequently creates

#### Scenario: Derived chain is declared, not computed, at startup
- **WHEN** `initialize()` completes
- **THEN** the six derived relations MUST exist as `v_<name>__def` definitions and `v_<name>` public views over `m_<name>` tables
- **AND** any pre-existing `m_<name>` table MUST have been dropped
- **AND** the chain state MUST be `{ kind: 'stale', reason: 'never-built' }` until the first rebuild commits

#### Scenario: Callers obtain connections from the pool
- **WHEN** any adapter executes an analytical query
- **THEN** it MUST acquire a connection from the pool and release it in a `finally`
- **AND** no module MUST hold a reference to a single long-lived shared connection

### Requirement: Decimal Precision Casting
The DuckDB configuration and core utility functions SHALL strictly cast all financial floating-point numbers to `DECIMAL(38,18)` to prevent precision loss. Materializing a derived relation SHALL preserve those declared types exactly: the declared `CAST`s in the definition SQL are the single source of truth for column types, and a materialized column SHALL NEVER land as `DOUBLE`, `FLOAT` or `REAL` where the definition declared `DECIMAL`.

#### Scenario: Aggregation of micro-fractions
- **WHEN** summing multiple fractional asset balances (e.g., 0.00000001 BTC)
- **THEN** DuckDB outputs the exact mathematical sum without floating-point approximations

#### Scenario: Materialization preserves declared decimal types
- **WHEN** a derived relation is materialized via `CREATE OR REPLACE TABLE m_<name> AS SELECT * FROM v_<name>__def`
- **THEN** `DESCRIBE m_<name>` MUST report the same column types as `DESCRIBE v_<name>__def`
- **AND** the rebuild MUST abort before `COMMIT` if any monetary column reports `DOUBLE`, `FLOAT` or `REAL`
- **AND** no second hand-written column DDL MUST exist alongside the definition SQL
