## ADDED Requirements

### Requirement: Every Custody Movement Produces Balanced Double-Entry Records

Every crypto `WITHDRAWAL`, `TRANSFER_OUT`, `DEPOSIT`, and `TRANSFER_IN` SHALL produce balanced custody entries: one debit on the source account and one credit on the destination account, for the same asset and quantity. Custody tracking SHALL NOT depend on a time window, an amount-matching tolerance, or any pairing heuristic.

#### Scenario: Outbound movement debits source and credits destination

- **WHEN** 179.11 XRP leaves `Kraken:spot` via a `WITHDRAWAL`
- **THEN** a custody entry of `-179.11` MUST be recorded against `Kraken:spot`
- **AND** a custody entry of `+179.11` MUST be recorded against the resolved destination account
- **AND** the two entries MUST sum to zero for that asset

#### Scenario: Inbound movement debits source and credits destination

- **WHEN** 178.91 XRP arrives at `Ledger` via a `DEPOSIT`
- **THEN** a custody entry of `-178.91` MUST be recorded against the resolved source account
- **AND** a custody entry of `+178.91` MUST be recorded against `Ledger`

#### Scenario: Custody derivation is order-independent and idempotent

- **WHEN** the same set of transactions is processed in a different order
- **THEN** the resulting custody balances MUST be identical
- **AND** re-running materialisation over an unchanged ledger MUST produce byte-identical custody entries

#### Scenario: No time or amount heuristic appears in the implementation

- **WHEN** the custody views and adapters are inspected
- **THEN** they MUST NOT contain a time-window predicate, an amount-tolerance band, or a nearest-in-time tie-break used to associate two transaction legs
- **AND** custody attribution MUST derive solely from per-account balances

### Requirement: Synthetic `ownwallet-<ASSET>` Default Counterparty

When a custody movement's counterparty account cannot be determined, the system SHALL resolve it to a synthetic per-asset account named `ownwallet-<ASSET>`, created on demand and flagged `is_synthetic`. This account SHALL act as both sink and source, and SHALL accumulate lots that continue to follow the same allocation logic as any real account.

#### Scenario: Unknown destination resolves to the synthetic account

- **WHEN** a `WITHDRAWAL` of XRP has no recorded destination and no user override
- **THEN** the credit entry MUST target the account `ownwallet-XRP`
- **AND** that account MUST be created on demand with `is_synthetic = 1`

#### Scenario: Unknown source draws from the synthetic account

- **WHEN** a `DEPOSIT` of XRP has no recorded source and no user override
- **THEN** the debit entry MUST target `ownwallet-XRP`

#### Scenario: Lots accumulate in the synthetic account and remain traceable

- **WHEN** three separate withdrawals of XRP occur with no known destinations
- **THEN** `ownwallet-XRP` MUST hold the combined quantity
- **AND** each contributing lot MUST remain individually identifiable with its original acquisition date and unit cost

#### Scenario: Self-custody spanning years is representable

- **WHEN** an asset is withdrawn to an unknown destination and no matching deposit occurs for three years
- **THEN** the quantity MUST remain attributed to `ownwallet-<ASSET>` for the entire period
- **AND** the originating lot MUST remain `OPEN` with its original cost basis
- **AND** no expiry, timeout, or reconciliation failure MUST occur

#### Scenario: Synthetic accounts are excluded from user-facing selectors

- **WHEN** the account list is presented for CSV import or filtering
- **THEN** accounts with `is_synthetic = 1` MUST NOT appear
- **AND** they MUST still participate fully in custody arithmetic

### Requirement: Residual Balances Are Diagnostic and Signed

The balance of each `ownwallet-<ASSET>` account SHALL be treated as a diagnostic signal whose sign carries distinct meaning, and SHALL be surfaced rather than absorbed.

#### Scenario: Positive residual beyond fee scale is flagged

- **WHEN** the `ownwallet-XRP` balance is positive and exceeds the tolerance derived from the asset's recorded fee scale
- **THEN** it MUST be reported with flag `CUSTODY_RESIDUAL` at low severity
- **AND** the report MUST state the residual quantity and the asset

