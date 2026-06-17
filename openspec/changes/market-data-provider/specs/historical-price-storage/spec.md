## ADDED Requirements

### Requirement: In-Memory Temporary Storage
The system SHALL temporarily cache historical prices in memory, pending a robust DuckDB implementation.

#### Scenario: Fetching cached history
- **WHEN** the system is requested to provide historical prices for an asset
- **THEN** it MUST return the prices cached in the `InMemoryPriceHistoryAdapter`.

### Requirement: DuckDB Preparedness
The system SHALL include the skeleton implementations for a `DuckDbPriceHistoryAdapter` anticipating bulk ingestion via the Appender API.

#### Scenario: Calling the DuckDB skeleton methods
- **WHEN** a method on the `DuckDbPriceHistoryAdapter` is called
- **THEN** it MUST log or throw a "Not Implemented" exception, acting as a placeholder for the next development iteration.
