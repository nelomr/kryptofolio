# Fifo Materialization Reconciliation Specification

## Purpose

Materialisation as a full set reconciliation, scoped strictly to derived tables, atomic, and deterministic across recalculations.
## Requirements
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
- **THEN** `needs_recalculation` MUST be set to `'false'` as the last step of the run, after every
  derived row has been written and committed
- **AND** the flag MUST remain `'true'` when any earlier step fails

The flag lives in the settings database and the derived tables in the ledger database, so a single
transaction cannot cover both.

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

### Requirement: Query-Time Sources Are Declared, Never Hedged Against Materialiser Lag

`OPEN_LOTS_WITH_QUALITY` and `REALIZED_EVENTS` SHALL NOT `UNION ALL` a live FIFO recomputation against the materialised SQLite tables as a hedge against the materialiser lagging behind the ledger. That state is unreachable, because a read is served only after the derived chain has been rebuilt and committed. Source selection SHALL be declared in the relation's definition, and SHALL NOT be decided at query time by comparing a build stamp against the ledger, nor by counting rows in a materialised table.

#### Scenario: The lag hedge is gone

- **WHEN** the definitions of the open-lot and realized-event relations are inspected
- **THEN** they MUST contain no branch predicated on `(SELECT COUNT(*) FROM ledger.lot_history_events) = 0` or any equivalent emptiness test used to select a source
- **AND** they MUST contain no live FIFO recomputation executed per query

#### Scenario: No build-stamp predicate is introduced

- **WHEN** the derived-chain build stamp is used
- **THEN** it MUST serve only observability and the freshness state
- **AND** it MUST NOT appear as a predicate in any query-time source-selection branch

#### Scenario: Removing the hedge changes no figure

- **WHEN** the KPI, fiscal report and lot/event payloads are produced before and after the hedge is removed, over the same committed ledger state
- **THEN** the payloads MUST be identical, with every decimal compared as an exact string

### Requirement: Non-Derived Tax Lots Are a Declared Source Computed Once Per Rebuild

Tax lots in `ledger.tax_lots` that carry `spot_transaction_id IS NULL` are not derivable from a spot transaction and therefore cannot be produced by the FIFO chain. They SHALL be exposed as an explicit relation `v_external_tax_lots` and unioned into the **definition** of the materialised open-lot relation, so they are computed once per rebuild rather than once per query. Their presence or absence in any particular ledger SHALL be established by counting them against the real ledger, not assumed.

#### Scenario: External lots appear in the open-lot relation

- **WHEN** a tax lot exists in `ledger.tax_lots` with `spot_transaction_id IS NULL` and a non-zero remaining quantity
- **THEN** it MUST appear in the materialised open-lot relation after a rebuild
- **AND** it MUST carry the same columns and quality flags as a FIFO-derived lot

#### Scenario: The relation is declared even when it matches no row today

- **WHEN** `SELECT COUNT(*) FROM ledger.tax_lots WHERE spot_transaction_id IS NULL` returns zero for the ledger under test
- **THEN** `v_external_tax_lots` MUST still exist and still be unioned into the definition
- **AND** the equivalence test MUST record explicitly that this source is not covered by live rows

#### Scenario: External lots do not enter the tax FIFO ordering

- **WHEN** external lots are unioned into the open-lot relation
- **THEN** the `PARTITION BY asset_id ORDER BY timestamp, tx_id` ordering of the FIFO matching relation MUST be unchanged
- **AND** no external lot MUST alter which acquisition a disposal is matched against

### Requirement: Reconciliation Reads Only a Chain Rebuilt in the Same Pipeline Run

Because reconciliation is a full set difference, reconciling against a derived chain that does not reflect the ledger retires valid rows. `FifoMaterializerService` SHALL therefore be invoked only by the derived-state pipeline owned by `FifoChainFreshnessService`, after a DuckDB rebuild has committed in the same pipeline run. No route, job, use case or script SHALL invoke the reconciliation directly.

#### Scenario: An empty chain after a restart does not retire the ledger's derived rows

- **WHEN** the backend restarts, every `m_*` table is an empty placeholder, and an explicit trigger (the manual rebuild endpoint, a scheduled job, an ingestion) requests materialisation before any read
- **THEN** the chain MUST be rebuilt from the ledger before the reconciliation reads it
- **AND** no tax lot, lot-history event or custody entry derived from a live transaction MUST be soft-deleted

#### Scenario: Rows retired by a reconciliation against a stale chain are restored

- **WHEN** derived rows were soft-deleted by an earlier reconciliation that read a chain not reflecting the ledger, and the pipeline then runs over an unchanged ledger
- **THEN** every such row whose source transaction is live MUST be reactivated with `deleted_at = NULL`
- **AND** no duplicate row MUST be inserted

