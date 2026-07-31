## MODIFIED Requirements

### Requirement: Crypto-Fee Disposal Generation
When a transaction fee is paid in a crypto asset (e.g., BNB on Binance), the system SHALL treat that fee payment as a distinct disposal (sell) of that specific asset, triggering its own capital gain/loss calculation before the primary transaction evaluates. This branch SHALL be gated exclusively by the `generatesFeeDisposal` flag of the canonical `FIFO_EVENT_POLICY`, independently of whether the transaction generates a principal disposal, and SHALL NOT be left ungated. When the fee asset's fiat value cannot be resolved from `historical_prices`, the resulting disposal SHALL be emitted with `sale_price_fiat = NULL`, `is_taxable = 0`, and `quality_flag = 'MISSING_PRICE'`; a fabricated fallback price SHALL NOT be substituted.

#### Scenario: BNB Fee on a BTC Buy
- **WHEN** a user buys 1 BTC and pays 0.1 BNB as a fee (BNB previously acquired at €10, current value €30)
- **THEN** the engine calculates a capital gain of +€2 for the 0.1 BNB disposed
- **THEN** the 1 BTC acquisition cost basis correctly reflects the fiat equivalent cost including the fee expenditure

#### Scenario: Fee branch is scoped by policy, not left open
- **WHEN** the crypto-fee disposal branch of `v_flattened_fifo_events` is evaluated
- **THEN** it MUST join `fifo_event_policy` and require `generates_fee_disposal = true`
- **AND** it MUST NOT be reachable by a transaction type whose policy sets `generatesFeeDisposal = false`

#### Scenario: Unpriceable fee is flagged, not invented
- **WHEN** the fee asset has no `historical_prices` row at or before the transaction date
- **THEN** the fee disposal MUST be emitted with `sale_price_fiat = NULL`, `is_taxable = 0`, and `quality_flag = 'MISSING_PRICE'`
- **AND** the engine MUST NOT value the fee at `1.0` per unit

### Requirement: Event Flattening via UNION ALL
Before applying recursive window functions, DuckDB SHALL flatten denormalized transactions into distinct chronological FIFO events. Each branch's inclusion SHALL be determined by joining the `fifo_event_policy` relation, which is seeded from the canonical `FIFO_EVENT_POLICY` map in `@kryptofolio/shared-types`. Inline `tx_type IN (...)` / `NOT IN (...)` literals SHALL NOT appear in any FIFO view. Assets flagged `is_fiat` SHALL be excluded from event generation entirely.
- **WHEN** a `SWAP` transaction involves an input asset, an output asset, and a fee asset
- **THEN** DuckDB SHALL output 3 distinct events: 1 Acquisition (output asset), and 2 Disposals (input asset + fee asset), properly sequenced.
- **WHEN** a `TRANSFER_OUT` or `WITHDRAWAL` incurs a network fee paid in crypto
- **THEN** DuckDB SHALL ignore the transferred amount for tax purposes (Global FIFO rule), but MUST extract the fee as a distinct Disposal event.

#### Scenario: Swap emits three sequenced events
- **WHEN** a `SWAP` transaction has `asset_in_id`, `asset_out_id`, and a crypto `fee_asset_id`
- **THEN** `v_flattened_fifo_events` MUST emit exactly one `ACQUISITION` and two `DISPOSAL` rows for that transaction

#### Scenario: Crypto custody movement emits only the fee event
- **WHEN** a `WITHDRAWAL` or `TRANSFER_OUT` of a non-fiat asset carries a crypto network fee
- **THEN** `v_flattened_fifo_events` MUST emit exactly one `DISPOSAL` row, for the fee amount only
- **AND** MUST NOT emit any row for the transferred principal
- **AND** the matching inbound `DEPOSIT` or `TRANSFER_IN` MUST emit no `ACQUISITION` row

#### Scenario: Fiat movements are excluded from flattening
- **WHEN** a `DEPOSIT` or `WITHDRAWAL` moves an asset whose `is_fiat` flag is `1`
- **THEN** `v_flattened_fifo_events` MUST emit no rows for that transaction

