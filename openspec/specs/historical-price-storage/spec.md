## ADDED Requirements

### Requirement: In-Memory Temporary Storage
The system SHALL temporarily cache historical prices in memory, pending a robust DuckDB implementation.

#### Scenario: Fetching cached history
- **WHEN** the system is requested to provide historical prices for an asset
- **THEN** it MUST return the prices cached in the `InMemoryPriceHistoryAdapter`.

### Requirement: DuckDB Preparedness
The system SHALL include the skeleton implementations for a `DuckDbPriceHistoryAdapter` anticipating bulk ingestion via the Appender API. This adapter MUST inject and use the generic `IDatabasePort` from `@kryptofolio/database` to remain decoupled from raw database drivers. 
Crucially, the adapter MUST NOT contain DDL logic (e.g., `CREATE TABLE`). All schema definitions MUST reside exclusively in `packages/database/migrations` to respect the Single Responsibility Principle and maintain a centralized source of truth.

#### Scenario: Calling the DuckDB skeleton methods
- **WHEN** a method on the `DuckDbPriceHistoryAdapter` is called
- **THEN** it MUST log or throw a "Not Implemented" exception, acting as a placeholder for the next development iteration.
