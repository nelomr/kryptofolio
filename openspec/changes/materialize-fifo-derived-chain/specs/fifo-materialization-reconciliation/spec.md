## ADDED Requirements

### Requirement: Query-Time Sources Are Declared, Never Hedged Against Materialiser Lag

`OPEN_LOTS_WITH_QUALITY` and `REALIZED_EVENTS` SHALL NOT `UNION ALL` a live FIFO recomputation against the materialised SQLite tables as a hedge against the materialiser lagging behind the ledger. That state is unreachable, because a read is served only after the derived chain has been rebuilt and committed. Source selection SHALL be declared in the relation's definition, and SHALL NOT be decided at query time by comparing a build stamp against the ledger, nor by counting rows in a materialised table.

#### Scenario: The lag hedge is gone

- **WHEN** the definitions of the open-lot and realized-event relations are inspected
- **THEN** they MUST contain no branch predicated on `(SELECT COUNT(*) FROM ledger.lot_history_events) = 0` or any equivalent emptiness test used to select a source
- **AND** they MUST contain no live FIFO recomputation executed per query

#### Scenario: No build-stamp predicate is introduced

- **WHEN** the derived-chain build stamp is used
- **THEN** it MUST serve only observability and the freshness state
- **AND** it MUST NOT appear as a predicate in any query-time source-selection branch

#### Scenario: Removing the hedge changes no figure

- **WHEN** the KPI, fiscal report and lot/event payloads are produced before and after the hedge is removed, over the same committed ledger state
- **THEN** the payloads MUST be identical, with every decimal compared as an exact string

### Requirement: Non-Derived Tax Lots Are a Declared Source Computed Once Per Rebuild

Tax lots in `ledger.tax_lots` that carry `spot_transaction_id IS NULL` are not derivable from a spot transaction and therefore cannot be produced by the FIFO chain. They SHALL be exposed as an explicit relation `v_external_tax_lots` and unioned into the **definition** of the materialised open-lot relation, so they are computed once per rebuild rather than once per query. Their presence or absence in any particular ledger SHALL be established by counting them against the real ledger, not assumed.

#### Scenario: External lots appear in the open-lot relation

- **WHEN** a tax lot exists in `ledger.tax_lots` with `spot_transaction_id IS NULL` and a non-zero remaining quantity
- **THEN** it MUST appear in the materialised open-lot relation after a rebuild
- **AND** it MUST carry the same columns and quality flags as a FIFO-derived lot

#### Scenario: The relation is declared even when it matches no row today

- **WHEN** `SELECT COUNT(*) FROM ledger.tax_lots WHERE spot_transaction_id IS NULL` returns zero for the ledger under test
- **THEN** `v_external_tax_lots` MUST still exist and still be unioned into the definition
- **AND** the equivalence test MUST record explicitly that this source is not covered by live rows

#### Scenario: External lots do not enter the tax FIFO ordering

- **WHEN** external lots are unioned into the open-lot relation
- **THEN** the `PARTITION BY asset_id ORDER BY timestamp, tx_id` ordering of the FIFO matching relation MUST be unchanged
- **AND** no external lot MUST alter which acquisition a disposal is matched against
