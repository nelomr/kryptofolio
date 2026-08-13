# Automatic Portfolio Rebuild Specification

## Purpose

Running FIFO materialisation automatically once per ingestion batch, orchestrated from the application layer, with `needs_recalculation` as a retryable marker of pending work.

## Requirements

### Requirement: Materialisation Runs Automatically Once Per Ingestion Batch

Ingestion SHALL trigger materialisation automatically when the batch completes. It SHALL run exactly once per batch, not once per row and not once per file.

#### Scenario: Batch of transactions triggers a single rebuild

- **WHEN** a batch of 97 transactions is ingested
- **THEN** materialisation MUST be invoked exactly once
- **AND** the FIFO recomputation MUST NOT run per row

#### Scenario: Multi-file import produces one rebuild

- **WHEN** the user imports several CSV files in a single submission
- **THEN** materialisation MUST run once after all rows are persisted

#### Scenario: Empty batch triggers no rebuild

- **WHEN** an ingestion request contains zero valid rows
- **THEN** materialisation MUST NOT be invoked
- **AND** `needs_recalculation` MUST NOT be set

#### Scenario: Ingestion response carries the rebuild outcome

- **WHEN** an ingestion batch completes and materialises
- **THEN** the response MUST include the reconciliation summary and the count of rows pending review
- **AND** the payload MUST be validated by a Zod DTO schema before reaching the UI

### Requirement: Orchestration Lives in the Application Layer

The composition of ingestion and materialisation SHALL be an application-layer use case. The HTTP route SHALL NOT sequence the two steps, and `CsvIngestionUseCase` SHALL NOT depend on the materialiser.

#### Scenario: Orchestrator composes the two steps

- **WHEN** the ingestion endpoint is called
- **THEN** it MUST delegate to a single orchestrating use case that invokes ingestion and then materialisation
- **AND** the route MUST contain no ordering logic between them

#### Scenario: Each step remains independently invocable

- **WHEN** `CsvIngestionUseCase` is inspected
- **THEN** it MUST NOT hold a reference to the materialiser service
- **AND** both it and the materialiser MUST remain individually callable with pure inputs

#### Scenario: Orchestrator is framework-free

- **WHEN** the orchestrating use case is inspected
- **THEN** it MUST NOT import Vue, Hono, or any HTTP dependency
- **AND** it MUST return plain data so it remains invocable as an LLM tool

### Requirement: Override Edits Trigger an Immediate Rebuild

Creating, updating, or removing a manual override SHALL trigger materialisation immediately, so the user sees the effect of the value they assigned.

#### Scenario: Assigning a price refreshes derived data

- **WHEN** the user assigns a manual price to a flagged transaction
- **THEN** materialisation MUST run before the mutation response returns
- **AND** the response MUST reflect the updated flag counts

#### Scenario: Removing an override refreshes derived data

- **WHEN** the user deletes an override
- **THEN** materialisation MUST run and the derived values MUST revert

#### Scenario: Batched override edits produce one rebuild

- **WHEN** several overrides are submitted in a single request
- **THEN** materialisation MUST run once for the whole request

### Requirement: `needs_recalculation` Is a Retryable Pending-Work Marker

The `needs_recalculation` setting SHALL be retained and reframed from a user-action prompt into a pending-work marker. It SHALL be set when the ledger changes and cleared only on successful materialisation.

#### Scenario: Failed automatic rebuild remains retryable

- **WHEN** the automatic materialisation after an ingestion batch fails
- **THEN** `needs_recalculation` MUST remain `'true'`
- **AND** the ingestion response MUST report that materialisation did not complete
- **AND** the persisted transactions MUST be retained

#### Scenario: Manual endpoint remains available as an explicit retry

- **WHEN** the user invokes `POST /api/portfolio/rebuild`
- **THEN** materialisation MUST run regardless of the flag's current value
- **AND** it MUST return the same reconciliation summary shape as the automatic path

#### Scenario: Flag drives the pending indicator

- **WHEN** `needs_recalculation` is `'true'`
- **THEN** the UI MUST indicate that derived figures are pending recalculation

#### Scenario: Flag is cleared only after the derived rows are committed

- **WHEN** materialisation succeeds
- **THEN** the flag MUST be cleared as the last step of the successful run, after every derived row has
  been written
- **AND** a run that fails at any earlier point MUST leave the flag `'true'`

The flag is read and written through `IUserSettingsPort` against the settings database, while the
derived tables live in the ledger database. One transaction cannot span two SQLite files, so
"within the same transaction" is not achievable as wired; the two observable guarantees above are, and
they are what the retry behaviour depends on.

### Requirement: Data-Quality Flags Never Block a Rebuild

Materialisation SHALL complete regardless of how many rows carry data-quality flags. Flags SHALL be advisory and reported, never a gate.

#### Scenario: Rebuild completes with unpriced rows present

- **WHEN** 30 acquisitions have unresolvable prices
- **THEN** materialisation MUST complete successfully
- **AND** the summary MUST report 30 rows pending review

#### Scenario: User is notified without being blocked

- **WHEN** rows are pending review after a rebuild
- **THEN** the UI MUST surface the count and a path to assign values
- **AND** it MUST NOT prevent the user from viewing the portfolio or the tax report

#### Scenario: Flagged figures are excluded but visible

- **WHEN** flagged events exist
- **THEN** they MUST be excluded from tax-base totals
- **AND** they MUST remain visible in the audit trail with their reason
