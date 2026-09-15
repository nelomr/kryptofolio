## MODIFIED Requirements

### Requirement: Current Custody Location View

The system SHALL expose a view resolving, for each lot, the account currently holding each portion of its quantity, and a view exposing per-account custody balances per asset. The custody relations SHALL remain views and SHALL NOT be materialised as tables. The query that builds the holdings snapshot's `portfolioLocations` SHALL apply a deterministic total ordering, so the same materialised state always yields the same array order. That ordering is a **presentation** ordering only: it SHALL be applied in the presentation query and SHALL NEVER enter a FIFO relation or reorder the global per-asset taxation queue.

#### Scenario: Resolving current holder after two hops

- **WHEN** a lot moves `Kraken:spot` → `ownwallet-XRP` → `Ledger`
- **THEN** the custody view MUST report `Ledger` as the current holder of the moved quantity
- **AND** `tax_lots.exchange_location` MUST continue to report `Kraken:spot`

#### Scenario: Custody totals reconcile with account balances

- **WHEN** custody is aggregated by account and asset
- **THEN** the totals MUST equal each account's on-ledger balance for that asset within the configured precision tolerance
- **AND** a mismatch MUST be reported with flag `CUSTODY_IMBALANCE`

#### Scenario: Sub-wallet custody is distinguishable

- **WHEN** XRP is moved from `Kraken:spot` to `Kraken:earn` for staking
- **THEN** the custody view MUST report the quantity under `Kraken:earn`
- **AND** the free balance under `Kraken:spot` MUST be reduced accordingly
- **AND** roll-up to the parent `Kraken` account MUST show the unchanged total

#### Scenario: `portfolioLocations` order is stable across calls

- **WHEN** `getHoldingsSnapshot()` is called twice over the same materialised state, with no ledger mutation in between
- **THEN** each holding's `portfolioLocations` array MUST be returned in an identical order
- **AND** the ordering MUST come from an explicit `ORDER BY` over a total, non-null key, not from the relation's incidental emission order

#### Scenario: Custody relations stay views

- **WHEN** the analytical catalogue is inspected after a derived-chain rebuild
- **THEN** the custody relations MUST still be views over the ledger and the derived chain
- **AND** no `m_` table MUST exist for a custody relation

#### Scenario: The presentation ordering never reaches the tax queue

- **WHEN** the deterministic `portfolioLocations` ordering is applied
- **THEN** it MUST appear only in the holdings-snapshot presentation query
- **AND** the taxation FIFO MUST remain `PARTITION BY asset_id ORDER BY timestamp, tx_id`, unpartitioned by account and byte-identical to its prior definition
