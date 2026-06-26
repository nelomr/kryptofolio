# ledger-domain-adapter Specification

## Purpose
TBD - created by archiving change phase-1-sqlite-oltp. Update Purpose after archive.
## Requirements
### Requirement: Anti-Corruption Layer for SQLite
The system MUST implement `SQLiteLedgerAdapter` that converts all SQLite TEXT currency strings to Domain `Decimal` value objects.

#### Scenario: Fetching transactions
- **WHEN** the domain requests a transaction list
- **THEN** the adapter retrieves TEXT fields and converts them to Decimal before returning the Domain entity

#### Scenario: Saving transactions
- **WHEN** the domain requests to save a Decimal
- **THEN** the adapter serializes it to a string format TEXT before executing the SQLite statement

