# Tax Audit Report Specification

## Purpose

Detailed FIFO lot traceability for the audit trail.
## Requirements
### Requirement: Display detailed FIFO lot traceability

The system SHALL display a detailed table representing the audit trail of tax lot history events. The audit trail SHALL distinguish taxable disposals from non-taxable custody movements, SHALL show each event's real `disposalType` rather than a universal sale label, and SHALL show the acquiring venue alongside the account where the disposal occurred. Events excluded from the tax base SHALL display their quality flag and the reason for exclusion, and figures that were manually assigned SHALL be marked as such.

#### Scenario: Displaying empty states

- **WHEN** there is no data available for the selected year (and FIFO method)
- **THEN** the system displays a fluid empty state message (e.g., "No hay datos disponibles")

#### Scenario: Displaying loading states

- **WHEN** the data is being fetched or recalculated
- **THEN** the system displays a loading state animation (e.g., "Generando Libro de Auditoría...")

#### Scenario: Fee disposal is distinguishable from a sale

- **WHEN** an audit row originates from a crypto network fee
- **THEN** it MUST display the `FEE` provenance
- **AND** MUST NOT be presented as a sale

#### Scenario: Custody movement appears as non-taxable

- **WHEN** a lot was relocated between the user's own accounts during the fiscal year
- **THEN** the audit trail MUST show the movement with origin and destination accounts
- **AND** MUST show no gain or loss figure for it
- **AND** MUST mark it non-taxable

#### Scenario: Movement to a synthetic account is identified

- **WHEN** a movement's counterparty is a synthetic `ownwallet-<ASSET>` account
- **THEN** the audit row MUST identify the destination as unresolved self-custody
- **AND** MUST offer the path to declare the real account

#### Scenario: Excluded events state their reason

- **WHEN** an event carries a data-quality flag and is non-taxable
- **THEN** the audit row MUST display the flag with an i18n-resolved explanation
- **AND** MUST indicate that the event does not contribute to the declared base

#### Scenario: Manually assigned figures are marked

- **WHEN** an audit row's value originated from a manual price assignment
- **THEN** the row MUST be marked as manually assigned
- **AND** the recorded note MUST be retrievable

#### Scenario: Report states how many figures were manually assigned

- **WHEN** a fiscal year's report includes manually assigned values
- **THEN** the report MUST display the count of such figures

#### Scenario: Holding period reflects the original acquisition

- **WHEN** a disposed lot had been moved between accounts before the sale
- **THEN** the audit row MUST show the original acquisition date, not any movement date

#### Scenario: Sale-free fiscal year declares zero spot gains

- **WHEN** the selected fiscal year contains custody movements and fee disposals but no `SELL` or `SWAP` transactions
- **THEN** the report's spot capital-gains figure MUST be the sum of valued fee disposals only
- **AND** MUST NOT include any amount derived from transferred principals

### Requirement: Ledgers Rows With An Active Edit Override Are Marked And Restorable

The Ledgers (spot) table's edit CTA SHALL open the spot-transaction edit dialog for the selected row. A row carrying an active `spot_transaction_overrides` entry SHALL be visibly marked as edited, and SHALL offer a restore-to-original action from the same row.

#### Scenario: Edit CTA opens the edit dialog

- **WHEN** a user activates the pencil CTA on a Ledgers (spot) row
- **THEN** the spot-transaction edit dialog MUST open for that row's `id_hash`
- **AND** it MUST NOT show a disabled-feature notice

#### Scenario: A row with an active override is marked as edited

- **WHEN** the Ledgers (spot) table renders a row whose `id_hash` has an active `spot_transaction_overrides` entry
- **THEN** that row MUST display an edited indicator
- **AND** a row with no active override MUST NOT display it

#### Scenario: An edited row offers restore-to-original

- **WHEN** a user opens the edit dialog for a row marked as edited
- **THEN** a restore-to-original action MUST be available
- **AND** activating it MUST revert the row to its originally imported values and clear the edited indicator

