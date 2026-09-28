# spot-transaction-edit Specification

## Purpose
TBD - created by archiving change add-spot-transaction-edit-overrides. Update Purpose after archive.
## Requirements
### Requirement: Spot Transaction Edits Are Persisted As Overrides Keyed On The Imported `id_hash`

Editing a spot transaction SHALL NOT mutate the imported `spot_transactions` row. Every edit SHALL be persisted as a separate row in `spot_transaction_overrides`, keyed on the `id_hash` already assigned at ingestion. The `id_hash` stored on the override SHALL NEVER be recomputed from the edited values; it SHALL always be the value read from the imported row at the time the override is created.

#### Scenario: Editing a transaction leaves the imported row unchanged

- **WHEN** a user edits `amount_in` on a spot transaction and saves
- **THEN** the corresponding `spot_transactions` row MUST be byte-identical to its pre-edit contents
- **AND** the edited value MUST be readable only from `spot_transaction_overrides`

#### Scenario: The override key is never recomputed from edited values

- **WHEN** an override is created or updated for a transaction whose `id_hash` was originally derived from its own amount, price, fee, timestamp or type
- **THEN** the override's `id_hash` MUST remain the hash produced at ingestion time
- **AND** no code path MUST recompute `id_hash` from the override's edited field values

#### Scenario: An override survives a delete-all-then-reimport that reproduces the same hash

- **WHEN** all transactions are deleted and a source file is re-imported, reproducing a row whose deterministic identity matches an existing `spot_transaction_overrides.id_hash`
- **THEN** the override MUST re-apply to the reimported row
- **AND** the Ledgers table MUST mark that row as edited

### Requirement: Editable Fields Are Limited To P&L-Relevant Fields

Only `amount_in`, `amount_out`, `price_fiat`, `total_fiat`, the fee (amount and asset), `timestamp`, and `tx_type` SHALL be editable. `account_id`, `asset_in_id`, `asset_out_id`, `transfer_group_id`, and `status` SHALL NOT be editable through this mechanism.

#### Scenario: The edit schema exposes exactly the P&L-relevant fields

- **WHEN** the shared `spotTransactionEditSchema` is inspected
- **THEN** it MUST define exactly `amount_in`, `amount_out`, `price_fiat`, `total_fiat`, the fee group, `timestamp`, and `tx_type` as editable
- **AND** it MUST NOT define `account_id`, `asset_in_id`, `asset_out_id`, `transfer_group_id`, or `status` as editable fields

#### Scenario: Each editable field distinguishes "left alone" from "edited to empty"

- **WHEN** a user edits `total_fiat` to be empty (clearing a previously recorded total)
- **THEN** the effective transaction MUST have `total_fiat = NULL`
- **AND** this state MUST be distinguishable from a field the user never touched

### Requirement: Fee Edits Use A Three-Way Discriminant, Not A Boolean

The fee edit SHALL be modelled as a discriminated union with exactly three states: `UNCHANGED` (the imported fee applies), `NONE` (the user explicitly removed the fee), and `CHARGED` (the user declared a fee amount and asset). A `CHARGED` fee with amount `'0'` SHALL remain distinct from `NONE`.

#### Scenario: A stated zero fee is distinct from no fee

- **WHEN** a user edits the fee to `CHARGED` with `fee_amount = '0'`
- **THEN** the effective transaction MUST report a fee of `0` with an explicit fee asset
- **AND** it MUST NOT be indistinguishable from `NONE` in the effective view or in the stored override

#### Scenario: NONE explicitly removes a previously recorded fee

- **WHEN** a transaction was imported with a non-zero fee and the user edits the fee to `NONE`
- **THEN** the effective transaction MUST carry no fee
- **AND** the override row MUST record `fee_kind = 'NONE'`, distinguishable from `UNCHANGED`

#### Scenario: UNCHANGED preserves the imported fee unmodified

- **WHEN** a user edits other fields but leaves the fee as `UNCHANGED`
- **THEN** the effective fee amount and asset MUST equal the imported row's fee amount and asset

### Requirement: tx_type Edits Cannot Cross The Custody Boundary

An edit that would change `tx_type` on a row whose original type is a custody movement (`fifo_event_policy.custody_movement = true`) or that has a non-null `transfer_group_id` SHALL be rejected. An edit that would change a non-transfer row's type into `TRANSFER_IN` or `TRANSFER_OUT` SHALL be rejected. Reclassification among non-custody types SHALL be permitted.

#### Scenario: Reclassifying a transfer leg is rejected

