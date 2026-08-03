## ADDED Requirements

### Requirement: Row Aggregation Preserves the Legs of a Same-Asset Movement

`aggregateRows()` SHALL NOT merge rows that share a group identifier when those rows name the same asset with opposing signs. Such a group is a movement between two accounts, not a trade, and merging it produces a single record whose inbound and outbound assets are identical.

Aggregation exists to reunite the two halves of a trade — fiat out, crypto in. Applying it to a same-asset pair destroys the very distinction the custody engine depends on.

#### Scenario: A same-asset pair is not collapsed into one record

- **WHEN** two rows share one `group_id`, both name `XRP`, and their amounts are `-100` and `+100`
- **THEN** both rows MUST survive aggregation as separate records
- **AND** no record MUST be produced whose `asset_in` equals its `asset_out`

#### Scenario: A genuine trade is still merged

- **WHEN** two rows share one `group_id`, one naming `-300 EUR` and the other `+247.10551 XRP`
- **THEN** they MUST be merged into a single record with `asset_out = EUR` and `asset_in = XRP`

#### Scenario: Merging never discards the field classification depends on

- **WHEN** rows are merged
- **THEN** the merged record MUST retain enough information for `classifyCustodyMovement` to resolve a direction, or MUST be rejected rather than passed on unclassified

### Requirement: Direction Is Resolved Before Aggregation, Not After

The ingestion pipeline SHALL classify each source row's direction before any grouping or merging step. `aggregateRows()` currently runs before `normalizeTransactionDirection()`, which removes the per-leg `amount` that `classifyCustodyMovement` reads, so the classifier receives a record it cannot classify and the backend mapper substitutes a direction the domain had refused to determine.

#### Scenario: The classifier sees the per-leg amount

- **WHEN** a source row for a movement is processed
- **THEN** `classifyCustodyMovement` MUST receive that row's own signed amount
- **AND** the resolution MUST NOT depend on a field that a later merging step removes

#### Scenario: An unclassified movement is never given a direction downstream

- **WHEN** the domain cannot resolve a movement's direction
- **THEN** the row MUST be reported as rejected
- **AND** no layer after the domain MUST assign it a direction

### Requirement: Two Legs of One Physical Movement Are Linked in the Ledger

When a source records both legs of a movement between two accounts the ledger SHALL persist their shared identity, so custody resolution can pair them from recorded fact rather than falling through to the synthetic counterparty.

`spot_transactions.transfer_group_id` exists for this and is written by nothing today, which makes the `recorded_counterparty` tier of `v_custody_movements` unreachable: no ledger row can enter it.

#### Scenario: A recorded pair resolves to the real counterparty

- **WHEN** a `TRANSFER_OUT` from `Kraken:spot` and a `TRANSFER_IN` to `Kraken:earn` share one source group identifier
- **THEN** both rows MUST carry the same `transfer_group_id`
- **AND** custody resolution MUST pair them through `recorded_counterparty`
- **AND** the synthetic `ownwallet-XRP` counterparty MUST NOT be used

#### Scenario: An ambiguous group still falls through to synthetic

- **WHEN** a group names more than one candidate counterparty account
- **THEN** resolution MUST fall through to the synthetic counterparty rather than choosing one

#### Scenario: No resolution tier is left unreachable

- **WHEN** the change is complete
- **THEN** either `transfer_group_id` MUST be populated by ingestion
- **OR** the `recorded_counterparty` tier and the column MUST be removed
- **AND** a tier that no ledger row can enter MUST NOT remain in the engine

### Requirement: An Unresolved Fiat Magnitude Is Distinguishable From a Genuine Zero

The ledger SHALL represent "this magnitude is unknown" as a state distinct from "this magnitude is zero". `spot_transactions.total_fiat` and `price_fiat` are currently `TEXT NOT NULL` with a non-negative `CHECK`, so an unresolvable magnitude is stored as `'0'` — the same value a genuinely free acquisition carries.

The engine already behaves correctly, routing a `0` through override, then market series, then `NULL` plus `MISSING_PRICE`. What is wrong is that the ledger itself cannot state the difference, so the distinction depends on a downstream derivation rather than on the recorded fact.

#### Scenario: An unresolvable magnitude is recorded as unknown

- **WHEN** ingestion cannot resolve a fiat magnitude for a row it persists
- **THEN** the stored value MUST be distinguishable from `0`
- **AND** the row MUST be counted in the ingestion result as pending review

#### Scenario: A genuinely free acquisition remains zero

- **WHEN** an acquisition genuinely has no cost
- **THEN** its recorded magnitude MUST be `0`
- **AND** it MUST NOT be reported as pending review

#### Scenario: The non-negative invariant survives the change

- **WHEN** the columns are widened to express the unknown state
- **THEN** a negative magnitude MUST still be rejected by the `CHECK` constraint and by `nonNegativePreciseAmountSchema`
