# Account Hierarchy Specification

## Purpose

Exchange sub-wallets as first-class child accounts, including the naming contract for the synthetic counterparty custody resolves an unrecorded movement to, and how such accounts are marked and hidden.

## Requirements

### Requirement: Exchange Sub-Wallets Are First-Class Child Accounts

The `accounts` table SHALL support a nullable `parent_account_id` self-reference so that exchange sub-wallets (for example `Kraken:spot`, `Kraken:earn`, `Kraken:futures`) are distinct accounts under a venue parent. Balance that is blocked in a yield product SHALL be distinguishable from free balance.

#### Scenario: Sub-wallet accounts are created under a venue parent

- **WHEN** a Kraken CSV containing `wallet` values `spot / main` and `earn` is ingested for the venue `Kraken`
- **THEN** child accounts MUST exist with `parent_account_id` referencing the `Kraken` account
- **AND** each transaction MUST be attributed to its child account, not to the venue

#### Scenario: Staked balance is queryable

- **WHEN** XRP has been moved from `Kraken:spot` to `Kraken:earn`
- **THEN** the system MUST be able to report the quantity held in `Kraken:earn` separately from `Kraken:spot`

#### Scenario: Venue roll-up preserves the total

- **WHEN** balances are aggregated by parent account
- **THEN** the `Kraken` total MUST equal the sum of its child accounts for each asset

#### Scenario: Parent reference integrity is enforced

- **WHEN** an account is inserted with a `parent_account_id` that does not exist
- **THEN** the FOREIGN KEY constraint MUST reject the write
- **AND** an account MUST NOT reference itself as its own parent

### Requirement: Kraken Parser Reads the `wallet` Column

`KrakenSpotCsvParser` SHALL read the `wallet` column it currently declares in its column order but discards, and SHALL propagate it so the ingestion pipeline can resolve the correct sub-account.

#### Scenario: Wallet value is propagated from the parser

- **WHEN** a Kraken row carries `wallet = 'earn'`
- **THEN** the parsed entity MUST expose that wallet value
- **AND** it MUST NOT be dropped during normalisation

#### Scenario: Missing wallet value falls back to the venue account

- **WHEN** a source row has no `wallet` value
- **THEN** the transaction MUST be attributed to the venue account itself
- **AND** no child account MUST be fabricated

#### Scenario: Wallet values are normalised consistently

- **WHEN** Kraken emits `spot / main` for the primary wallet
- **THEN** the resolved sub-account identifier MUST be deterministic and stable across imports
- **AND** re-importing the same file MUST resolve to the identical account

### Requirement: Synthetic Accounts Are Marked and Hidden

The `accounts` table SHALL carry `is_synthetic` identifying accounts created by the system as custody counterparties rather than by the user. Synthetic accounts SHALL participate fully in custody arithmetic and SHALL be excluded from user-facing account selectors and account counts.

#### Scenario: Synthetic account is flagged on creation

- **WHEN** `ownwallet-XRP` is created on demand as a custody counterparty
- **THEN** its `is_synthetic` value MUST be `1`
- **AND** its `parent_account_id` MUST be `NULL`

#### Scenario: Synthetic accounts are absent from selectors

- **WHEN** the UI presents the account list for CSV import or portfolio filtering
- **THEN** no account with `is_synthetic = 1` MUST be listed

#### Scenario: Synthetic accounts are excluded from user-facing counts

- **WHEN** the number of configured accounts is displayed
- **THEN** synthetic accounts MUST NOT be counted

#### Scenario: Synthetic accounts remain in custody arithmetic

- **WHEN** custody balances are computed
- **THEN** synthetic accounts MUST be included
- **AND** their balances MUST be available to the fiscal integrity surface

### Requirement: Synthetic Account Naming Contract

The naming of synthetic custody accounts SHALL be defined once as a pure derivation from the asset symbol, exported from a shared package, and SHALL NOT be constructed by string concatenation at each call site.

#### Scenario: Name is derived through the shared contract

- **WHEN** a synthetic account name is required for asset `XRP`
- **THEN** it MUST be produced by the shared naming function
- **AND** the result MUST be `ownwallet-XRP`

#### Scenario: Derivation is a pure domain function

- **WHEN** the naming contract is inspected
- **THEN** it MUST have no framework or database dependency
- **AND** it MUST be usable from the domain layer, the DuckDB seed, and the ingestion path without duplication

#### Scenario: Asset symbols are normalised before derivation

- **WHEN** an asset symbol arrives in mixed case
- **THEN** the derived account name MUST be identical to the one derived from its canonical form
