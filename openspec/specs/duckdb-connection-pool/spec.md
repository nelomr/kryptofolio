# Duckdb Connection Pool Specification

## Purpose

A fixed-size, FIFO-queuing connection pool over one shared DuckDB instance, with no per-connection session state leaking between requests.

## Requirements

### Requirement: Pooled Connections Over a Single DuckDB Instance

`DuckDbAdapter` SHALL serve queries from a fixed-size pool of `DuckDBConnection`s created over one `DuckDBInstance`, instead of a single process-wide shared connection. The maximum size SHALL default to 4 and SHALL be configurable via `DUCKDB_POOL_SIZE`, tuned together with `DUCKDB_THREADS`. Connections SHALL be created lazily up to the maximum.

#### Scenario: Concurrent requests are served concurrently

- **WHEN** the dashboard's parallel read requests are issued against a warm materialised chain
- **THEN** they MUST be served on distinct pooled connections up to the pool maximum
- **AND** no request MUST wait on another request's query merely because a single connection was shared

#### Scenario: Pool size is bounded and configurable

- **WHEN** `DUCKDB_POOL_SIZE` is set to N
- **THEN** at most N connections MUST exist for the instance
- **AND** with the variable unset the maximum MUST be 4

### Requirement: Acquire Queues FIFO and Every Path Releases

`acquire()` SHALL return an idle connection when one exists, and otherwise queue the caller in first-in-first-out order until one is released. Every code path that acquires a connection SHALL release it in a `finally`, including paths that throw. `bulkInsert` SHALL hold one connection for the whole appender lifetime and release it when the appender closes.

#### Scenario: Waiters are served in arrival order

- **WHEN** more callers request a connection than the pool holds
- **THEN** the waiting callers MUST be granted connections in the order they arrived

#### Scenario: A throwing query does not leak its connection

- **WHEN** a query executed on a pooled connection throws
- **THEN** the connection MUST be returned to the pool
- **AND** a subsequent acquire MUST succeed without the pool being exhausted

#### Scenario: Bulk insert holds exactly one connection

- **WHEN** `bulkInsert` runs
- **THEN** it MUST hold a single acquired connection for the appender's whole lifetime
- **AND** it MUST release that connection when the appender closes, including on failure

### Requirement: No Session State Leaks Between Pooled Connections

No connection-scoped session state SHALL be relied upon across requests. Extension loading and the `ATTACH` of the SQLite ledger SHALL be performed once at instance level on the bootstrap connection and SHALL be visible to every pooled connection. Catalogue objects created lazily, such as the custody views, SHALL be bootstrapped once for the whole pool rather than per connection. A `prepareConnection(conn)` hook SHALL exist as the single declared home for any per-connection setup and SHALL be empty until one is genuinely required.

#### Scenario: A newly created pooled connection sees the attached ledger

- **WHEN** a connection is created after `initialize()` has completed and it queries `ledger.spot_transactions`
- **THEN** the query MUST succeed without re-running `ATTACH` on that connection

#### Scenario: Custody views are bootstrapped once for the pool

- **WHEN** custody relations are lazily ensured
- **THEN** the ensuring MUST happen once for the adapter singleton
- **AND** the resulting views MUST be visible from every pooled connection

#### Scenario: No temporary tables are created per request

- **WHEN** the analytical adapters' emitted SQL is inspected across a full dashboard fan-out
- **THEN** no `CREATE ... TEMP TABLE` statement MUST be emitted
- **AND** the result of any query MUST NOT depend on which pooled connection served it

