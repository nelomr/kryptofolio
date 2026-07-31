## ADDED Requirements

### Requirement: No Invented Numeric Defaults

The FIFO views SHALL NOT substitute a fabricated numeric value for missing market data. `COALESCE(<price>, 1.0)` and `COALESCE(<price>, 0.0)` over historical price lookups are STRICTLY FORBIDDEN. Unresolved prices SHALL propagate as `NULL`.

#### Scenario: Fee asset has no historical price

- **WHEN** a crypto fee is denominated in an asset with no row in `historical_prices` at or before the transaction date
- **THEN** the emitted fee disposal's `sale_price_fiat` MUST be `NULL`, not `1.0`
- **AND** its `gain_loss_fiat` MUST be `NULL`, not a value computed from a fabricated price

#### Scenario: No fabricated-price COALESCE survives in the views

- **WHEN** the SQL text of the FIFO views is inspected
- **THEN** no `COALESCE` over a `historical_prices` column with a non-zero, non-null literal MUST be present
- **AND** an automated test MUST assert this over the definitions returned by `duckdb_views()`

### Requirement: Data-Quality Flags Are Separate From Fiscal Classification Flags

Data-quality defects and fiscal classifications SHALL occupy separate, independently typed columns and vocabularies. The pre-existing `lot_history_events.flag` column SHALL retain its fiscal-classification meaning, including the live `WALLET_ACTIVATION` value used for the AEAT audit trail. Data-quality defects SHALL be carried in a new `quality_flag` column. Merging the two vocabularies is FORBIDDEN, because an operation can simultaneously be a legitimate classified event and carry a valuation defect.

#### Scenario: Existing fiscal classification is preserved

- **WHEN** a Tangem wallet-activation operation is ingested and derived
- **THEN** its event MUST retain `flag = 'WALLET_ACTIVATION'`
- **AND** the AEAT audit-trail behaviour that depends on it MUST continue to function unchanged

#### Scenario: A single event can carry both a classification and a defect

- **WHEN** a wallet-activation operation also has an unresolvable price
- **THEN** the event MUST carry `flag = 'WALLET_ACTIVATION'` AND `quality_flag = 'MISSING_PRICE'`
- **AND** neither value MUST overwrite the other

#### Scenario: The two vocabularies do not overlap

- **WHEN** the fiscal-classification and data-quality vocabularies are compared
- **THEN** they MUST share no member
- **AND** a unit test MUST assert the intersection is empty

### Requirement: Canonical Data-Quality Flag Vocabulary

The `@kryptofolio/shared-types` package SHALL export `FIFO_QUALITY_FLAGS` as the single source of truth for data-quality values: `MISSING_PRICE`, `CURRENCY_MISMATCH`, `CUSTODY_RESIDUAL`, `UNTRACKED_INFLOW`, `CUSTODY_IMBALANCE`, `NEGATIVE_COST_BASIS`, `ORPHAN_LOT`, `UNKNOWN_TX_TYPE`. The `lot_history_events.quality_flag` column SHALL be constrained to this vocabulary or `NULL`.

#### Scenario: Quality-flag vocabulary is enforced at the persistence boundary

- **WHEN** a `lot_history_event` is materialised with a `quality_flag` value outside the vocabulary
- **THEN** the SQLite `CHECK` constraint MUST reject the write

#### Scenario: Quality flags are typed end to end

- **WHEN** `TaxLotHistoryEvent.qualityFlag` is inspected in the frontend domain model
- **THEN** it MUST be typed as the quality-flag union or `undefined`, never as `string`
- **AND** the existing `flag` field MUST remain separately typed as the fiscal-classification union

#### Scenario: Each quality flag carries a severity

- **WHEN** a quality flag is reported
- **THEN** it MUST carry a severity, with `UNTRACKED_INFLOW` and `NEGATIVE_COST_BASIS` at the highest level and `CUSTODY_RESIDUAL` at the lowest
- **AND** the severity MUST be defined once alongside the vocabulary, not per consumer

### Requirement: Unresolvable Events Are Non-Taxable and Flagged

A disposal event whose fiat valuation cannot be determined SHALL be emitted with `is_taxable = 0` and the corresponding flag, and SHALL be excluded from every tax-base aggregation. It SHALL NOT be silently dropped.

#### Scenario: Missing-price fee disposal is excluded from the tax base

- **WHEN** a fee disposal cannot be valued
- **THEN** the event MUST be present in the calculated events with `is_taxable = 0` and `quality_flag = 'MISSING_PRICE'`
- **AND** `getSpanishTaxReport` MUST exclude it from `spotCapitalGains`
- **AND** the event MUST remain visible in the audit trail

