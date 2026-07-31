## ADDED Requirements

### Requirement: Full Set Reconciliation on Materialisation

`FifoMaterializerService` SHALL reconcile the materialised SQLite derived tables against the full recomputed DuckDB set on every run. Rows present in SQLite but absent from the recomputed set SHALL be soft-deleted. An UPSERT-only strategy is insufficient and SHALL NOT be used.

#### Scenario: Orphan lot from a deleted transaction is retired

- **WHEN** a `spot_transaction` is soft-deleted and materialisation runs
- **THEN** the tax lot derived from it MUST have `deleted_at` populated
- **AND** it MUST NOT appear in `v_active_tax_lots`
- **AND** it MUST NOT be physically removed

#### Scenario: Phantom lots from reclassified transfers are retired

- **WHEN** a previously materialised zero-cost lot derived from a crypto `DEPOSIT` no longer appears in the recomputed set after the policy change
- **THEN** that lot MUST be soft-deleted
- **AND** every `lot_history_event` and `lot_custody_entries` row referencing it MUST be soft-deleted

#### Scenario: Reconciliation is idempotent

- **WHEN** materialisation runs twice with no intervening ledger or override change
- **THEN** the second run MUST produce zero inserts, zero updates, and zero deletions
- **AND** the `audit_log` MUST gain no new rows for the derived tables

#### Scenario: Reactivation of a previously retired row

- **WHEN** a soft-deleted transaction is restored and its lot reappears in the recomputed set
- **THEN** the existing row MUST be updated with `deleted_at = NULL` rather than a duplicate row being inserted

### Requirement: Reconciliation Is Scoped Strictly to Derived Tables

Reconciliation SHALL operate only on `tax_lots`, `lot_history_events`, and `lot_custody_entries`. It SHALL NOT read for mutation, write, or delete any user-authored input table.

#### Scenario: Override tables are untouched by a rebuild

- **WHEN** materialisation reconciliation completes
- **THEN** `manual_price_overrides` and `transfer_destination_overrides` MUST be byte-identical to their pre-run contents
- **AND** an automated test MUST assert this

#### Scenario: Derived tables are a pure function of their inputs

- **WHEN** the transactional ledger and the override tables are identical between two runs
- **THEN** the derived tables MUST be byte-identical
- **AND** no derived value MUST depend on the previous contents of a derived table

#### Scenario: Reconciliation does not depend on prior derived state

- **WHEN** all derived tables are emptied and materialisation is run
- **THEN** the resulting derived tables MUST be identical to those produced by an incremental run over the same inputs

### Requirement: Atomic Materialisation

Materialisation SHALL execute inserts, updates, and soft-deletes for all derived tables inside a single SQLite transaction. A failure at any point SHALL leave the ledger in its prior state.

#### Scenario: Failure mid-materialisation leaves no partial state

- **WHEN** the write of `lot_history_events` fails after `tax_lots` has been written
- **THEN** the transaction MUST roll back
- **AND** `tax_lots` MUST retain its pre-run contents
- **AND** `needs_recalculation` MUST remain `'true'`

#### Scenario: Recalculation flag is cleared only on success

- **WHEN** materialisation completes without error
- **THEN** `needs_recalculation` MUST be set to `'false'` within the same transaction that wrote the derived rows

#### Scenario: Custody entries are written in the same transaction

- **WHEN** custody entries and lots are both recomputed
- **THEN** they MUST be reconciled within one transaction
- **AND** a state where custody references a retired lot MUST NOT be observable

### Requirement: Deterministic Identity Across Recalculations

Reconciliation SHALL rely exclusively on the deterministic IDs produced by the DuckDB views. Materialisation SHALL NOT generate random identifiers for lots, events, or custody entries.

#### Scenario: Same input yields identical IDs

- **WHEN** materialisation runs twice over an unchanged ledger
- **THEN** every derived row's ID MUST be byte-identical between runs

#### Scenario: Audit log records only value differences

- **WHEN** a recalculation changes a lot's `remaining_qty` but nothing else
- **THEN** the `audit_log` entry MUST show a difference in `remaining_qty` only
- **AND** no delete-then-insert pair MUST be recorded

### Requirement: Reconciliation Reporting

The materialisation run SHALL return a structured summary containing counts of `inserted`, `updated`, `retired`, and `reactivated` rows per derived table, plus the count of rows carrying data-quality flags and the count pending manual review.

#### Scenario: Rebuild endpoint returns the summary

- **WHEN** `POST /api/portfolio/rebuild` completes
- **THEN** the response MUST include the per-table reconciliation counts, the flagged-row count, and the pending-review count
- **AND** the payload MUST be validated by a Zod DTO schema before reaching the UI

#### Scenario: Automatic and manual paths return the same shape

- **WHEN** materialisation is triggered automatically after ingestion and, separately, via the manual endpoint
- **THEN** both MUST return the identical summary shape

#### Scenario: Summary is emitted as pure data

- **WHEN** `FifoMaterializerService.recalculate()` returns
- **THEN** it MUST return a plain summary object with no framework or HTTP coupling, so the service remains directly invocable as an LLM tool
- **AND** all monetary values in the summary MUST use the project's precision value object rather than native numbers