#### Scenario: No hardcoded transaction-type literals remain
- **WHEN** the definition of `v_flattened_fifo_events` is read from `duckdb_views()`
- **THEN** it MUST NOT contain the literals `'TRANSFER_IN'`, `'TRANSFER_OUT'`, `'MIGRATION_SWAP'`, `'DEPOSIT'`, or `'WITHDRAWAL'`

## ADDED Requirements

### Requirement: Canonical Lot Status Vocabulary End to End

The lot lifecycle status SHALL use exactly one vocabulary across every layer: `TAX_LOT_STATUSES = ['OPEN', 'PARTIAL', 'CLOSED']`, exported by `@kryptofolio/shared-types`. The parallel `FULL | PARTIAL | EMPTY` vocabulary SHALL be removed. Consumers SHALL propagate the status computed by `v_calculated_tax_lots` and SHALL NOT recompute it from quantities.

#### Scenario: Status is propagated, not recomputed

- **WHEN** `GetTokenHistoryUseCase` maps a lot to its DTO
- **THEN** it MUST pass through the `status` value produced by the view
- **AND** it MUST NOT derive status by comparing `remaining_qty` against `original_qty`

#### Scenario: Fully consumed lot reports CLOSED

- **WHEN** a lot's `remaining_qty` has been reduced to zero by taxable disposals
- **THEN** the API MUST report `status = 'CLOSED'`
- **AND** the UI MUST render a label meaning "closed/sold", never one meaning "open"

#### Scenario: Untouched lot reports OPEN

- **WHEN** a lot has never been matched against a disposal
- **THEN** the API MUST report `status = 'OPEN'`
- **AND** the UI MUST render a label meaning "open", never one meaning "sold"

#### Scenario: No stale vocabulary remains

- **WHEN** the repository is searched for the string literals `'EMPTY'` and `'FULL'` in lot-status positions
- **THEN** no occurrence MUST remain in `GetTokenHistoryUseCase`, `ExternalTaxLotSchema`, `MockDtoSchemas`, `TaxLotEntity`, or `ExpandedLotsTable.vue`

### Requirement: Disposal Provenance Preservation

Every `lot_history_event` SHALL carry a `disposal_type` drawn from the canonical `DISPOSAL_TYPES = ['SELL', 'SWAP', 'FEE', 'SPEND']`, derived from the source transaction's `tx_type` and event branch. Consumers SHALL NOT assign a disposal type by assumption.

#### Scenario: Fee disposal is labelled FEE

- **WHEN** a disposal event originates from the crypto-fee branch
- **THEN** its `disposal_type` MUST be `'FEE'`

#### Scenario: Sale disposal is labelled SELL

- **WHEN** a disposal event originates from a `SELL` transaction's principal leg
- **THEN** its `disposal_type` MUST be `'SELL'`

#### Scenario: Provenance is not hardcoded in the read path

- **WHEN** `GetTokenHistoryUseCase` builds a `TokenLotHistoryEventDto`
- **THEN** `operation_type` MUST be sourced from the event's `disposal_type`
- **AND** the literal `operation_type: 'SELL'` MUST NOT appear in the mapping

### Requirement: Non-Negative Cost Basis Invariant

The FIFO engine SHALL treat `total_fiat`, `price_fiat`, `unit_cost_fiat`, and `sale_price_fiat` as non-negative magnitudes. Direction SHALL be conveyed by `tx_type` and the `asset_in_id` / `asset_out_id` fields, never by sign.

#### Scenario: Negative acquisition basis cannot produce a gain

- **WHEN** an acquisition's stored `total_fiat` is negative
- **THEN** the derived lot MUST be flagged `quality_flag = 'NEGATIVE_COST_BASIS'`
- **AND** any disposal matched against it MUST be emitted with `is_taxable = 0`
- **AND** the engine MUST NOT report a positive `gain_loss_fiat` derived from that basis

#### Scenario: Zero-price disposal does not manufacture proceeds

- **WHEN** a disposal's fiat proceeds cannot be resolved
- **THEN** `sale_price_fiat` MUST be `NULL` and the event MUST be flagged
- **AND** the engine MUST NOT treat `0` as a genuine sale price
