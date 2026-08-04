## ADDED Requirements

### Requirement: Collateral Movements Are Recorded Outside The Position Tables

A currency movement that funds or converts futures collateral SHALL be recorded in a table of its own,
carrying account, movement type, currency, signed amount, spread and instant. Storing such a movement
in `futures_transactions` is FORBIDDEN: that table's `symbol` names a contract and its `tx_type` admits
position events only.

#### Scenario: A collateral conversion is persisted

- **WHEN** the 157 EUR↔USD `conversion` pairs of `kraken_futures.csv` are ingested
- **THEN** each leg MUST be persisted as a collateral movement with its own currency and signed amount
- **AND** no row MUST appear in `futures_transactions`
- **AND** no tax lot MUST be created or consumed

#### Scenario: The conversion spread is preserved

- **WHEN** a conversion leg carries a `conversion spread percentage`
- **THEN** that value MUST be stored on the movement, not discarded and not folded into the amount

#### Scenario: A cross-venue transfer whose counterpart is in another file

- **WHEN** the single `cross-exchange transfer` of 200 € is ingested
- **THEN** it MUST be persisted as a collateral movement into the `flex` account
- **AND** it MUST NOT be paired with any row in the same file
- **AND** the absence of its counterpart MUST be recorded rather than inferred

#### Scenario: No row is rejected for lacking a position

- **WHEN** the full `kraken_futures.csv` is ingested
- **THEN** the 315 rows rejected today MUST be persisted as collateral movements
- **AND** the 785 position rows MUST still be persisted as `futures_transactions`

### Requirement: Collateral Balance Is Readable Per Currency

The analytical engine SHALL expose the net collateral held per account and per currency, derived from
the signed movement amounts.

#### Scenario: A conversion nets to zero across currencies but not within one

- **WHEN** one EUR↔USD pair is read through the balance view
- **THEN** the EUR balance MUST fall by the EUR leg and the USD balance MUST rise by the USD leg
- **AND** neither leg MUST cancel the other within a single currency

#### Scenario: Position events do not appear in the collateral balance

- **WHEN** the balance view is read on a ledger containing trades, funding fees and liquidations
- **THEN** none of those MUST contribute to it
