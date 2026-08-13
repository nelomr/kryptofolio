# Database Migrations Specification

## Purpose

The `004_fifo_traceability` forward migration: its clean-slate purge of transactional and derived data, its seeded reference data, and marking the ledger pending afterwards.

## Requirements

### Requirement: `004_fifo_traceability.sql` Forward Migration

The system SHALL add a forward-only migration `004_fifo_traceability.sql` introducing `assets.is_fiat`, `accounts.parent_account_id`, `accounts.is_synthetic`, `lot_history_events.disposal_type`, the constrained `lot_history_events.flag`, the `lot_custody_entries`, `manual_price_overrides`, and `transfer_destination_overrides` tables, and non-negative CHECK constraints on fiat magnitude columns. The migration SHALL be idempotent and SHALL be registered in `_schema_migrations`.

#### Scenario: Migration applies cleanly

- **WHEN** `004_fifo_traceability.sql` runs against an existing ledger
- **THEN** all new columns and tables MUST exist
- **AND** `_schema_migrations` MUST record version `004`

#### Scenario: Re-running the migration is a no-op

- **WHEN** the migration runner is invoked twice
- **THEN** the second invocation MUST make no changes and MUST NOT error

#### Scenario: STRICT mode is preserved on new tables

- **WHEN** `lot_custody_entries`, `manual_price_overrides`, and `transfer_destination_overrides` are created
- **THEN** each MUST be declared `STRICT`
- **AND** their financial columns MUST use TEXT with the project's numeric GLOB CHECK pattern

### Requirement: Clean-Slate Purge of Transactional and Derived Data

Because the project has no production deployment and every source CSV is re-ingestable, the migration SHALL purge transactional and derived ledger data rather than carrying repair or backfill logic. Re-ingestion is the documented path, and is required regardless because the Kraken `wallet` column needed for sub-account identity was never persisted and cannot be recovered retroactively.

#### Scenario: Transactional and derived data are purged

- **WHEN** the migration completes
- **THEN** `spot_transactions`, `futures_transactions`, `tax_lots`, `lot_history_events`, and `lot_custody_entries` MUST contain zero rows

#### Scenario: Vault, settings, and migration history are preserved

- **WHEN** the migration completes
- **THEN** the vault tables, `user_settings`, and `_schema_migrations` MUST retain their contents
- **AND** no credential or user preference MUST be lost

#### Scenario: No repair or backfill logic is carried

- **WHEN** the migration is inspected
- **THEN** it MUST NOT contain an `ABS()` repair statement over existing fiat values
- **AND** it MUST NOT contain a heuristic backfill of `disposal_type` for pre-existing events

#### Scenario: Constraints apply to an empty table

- **WHEN** the non-negative fiat CHECK constraints are added
- **THEN** they MUST apply against purged tables so no pre-existing violation can abort the migration

### Requirement: Seeded Reference Data

The migration SHALL seed the reference data the corrected engine depends on: fiat classification for recognised ISO-4217 symbols, and the venue/sub-wallet account structure required for re-ingestion.

#### Scenario: Known fiat symbols are classified

- **WHEN** an asset row exists for EUR, USD, GBP, or CHF after the migration
- **THEN** its `is_fiat` value MUST be `1`

#### Scenario: Unrecognised symbols default to non-fiat

- **WHEN** an asset is created for a symbol outside the ISO-4217 list
- **THEN** its `is_fiat` value MUST be `0`

#### Scenario: Synthetic accounts are created on demand, not pre-seeded

- **WHEN** the migration completes
- **THEN** no `ownwallet-<ASSET>` account MUST exist yet
- **AND** each MUST be created during ingestion when first required

### Requirement: Ledger Is Marked Pending After Migration

The migration SHALL set `user_settings.needs_recalculation = 'true'` so that the corrected engine reprocesses the ledger on the next materialisation, and so the UI signals that derived figures are pending.

#### Scenario: Ledger is marked pending

- **WHEN** the migration completes
- **THEN** `needs_recalculation` MUST be `'true'`

#### Scenario: Re-ingestion produces correct derived data

- **WHEN** the source CSVs are re-ingested after the migration
- **THEN** materialisation MUST run automatically once per batch
- **AND** no lot MUST be derived from a crypto `DEPOSIT`
- **AND** no principal disposal MUST be derived from a `WITHDRAWAL`
- **AND** for a ledger containing no `SELL` or `SWAP`, the reported spot capital gains MUST consist solely of valued fee disposals

#### Scenario: Re-ingestion is idempotent

- **WHEN** the same source CSVs are ingested twice after the migration
- **THEN** the second ingestion MUST insert zero new transactions
- **AND** the derived tables MUST be byte-identical after both runs
