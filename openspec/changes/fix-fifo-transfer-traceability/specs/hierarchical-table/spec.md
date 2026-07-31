## MODIFIED Requirements

### Requirement: Render 3-Level Table
The system SHALL display a dynamic data table with three levels of data: Holding Summary, Lots Breakdown, and Lot History. The Level 2 lot rows SHALL render the canonical `OPEN | PARTIAL | CLOSED` status received from the backend and SHALL NOT recompute or re-label it locally. Level 2 SHALL additionally display the accounts currently holding the lot when they differ from its acquiring venue, marking synthetic custody accounts distinctly. Level 3 event rows SHALL render each event's real `disposalType` rather than a universal sale label, and SHALL render custody movements as non-taxable relocations.

#### Scenario: Display main holding rows
- **WHEN** the portfolio data is loaded
- **THEN** the table displays Level 1 rows representing each asset's aggregated balance, average cost, current value, performance, and locations.

#### Scenario: Expand to Lots Breakdown
- **WHEN** the user clicks the expander icon on a Level 1 row
- **THEN** the table fetches and displays the Level 2 rows (Open Tax Lots) directly beneath the main row, showing Date, Qty, Cost Unit, and Status.

#### Scenario: Expand to Lot History
- **WHEN** the user clicks the toggle icon on a Level 2 lot row
- **THEN** the table conditionally renders Level 3 rows (Event History) for that lot, displaying past disposal events, P&L, and tax status.

#### Scenario: Open lot is labelled as open

- **WHEN** a Level 2 row carries `status = 'OPEN'`
- **THEN** the badge MUST read the "open" label
- **AND** the badge MUST NOT use the `profit` variant

#### Scenario: Closed lot is labelled as closed

- **WHEN** a Level 2 row carries `status = 'CLOSED'`
- **THEN** the badge MUST read the "closed/sold" label
- **AND** the row MUST NOT be presented as an open position

#### Scenario: Status is not derived from quantities in the component

- **WHEN** `ExpandedLotsTable.vue` is inspected
- **THEN** it MUST NOT contain a local status derivation comparing `remainingQty` against `originalQty`
- **AND** it MUST consume `lot.status` directly

#### Scenario: Split custody across accounts is shown

- **WHEN** a lot acquired on `Kraken:spot` has 100 units in `Binance` and 79.11 in `ownwallet-XRP`
- **THEN** the Level 2 row MUST display both holding accounts with their quantities
- **AND** MUST retain the acquiring venue as the acquisition location
- **AND** MUST mark the synthetic account distinctly from a real one

#### Scenario: Sub-wallet custody is visible

- **WHEN** part of a lot is held in `Kraken:earn`
- **THEN** the Level 2 row MUST show that the quantity is in the staking sub-wallet

#### Scenario: Fee disposal is not presented as a sale

- **WHEN** a Level 3 event carries `disposalType = 'FEE'`
- **THEN** the row MUST render a fee indicator
- **AND** MUST NOT render a `SELL` label

#### Scenario: Custody movement is rendered as non-taxable

- **WHEN** a Level 3 row represents a custody relocation
- **THEN** it MUST show the origin and destination accounts
- **AND** MUST show no gain or loss figure
- **AND** MUST be marked non-taxable

### Requirement: Visual Cues for Tax Status
The system SHALL display badges and tooltips to explain specific tax events (e.g., Tax-Loss Harvesting opportunities, non-taxable events). Data-quality flags received from the backend SHALL be surfaced on the affected rows with their severity, no tax-optimisation suggestion SHALL be shown for a lot whose cost basis is flagged as unreliable, and values that were manually assigned SHALL be visually distinguishable from market-sourced values.

#### Scenario: Identify non-taxable event
- **WHEN** an event is marked as `is_taxable=false`
- **THEN** the system displays a ShieldCheck icon and a tooltip explaining LIRPF Art. 33.1 rules.

#### Scenario: Flagged lot suppresses the tax-loss suggestion

- **WHEN** a lot carries `qualityFlag = 'MISSING_PRICE'` or `qualityFlag = 'NEGATIVE_COST_BASIS'`
- **THEN** the tax-loss-harvesting indicator MUST NOT be rendered for that lot
- **AND** a data-quality warning indicator MUST be rendered instead

#### Scenario: Loss detection requires a trustworthy basis

- **WHEN** a lot's `unitCost` is zero or negative
- **THEN** the component MUST NOT classify the lot as profitable or in-loss
- **AND** MUST render the data-quality indicator

#### Scenario: Pending row offers value assignment

- **WHEN** a lot or event is pending manual valuation
- **THEN** the row MUST expose an affordance to assign the value
- **AND** the mutation MUST be submitted through a Pinia Colada `useMutation` composable

#### Scenario: Manually assigned value is visually distinct

- **WHEN** a displayed figure originated from a manual assignment
- **THEN** it MUST carry an indicator distinguishing it from a market-sourced value
- **AND** the indicator MUST expose the recorded note on hover

#### Scenario: Severity drives the visual weight

- **WHEN** flags of different severities are present on the same asset
- **THEN** the highest severity MUST determine the indicator's prominence
