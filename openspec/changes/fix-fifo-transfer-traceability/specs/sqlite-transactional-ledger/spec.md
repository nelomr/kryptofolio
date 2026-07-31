## MODIFIED Requirements

### Requirement: Relational Tables
The database SHALL include `assets`, `accounts`, `spot_transactions`, `futures_transactions`, `tax_lots`, `lot_history_events`, `lot_custody_entries`, `manual_price_overrides`, `transfer_destination_overrides`, and `audit_log` tables matching frontend mock payload structures. Tables SHALL be partitioned into two classes with opposite lifecycles: **derived** tables (`tax_lots`, `lot_history_events`, `lot_custody_entries`), which are a pure function of their inputs and are freely reconciled; and **user-authored input** tables (`manual_price_overrides`, `transfer_destination_overrides`), which are never written by reconciliation.

#### Scenario: Creating a tax lot link
- **WHEN** a tax lot references a BUY transaction
- **THEN** the FOREIGN KEY constraint ensures the BUY transaction exists

#### Scenario: Creating a custody entry

- **WHEN** a `lot_custody_entries` row is inserted with a `tax_lot_id`, `account_id`, a signed `qty_delta`, an `occurred_at`, and the originating `spot_transaction_id`
- **THEN** the FOREIGN KEY constraints MUST ensure the lot, the account, and the transaction exist

#### Scenario: Custody entries balance per movement

- **WHEN** the custody entries for a single custody movement are summed for one asset
- **THEN** the total MUST be zero, since every debit has a matching credit

#### Scenario: Custody entry does not mutate lot economics

- **WHEN** custody entries are written for a lot
- **THEN** the referenced lot's `original_qty`, `remaining_qty`, `unit_cost_fiat`, `total_cost_fiat`, `acquisition_timestamp`, and `exchange_location` MUST be unchanged

#### Scenario: Derived and input tables are distinguishable in the schema

- **WHEN** the schema is inspected
- **THEN** each derived table MUST be documented as reconciled output
- **AND** each user-authored table MUST be documented as calculation input excluded from reconciliation

### Requirement: STRICT Mode and Text Storage
The SQLite transactional ledger (`kryptofolio_ledger.db`) SHALL enforce STRICT mode for all tables and use TEXT types with CHECK constraints for all financial variables to prevent precision loss. Fiat magnitude columns (`spot_transactions.total_fiat`, `spot_transactions.price_fiat`, `tax_lots.unit_cost_fiat`, `tax_lots.total_cost_fiat`, `manual_price_overrides.price_fiat`) SHALL additionally enforce a non-negative CHECK constraint, since direction is carried by `tx_type` and the directional asset columns rather than by sign. Signed columns SHALL be limited to those representing genuine deltas, and SHALL be documented as such.

#### Scenario: Inserting valid transaction
- **WHEN** inserting a transaction with amounts formatted as text digits
- **THEN** it saves correctly and retains full precision

#### Scenario: Inserting invalid transaction
- **WHEN** inserting a transaction with non-numerical text in amount fields
- **THEN** it is rejected by the SQLite CHECK constraint

#### Scenario: Negative fiat magnitude is rejected

- **WHEN** inserting a `spot_transactions` row with `total_fiat = '-299.70'`
- **THEN** the write MUST be rejected by the non-negative CHECK constraint

#### Scenario: Signed delta column is permitted and documented

- **WHEN** `lot_custody_entries.qty_delta` is written with a negative value representing an outflow
- **THEN** the write MUST succeed
- **AND** the column's signed semantics MUST be documented in the schema

## ADDED Requirements

### Requirement: Asset Fiat Classification Column

The `assets` table SHALL carry `is_fiat INTEGER NOT NULL DEFAULT 0 CHECK (is_fiat IN (0, 1))`, identifying units of account that are excluded from FIFO lot tracking.

#### Scenario: Fiat asset is flagged

- **WHEN** the EUR asset row is read after migration
- **THEN** `is_fiat` MUST be `1`

#### Scenario: Crypto asset defaults to non-fiat

- **WHEN** a new asset is created for an unrecognised symbol
- **THEN** `is_fiat` MUST be `0`

### Requirement: Account Hierarchy and Synthetic Marker Columns

The `accounts` table SHALL carry a nullable `parent_account_id TEXT REFERENCES accounts(id)` and `is_synthetic INTEGER NOT NULL DEFAULT 0 CHECK (is_synthetic IN (0, 1))`, with an index on `parent_account_id`.

#### Scenario: Child account references its venue parent

- **WHEN** `Kraken:earn` is created under `Kraken`
- **THEN** its `parent_account_id` MUST reference the `Kraken` account row

#### Scenario: Self-parenting is rejected

- **WHEN** an account is written with `parent_account_id` equal to its own `id`
- **THEN** the write MUST be rejected

#### Scenario: Synthetic account is marked

- **WHEN** `ownwallet-XRP` is created
- **THEN** `is_synthetic` MUST be `1` and `parent_account_id` MUST be `NULL`

### Requirement: Disposal Provenance and Separate Flag Columns

The `lot_history_events` table SHALL carry `disposal_type TEXT NOT NULL` constrained to `('SELL','SWAP','FEE','SPEND')`, and a new `quality_flag TEXT` column constrained to the canonical data-quality vocabulary or `NULL`. The pre-existing `flag` column SHALL retain its fiscal-classification vocabulary, including `WALLET_ACTIVATION`.

#### Scenario: Invalid disposal type is rejected

- **WHEN** an event is written with `disposal_type = 'TRANSFER'`
- **THEN** the SQLite CHECK constraint MUST reject the write

#### Scenario: Invalid flag is rejected

- **WHEN** an event is written with `quality_flag = 'SOMETHING_ELSE'`
- **THEN** the SQLite CHECK constraint MUST reject the write

#### Scenario: Null flag is permitted for clean events

- **WHEN** an event has no data-quality defect
- **THEN** `quality_flag` MUST be `NULL` and the write MUST succeed

### Requirement: User-Authored Override Tables

The database SHALL include `manual_price_overrides` and `transfer_destination_overrides` as STRICT tables keyed by the deterministic transaction identity, each carrying an optional note and audit timestamps. These tables SHALL be documented and treated as calculation inputs.

#### Scenario: Price override is keyed by deterministic transaction identity

- **WHEN** a manual price override is written
- **THEN** it MUST key on the transaction's deterministic identity so it survives re-ingestion
- **AND** it MUST record an explicit `fiat_currency`

#### Scenario: Price override rejects a negative value

- **WHEN** a manual price override is written with a negative value
- **THEN** the non-negative CHECK constraint MUST reject the write

#### Scenario: Destination override references a real account

- **WHEN** a transfer destination override is written
- **THEN** the FOREIGN KEY constraint MUST ensure the target account exists

#### Scenario: Destination override cannot be self-referential

- **WHEN** a destination override would set the counterparty equal to the transaction's own account
- **THEN** the write MUST be rejected

#### Scenario: Override tables are exempt from reconciliation

- **WHEN** materialisation reconciliation completes
- **THEN** both override tables MUST be unchanged