- **WHEN** a user submits an edit changing `tx_type` on a `TRANSFER_OUT` row that has a `transfer_group_id`
- **THEN** the request MUST be rejected with a 422 validation error
- **AND** the imported `tx_type` MUST remain in effect

#### Scenario: Turning a disposal into a transfer is rejected

- **WHEN** a user submits an edit changing a `SELL` row's `tx_type` to `TRANSFER_IN`
- **THEN** the request MUST be rejected with a 422 validation error

#### Scenario: Reclassifying among non-custody types is allowed

- **WHEN** a user submits an edit changing a `BUY` row's `tx_type` to `SWAP`
- **THEN** the edit MUST be accepted
- **AND** the effective row MUST flow through `fifo_event_policy` for `SWAP`

### Requirement: An Edited Price Applies Uniformly, Including Acquisitions With A Recorded Total

An edited `price_fiat` SHALL be authoritative on every leg the transaction produces — acquisition, disposal, and fee — and SHALL be treated as a recorded value with `'MANUAL'` provenance. This applies even when the transaction already had a recorded `total_fiat` at import time: the edited price SHALL override that recorded total on an acquisition leg, not only on disposal and fee legs. This is an intentional behaviour change from the legacy price-override mechanism, which was inert on any acquisition that already had a recorded total; fixing that inertness means a historical acquisition's effective total, and therefore its downstream tax lots, CAN change once a price is edited on it.

#### Scenario: An edited price overrides a recorded total on an acquisition

- **WHEN** a `BUY` transaction was imported with a recorded `total_fiat` and the user edits only `price_fiat` to a different value
- **THEN** the effective `total_fiat` for that acquisition MUST be recomputed from the edited price times the effective principal quantity
- **AND** the originally recorded `total_fiat` MUST NOT be used for that acquisition's cost basis once the price edit is active

#### Scenario: An edited price without a recorded total is applied as before

- **WHEN** a transaction had no recorded `total_fiat` and the user edits `price_fiat`
- **THEN** the effective `total_fiat` MUST be computed as the edited price times the effective principal quantity, in `DECIMAL` arithmetic

#### Scenario: An edited price applies on disposal and fee legs

- **WHEN** the user edits `price_fiat` on a `SELL` or on a row producing a `FEE` disposal
- **THEN** the edited price MUST be used for that leg's valuation, as it already was before this change

### Requirement: Timestamp Edits Reorder FIFO Without Additional Confirmation

Editing `timestamp` SHALL reorder the transaction within its asset's global FIFO queue and within the affected account's custody ordering, following the existing orderings. The system SHALL require no extra confirmation step and SHALL emit no dedicated timestamp-reorder warning beyond the standard negative-balance check.

#### Scenario: An earlier timestamp moves a transaction earlier in the FIFO queue

- **WHEN** a user edits a `BUY` transaction's `timestamp` to a date before an existing acquisition of the same asset
- **THEN** the FIFO matching for that asset MUST be recomputed with the transaction in its new chronological position
- **AND** disposals matched against the reordered lots MUST reflect the new match order

#### Scenario: Saving a timestamp edit requires no extra confirmation step

- **WHEN** a user submits a timestamp-only edit
- **THEN** the save MUST proceed without any additional confirmation dialog beyond the standard save flow

#### Scenario: An invalid timestamp is rejected before reaching the domain

- **WHEN** a user submits a `timestamp` value that is not a valid ISO-8601 instant
- **THEN** the shared Zod schema MUST reject the payload before it reaches any use case

### Requirement: Negative Balances Are Allowed, Warned Above Tolerance, Never Silently Rejected

An edit that would cause a per-asset, per-account balance to go negative SHALL still be persisted. After the derived chain rebuilds, the system SHALL compare `UNTRACKED_INFLOW` data-quality results for the affected assets before and after the edit, and SHALL return a warning for every `(asset_id, account_id)` pair that newly appears, using the same per-asset tolerance `v_fifo_data_quality` already applies. A shortfall already present before the edit SHALL NOT be attributed to it.

#### Scenario: An edit causing a shortfall above tolerance is applied and warned

- **WHEN** an edit reduces an acquired amount so that a later disposal of the same asset in the same account now exceeds available holdings by more than the per-asset dust tolerance
- **THEN** the edit MUST still be persisted and the derived chain MUST still rebuild
- **AND** the response MUST report `balanceCheck.kind === 'NEGATIVE_BALANCE'` naming the affected asset and account

#### Scenario: A shortfall at or below tolerance produces no warning