#### Scenario: Currency mismatch is detected

- **WHEN** a transaction's `fiat_currency` is `USD` while its `fee_asset_id` or resolved price series is denominated in `EUR`
- **THEN** the derived events MUST carry `quality_flag = 'CURRENCY_MISMATCH'` and `is_taxable = 0`
- **AND** conversion MUST NOT be attempted by this capability

#### Scenario: Aggregations cannot absorb a NULL into a total

- **WHEN** tax-base totals are computed
- **THEN** they MUST filter on `is_taxable = 1`
- **AND** the count of excluded flagged rows MUST be reported alongside the total

### Requirement: Negative and Zero Cost Basis Guard

The FIFO engine SHALL treat a negative acquisition cost basis as a data defect rather than a valid input. Lots with a negative `unit_cost_fiat` SHALL be flagged and excluded from gain computation.

#### Scenario: Negative unit cost is rejected, not amplified into a gain

- **WHEN** an acquisition yields `unit_cost_fiat < 0`
- **THEN** the lot MUST be flagged `quality_flag = 'NEGATIVE_COST_BASIS'`
- **AND** any disposal matching that lot MUST be emitted with `is_taxable = 0`
- **AND** the engine MUST NOT report a positive gain derived from the negative basis

#### Scenario: Zero-cost acquisition from a priced income event is legitimate

- **WHEN** an `AIRDROP` is received and a historical price IS available
- **THEN** the lot's `unit_cost_fiat` MUST be the market value at receipt and MUST NOT be flagged

#### Scenario: Zero-cost acquisition from missing data is flagged

- **WHEN** a `STAKING` acquisition has an unresolved fiat value
- **THEN** the lot MUST be flagged `MISSING_PRICE`
- **AND** a subsequent disposal against it MUST NOT report the full sale proceeds as gain

### Requirement: Custody Diagnostics Are Reported as Flags

Custody residuals and imbalances SHALL be reported through the same flag vocabulary and surface as valuation defects, so a single review surface covers all data quality.

#### Scenario: Positive synthetic-account residual is reported

- **WHEN** an `ownwallet-<ASSET>` balance is positive beyond the asset's fee-scale tolerance
- **THEN** it MUST be reported with `quality_flag = 'CUSTODY_RESIDUAL'` at low severity and the residual quantity

#### Scenario: Negative synthetic-account balance is reported at high severity

- **WHEN** an `ownwallet-<ASSET>` balance is negative
- **THEN** it MUST be reported with `quality_flag = 'UNTRACKED_INFLOW'` at high severity
- **AND** the detail MUST state that a holding exists with no established cost basis

#### Scenario: Custody totals diverging from account balances are reported

- **WHEN** aggregated custody per account and asset diverges from the on-ledger balance beyond the precision tolerance
- **THEN** it MUST be reported with `quality_flag = 'CUSTODY_IMBALANCE'`

### Requirement: Pending Review Surface With Manual Assignment

The system SHALL expose a data-quality view returning one row per defect with `quality_flag`, `severity`, `asset_id`, `account_id`, `tx_id`, `occurred_at`, and a human-readable `detail` key suitable for i18n resolution. Rows requiring a value SHALL be presented as pending review with an affordance to assign that value by hand. Flags SHALL never block a rebuild.

#### Scenario: Backend surfaces defects to the integrity endpoint

- **WHEN** the fiscal integrity endpoint is called
- **THEN** it MUST return the aggregated counts and rows from the data-quality view grouped by `quality_flag` and severity
- **AND** the payload MUST pass through a Zod DTO schema before reaching the UI

#### Scenario: Pending rows are counted and actionable

- **WHEN** rows are flagged `MISSING_PRICE`
- **THEN** the response MUST include a pending-review count
- **AND** each row MUST expose the transaction identity needed to assign a value

#### Scenario: Assigning a value clears the row from pending review

- **WHEN** the user assigns a manual value to a pending row and materialisation completes
- **THEN** that row MUST no longer appear in the pending-review set

#### Scenario: Flags do not prevent access to reports

- **WHEN** any number of rows are flagged
- **THEN** the portfolio view and the tax report MUST remain accessible
- **AND** the user MUST be notified of the pending count rather than blocked

#### Scenario: Clean ledger yields an empty result

- **WHEN** all transactions have resolvable prices, consistent currencies, balanced custody, and non-negative bases
- **THEN** the data-quality view MUST return zero rows
