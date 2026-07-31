## ADDED Requirements

### Requirement: Overrides Are Calculation Inputs, Never Edited Outputs

User-authored corrections SHALL be stored in dedicated input tables that feed into the analytical calculation. The user SHALL NOT edit derived rows. Derived tables (`tax_lots`, `lot_history_events`, `lot_custody_entries`) SHALL remain a pure function of the transactional ledger plus the override tables.

#### Scenario: Reconciliation never touches override tables

- **WHEN** materialisation reconciliation runs
- **THEN** it MUST NOT insert, update, or delete any row in `manual_price_overrides` or `transfer_destination_overrides`
- **AND** an automated test MUST assert the override tables are byte-identical before and after a rebuild

#### Scenario: Overrides survive a rebuild

- **WHEN** a user assigns a manual price and a rebuild is then performed
- **THEN** the override MUST still exist
- **AND** the recomputed lot MUST reflect the assigned value

#### Scenario: Overrides survive re-ingestion

- **WHEN** the same source CSV is re-ingested after overrides were authored
- **THEN** the overrides MUST still apply, because they key on the deterministic transaction identity
- **AND** no override MUST be orphaned by the re-ingestion

#### Scenario: Derived output remains a pure function of its inputs

- **WHEN** the transactional ledger and the override tables are identical between two runs
- **THEN** the derived tables MUST be byte-identical
- **AND** no derived value MUST depend on the previous contents of a derived table

### Requirement: Manual Price Assignment

The system SHALL allow the user to assign a fiat value to a transaction whose market price could not be resolved. The assignment SHALL be recorded with its currency and an optional note, and SHALL take precedence over any resolved market price for that transaction.

#### Scenario: Assigning a price to an unpriced staking receipt

- **WHEN** a `STAKING` receipt is flagged `MISSING_PRICE` and the user assigns `0.42 EUR` per unit
- **THEN** the derived lot's `unit_cost_fiat` MUST be `0.42`
- **AND** the `MISSING_PRICE` flag MUST no longer be reported for that transaction

#### Scenario: Override takes precedence over a resolved market price

- **WHEN** an override exists for a transaction that also has a resolvable historical price
- **THEN** the override value MUST be used
- **AND** the resulting value MUST be marked as manually assigned

#### Scenario: Override carries an explicit currency

- **WHEN** a manual price is assigned
- **THEN a** currency MUST be recorded alongside the value
- **AND** an override without a currency MUST be rejected

#### Scenario: Override values use precision arithmetic

- **WHEN** an override value is persisted and consumed
- **THEN** it MUST be handled through the project's precision value object
- **AND** it MUST NOT pass through a native floating-point number

#### Scenario: Removing an override restores derived behaviour

- **WHEN** a manual price override is deleted
- **THEN** the next rebuild MUST revert to the market-resolved value or to the `MISSING_PRICE` flag
- **AND** no stale manually-assigned value MUST persist in the derived tables

### Requirement: Manual Transfer Destination Assignment

The system SHALL allow the user to correct a custody movement's inferred counterparty, replacing the synthetic `ownwallet-<ASSET>` account with a real account.

#### Scenario: Correcting an unknown withdrawal destination

- **WHEN** a `WITHDRAWAL` was attributed to `ownwallet-XRP` and the user declares the destination is `Ledger`
- **THEN** the custody credit entry MUST target `Ledger` after the next rebuild
- **AND** the `ownwallet-XRP` residual MUST decrease accordingly

#### Scenario: Correction resolves an untracked inflow

- **WHEN** a `DEPOSIT` had produced a negative `ownwallet-XRP` balance flagged `UNTRACKED_INFLOW`, and the user declares its source account
- **THEN** the flag MUST no longer be reported once the balance resolves

#### Scenario: Override cannot target a non-existent account

- **WHEN** a destination override references an unknown account
- **THEN** the write MUST be rejected with a controlled error

#### Scenario: Override cannot make an account its own counterparty

- **WHEN** a destination override would set the counterparty equal to the transaction's own account
- **THEN** the write MUST be rejected

### Requirement: Manual Provenance Is Preserved and Visible

A value that originated from a manual assignment SHALL be distinguishable from a market-sourced value everywhere it is presented, so a declared figure is never silently indistinguishable from an observed one.

#### Scenario: Audit trail marks manually assigned values

- **WHEN** a lot or event derives from a manually assigned price
- **THEN** the audit trail MUST mark it as manually assigned
- **AND** the note recorded with the override MUST be retrievable

#### Scenario: Domain model carries the provenance

- **WHEN** the domain entity for a lot or event is inspected
- **THEN** the manual-value provenance MUST be represented as a typed field
- **AND** it MUST NOT be inferred by the UI from the presence of a flag

#### Scenario: Tax report exposes manual assignments

- **WHEN** a fiscal year's report includes values that were manually assigned
- **THEN** the report MUST indicate how many figures were manually assigned

### Requirement: Override Mutations Are Application-Layer Use Cases

Setting and removing an override SHALL be implemented as application-layer use cases accepting pure inputs and returning pure results, with no HTTP or UI coupling, so they remain directly invocable as LLM tools.

#### Scenario: Use case accepts primitives and returns plain data

- **WHEN** the manual price override use case is invoked
- **THEN** it MUST accept a DTO or primitives and return a plain result object
- **AND** it MUST NOT import any framework, HTTP, or Vue dependency

#### Scenario: Identifiers use branded types

- **WHEN** an override references a transaction or an account
- **THEN** the identifier MUST use a branded type rather than a bare `string`

#### Scenario: UI mutates through a declarative mutation

- **WHEN** the UI submits an override
- **THEN** it MUST use a Pinia Colada `useMutation` composable
- **AND** it MUST NOT hold override state in a global Pinia store
