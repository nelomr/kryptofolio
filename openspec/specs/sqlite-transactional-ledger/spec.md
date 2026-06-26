# sqlite-transactional-ledger Specification

## Purpose
TBD - created by archiving change phase-1-sqlite-oltp. Update Purpose after archive.
## Requirements
### Requirement: STRICT Mode and Text Storage
The SQLite transactional ledger (`kryptofolio_ledger.db`) SHALL enforce STRICT mode for all tables and use TEXT types with CHECK constraints for all financial variables to prevent precision loss.

#### Scenario: Inserting valid transaction
- **WHEN** inserting a transaction with amounts formatted as text digits
- **THEN** it saves correctly and retains full precision

#### Scenario: Inserting invalid transaction
- **WHEN** inserting a transaction with non-numerical text in amount fields
- **THEN** it is rejected by the SQLite CHECK constraint

### Requirement: Relational Tables
The database SHALL include `assets`, `accounts`, `spot_transactions`, `futures_transactions`, `tax_lots`, `lot_history_events`, and `audit_log` tables matching frontend mock payload structures.

#### Scenario: Creating a tax lot link
- **WHEN** a tax lot references a BUY transaction
- **THEN** the FOREIGN KEY constraint ensures the BUY transaction exists

### Requirement: Non-destructive Audit Log
The database SHALL enforce a soft-deletion policy and maintain an audit log of all updates via automatic SQLite triggers.

#### Scenario: Deleting a transaction
- **WHEN** a user requests to delete a transaction
- **THEN** the transaction's `deleted_at` is populated, and it remains in the database physically

#### Scenario: Modifying a transaction
- **WHEN** a record is updated
- **THEN** an `AFTER UPDATE` trigger automatically inserts the `old_values` and `new_values` JSON into the `audit_log` table

### Requirement: Deterministic Idempotency
The database SHALL reject duplicate CSV transactions based on a cryptographic `id_hash`.

#### Scenario: Ingesting duplicate CSV records
- **WHEN** a transaction is inserted with an `id_hash` that already exists
- **THEN** SQLite triggers a UNIQUE constraint violation and the transaction is safely ignored

