## ADDED Requirements

### Requirement: Pluggable Database Port
The system SHALL define generic database interfaces (Ports) in `apps/backend/src/core/domain/ports/` to completely abstract the underlying database engine from the business logic.

#### Scenario: Backend accesses data
- **WHEN** the backend orchestrates a query
- **THEN** it executes it via the generic port interface, with no knowledge of whether DuckDB or PostgreSQL is executing the query

### Requirement: Decoupled Database Package
The system SHALL encapsulate all physical schema definitions, table creation scripts, and migration files into a dedicated `packages/database` module.

#### Scenario: Running migrations
- **WHEN** the database is initialized
- **THEN** it loads schemas and applies migrations exclusively defined in `packages/database`, allowing `apps/backend` to remain engine-agnostic
