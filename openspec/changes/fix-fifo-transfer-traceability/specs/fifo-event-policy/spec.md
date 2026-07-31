## ADDED Requirements

### Requirement: Canonical FIFO Event Policy Map

The `@kryptofolio/shared-types` package SHALL export a single `FIFO_EVENT_POLICY` constant typed as `Record<SpotTxType, FifoEventPolicy>`, where `FifoEventPolicy` declares four independent, non-derived booleans: `generatesAcquisition`, `generatesDisposal`, `generatesFeeDisposal`, and `taxableDisposal`. This constant SHALL be the ONLY place in the codebase where the FIFO behaviour of a `tx_type` is declared.

#### Scenario: Every canonical transaction type has a policy entry

- **WHEN** the `FIFO_EVENT_POLICY` map is type-checked against `SpotTxType`
- **THEN** the TypeScript compiler MUST emit an error if any member of `SPOT_TX_TYPES` lacks an entry
- **AND** a unit test MUST assert at runtime that `Object.keys(FIFO_EVENT_POLICY)` covers `SPOT_TX_TYPES` exactly, with no extra keys

#### Scenario: Custody movements generate no principal events

- **WHEN** the policy is read for `DEPOSIT`, `WITHDRAWAL`, `TRANSFER_IN`, `TRANSFER_OUT`, or `MIGRATION_SWAP`
- **THEN** `generatesAcquisition` MUST be `false`
- **AND** `generatesDisposal` MUST be `false`
- **AND** `generatesFeeDisposal` MUST be `true`

#### Scenario: Trades generate principal events

- **WHEN** the policy is read for `BUY`
- **THEN** `generatesAcquisition` MUST be `true` and `generatesDisposal` MUST be `false`
- **WHEN** the policy is read for `SELL` or `SPEND`
- **THEN** `generatesDisposal` MUST be `true` and `taxableDisposal` MUST be `true`
- **WHEN** the policy is read for `SWAP`
- **THEN** both `generatesAcquisition` and `generatesDisposal` MUST be `true`

#### Scenario: Crypto-native income generates untaxed-basis acquisitions

- **WHEN** the policy is read for `STAKING`, `AIRDROP`, `REWARD`, or `MINING`
- **THEN** `generatesAcquisition` MUST be `true` and `generatesDisposal` MUST be `false`
- **AND** the acquisition cost basis MUST be the fiat market value at receipt, not zero

### Requirement: Policy Materialised as a Single DuckDB Relation

The DuckDB engine SHALL materialise `FIFO_EVENT_POLICY` into a table named `fifo_event_policy` at bootstrap, keyed by `tx_type`. The `v_flattened_fifo_events` view SHALL derive every branch's inclusion by joining this relation. Inline `tx_type IN (...)` or `tx_type NOT IN (...)` predicates over transaction types SHALL NOT appear in any FIFO view.

#### Scenario: No hardcoded type lists remain in the views

- **WHEN** the SQL text of `v_flattened_fifo_events`, `v_acquisitions`, `v_disposals`, `v_fifo_matches`, `v_calculated_tax_lots`, and `v_calculated_lot_history_events` is inspected
- **THEN** it MUST NOT contain any literal `'TRANSFER_IN'`, `'TRANSFER_OUT'`, `'MIGRATION_SWAP'`, `'DEPOSIT'`, or `'WITHDRAWAL'` string
- **AND** an automated test MUST assert this by querying `duckdb_views()` for the view definitions

#### Scenario: Policy table is seeded from the TypeScript constant

- **WHEN** the DuckDB adapter bootstraps
- **THEN** `fifo_event_policy` MUST be populated from `FIFO_EVENT_POLICY` using bulk ingestion (Appender API or a single multi-row `INSERT`), never one `INSERT` per row
- **AND** the row count MUST equal `SPOT_TX_TYPES.length`

#### Scenario: Adding a new transaction type cannot silently leak into FIFO

- **WHEN** a new member is appended to `SPOT_TX_TYPES` without a corresponding `FIFO_EVENT_POLICY` entry
- **THEN** the build MUST fail at type-check time
- **AND** no transaction of that type MUST reach `v_flattened_fifo_events` (the policy join excludes unknown types rather than defaulting them)

### Requirement: Independent Fee-Disposal Branch Scoping

The crypto-fee disposal branch of `v_flattened_fifo_events` SHALL be gated by `generatesFeeDisposal` from the policy relation. It SHALL NOT be gated by `generatesDisposal`, and it SHALL NOT be left ungated.

#### Scenario: Transfer with a crypto network fee

- **WHEN** a `WITHDRAWAL` of 100 XRP incurs a 0.2 XRP network fee
- **THEN** `v_flattened_fifo_events` MUST emit exactly ONE event for that transaction: a `DISPOSAL` of 0.2 XRP (the fee)
- **AND** it MUST NOT emit a `DISPOSAL` of the 100 XRP principal

#### Scenario: Buy with a fiat fee

- **WHEN** a `BUY` transaction pays its fee in the ledger's `fiat_currency`
- **THEN** no fee `DISPOSAL` event MUST be emitted
- **AND** the fee MUST be added to the acquisition's `total_fiat` cost basis