- **WHEN** an edit produces a shortfall at or below the asset's dust tolerance
- **THEN** the response MUST report `balanceCheck.kind === 'CLEAN'`

#### Scenario: A pre-existing shortfall is not attributed to an unrelated edit

- **WHEN** an asset already had an `UNTRACKED_INFLOW` flag before the edit, and the edit does not affect that asset
- **THEN** that pre-existing flag MUST NOT appear in the edit's warning set

### Requirement: Edit Overrides Apply After Source-Profile Resolution

An edit SHALL apply to the already-normalized ledger row. The edit mechanism SHALL introduce no source-specific fee or gross/net convention and SHALL NOT infer a denomination from which `sourceProfile` originally ingested the row.

#### Scenario: A fee edit states its asset explicitly regardless of source

- **WHEN** a user edits the fee on a row originally ingested from any supported source
- **THEN** a `CHARGED` fee edit MUST require an explicit `fee_asset_id`
- **AND** no fallback MUST infer the fee asset from the source that ingested the row

#### Scenario: Edit semantics are identical across sources

- **WHEN** the same edit payload is applied to two rows imported from different sources with different original fee or gross/net conventions
- **THEN** the effective post-edit values MUST be computed identically for both rows

### Requirement: Edit Override API

`PUT /api/fiscal/overrides/transactions/:idHash` SHALL fully replace the active override for that hash with the submitted payload. `DELETE /api/fiscal/overrides/transactions/:idHash` SHALL restore the transaction to its originally imported values. Both SHALL trigger `OverrideMutationUseCase.applyThenRebuild`, which calls `FifoChainFreshnessService.refresh()` before the response is returned.

#### Scenario: PUT is a full replacement, not a merge

- **WHEN** an active override already exists for an `id_hash` and a new `PUT` is submitted with a different set of edited fields
- **THEN** the previously edited fields absent from the new payload MUST revert to their imported values
- **AND** only the fields present as `SET` in the new payload MUST remain edited

#### Scenario: An all-UNCHANGED payload is rejected

- **WHEN** a `PUT` payload has every field as `kind: 'UNCHANGED'`
- **THEN** the request MUST be rejected with a 422 error directing the user to use Restore instead

#### Scenario: The derived chain is rebuilt before the response returns

- **WHEN** a `PUT` or `DELETE` on an active override succeeds
- **THEN** the response MUST NOT be returned until `FifoChainFreshnessService.refresh()` has completed
- **AND** the response MUST include the reconciliation summary from that rebuild

#### Scenario: DELETE on a hash with no active override is a no-op

- **WHEN** a `DELETE` is submitted for an `id_hash` with no active override
- **THEN** the response MUST report `applied: 0`
- **AND** no derived-chain rebuild MUST be triggered

#### Scenario: An unknown id_hash returns 404

- **WHEN** a `PUT` or `DELETE` targets an `id_hash` that does not match any `spot_transactions` row
- **THEN** the response MUST be a 404

### Requirement: Ledgers Edit Dialog UX And Cache Invalidation

The Ledgers (spot) edit dialog SHALL show the transaction's original values beside its editable fields and the lots that transaction creates or consumes as a read-only panel. Save and Restore SHALL be disabled with a loading indicator for the whole duration of the request, including the derived-chain rebuild. On success, the dialog SHALL trigger cache invalidation covering the Ledgers table itself in addition to the existing derived-fiscal-data invalidation.

#### Scenario: Loading state spans the full save request including rebuild

- **WHEN** a user submits an edit
- **THEN** the Save and Restore controls MUST be disabled and show a loading indicator from submission until the response, including the server-side rebuild
- **AND** the dialog MUST NOT be dismissible while the request is pending

#### Scenario: A successful save refreshes the Ledgers table

- **WHEN** an edit save succeeds
- **THEN** the Ledgers (spot) transactions query cache MUST be invalidated
- **AND** the fiscal-integrity, tax-report, token-history, portfolio and metrics caches MUST also be invalidated

#### Scenario: A negative-balance warning keeps the dialog open

- **WHEN** a save succeeds with `balanceCheck.kind === 'NEGATIVE_BALANCE'`
- **THEN** a warning toast MUST be shown
- **AND** a persistent alert listing the affected asset, account and shortfall MUST appear inside the dialog
- **AND** the dialog MUST remain open

#### Scenario: A field-level validation error is mapped to its field

- **WHEN** the server returns a 422 with a field-scoped error
- **THEN** the corresponding form field MUST show the inline error
- **AND** any other error MUST be shown as a form-level alert without closing the dialog