#### Scenario: Residual within fee scale is not flagged

- **WHEN** the residual equals the accumulated unrecorded network fees within tolerance
- **THEN** no flag MUST be raised

#### Scenario: Negative balance indicates an untracked inflow

- **WHEN** the `ownwallet-XRP` balance is negative, meaning more XRP arrived than ever left known accounts
- **THEN** it MUST be reported with flag `UNTRACKED_INFLOW` at high severity
- **AND** the report MUST state that a holding exists with no established cost basis

#### Scenario: Tolerance scales with the asset

- **WHEN** the tolerance is evaluated for an asset whose unit value differs by orders of magnitude from another
- **THEN** it MUST be expressed relative to that asset's recorded fees, not as a shared absolute constant

### Requirement: Lots Are Never Split, Re-dated, or Relocated

A lot SHALL remain exactly one row per acquisition. Custody movements SHALL NOT create new lot rows, SHALL NOT alter `original_qty`, `remaining_qty`, `unit_cost_fiat`, `total_cost_fiat`, or `acquisition_timestamp`, and SHALL NOT change `exchange_location`, which denotes the acquiring venue.

#### Scenario: Partial movement distributes custody without splitting the lot

- **WHEN** 100 of a 179.11 XRP lot are moved to another account
- **THEN** the lot MUST remain a single row with `original_qty = 179.11`
- **AND** custody MUST show 100 in the destination and 79.11 in the source
- **AND** no second lot row MUST be created

#### Scenario: Acquisition date and cost survive relocation

- **WHEN** a lot acquired on `Kraken:spot` at `1.6724 €/XRP` on 2025-12-15 is moved twice
- **THEN** `unit_cost_fiat` MUST remain `1.6724`
- **AND** `acquisition_timestamp` MUST remain 2025-12-15
- **AND** `exchange_location` MUST remain `Kraken:spot`

#### Scenario: Movement does not consume the lot

- **WHEN** a lot's entire quantity is moved to another account
- **THEN** its `remaining_qty` MUST be unchanged
- **AND** its `status` MUST remain `OPEN`
- **AND** no `lot_history_event` MUST be produced

#### Scenario: Holding period is measured from acquisition

- **WHEN** an asset is bought, moved across two accounts, and later sold
- **THEN** the resulting disposal MUST compute the holding period from the original acquisition date, not from any movement date

### Requirement: Custody Allocation FIFO Is Independent of Taxation FIFO

The system SHALL maintain two distinct orderings: taxation FIFO, global per asset, determining which lot a disposal consumes; and custody allocation FIFO, scoped per `(account, asset)`, determining which lot's quantity moves. Custody allocation SHALL have no fiscal effect.

#### Scenario: Custody allocation draws from the oldest lot held in that account

- **WHEN** 100 XRP leave `Kraken:spot`, which custodies a 2025-12-15 lot and a 2026-01-25 lot
- **THEN** the moved quantity MUST be drawn from the 2025-12-15 lot first

#### Scenario: Taxation FIFO remains global and unaffected

- **WHEN** BTC is bought on `Kraken:spot`, moved to `Binance`, and sold on `Binance`
- **THEN** the disposal MUST consume the globally oldest BTC lot at its original cost basis
- **AND** the matching MUST NOT be partitioned by account

#### Scenario: Custody allocation emits no fiscal records

- **WHEN** custody allocation runs
- **THEN** it MUST NOT emit any `lot_history_event`
- **AND** it MUST NOT modify any lot's `remaining_qty` or `status`
- **AND** it MUST NOT alter the taxation FIFO queue order

#### Scenario: Allocation is computed in the analytical engine

- **WHEN** custody allocation is implemented
- **THEN** the sequential allocation MUST be performed in DuckDB using a recursive CTE
- **AND** it MUST NOT be implemented as a row-by-row loop in the application layer

### Requirement: Current Custody Location View

The system SHALL expose a view resolving, for each lot, the account currently holding each portion of its quantity, and a view exposing per-account custody balances per asset.

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
