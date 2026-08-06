## MODIFIED Requirements

### Requirement: Canonical Data-Quality Flag Vocabulary

The `@kryptofolio/shared-types` package SHALL export `FIFO_QUALITY_FLAGS` as the single source of truth for data-quality values: `MISSING_PRICE`, `MISSING_FX_RATE`, `CURRENCY_MISMATCH`, `CUSTODY_RESIDUAL`, `UNTRACKED_INFLOW`, `CUSTODY_IMBALANCE`, `NEGATIVE_COST_BASIS`, `ORPHAN_LOT`, `UNKNOWN_TX_TYPE`. The `lot_history_events.quality_flag` column SHALL be constrained to this vocabulary or `NULL`.

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

#### Scenario: A missing rate ranks as a resolvable reference-data gap

- **WHEN** `MISSING_FX_RATE` is reported
- **THEN** its severity MUST equal that of `MISSING_PRICE`, because both mean a figure is unknown for want of reference data rather than wrong

### Requirement: Unresolvable Events Are Non-Taxable and Flagged

A disposal event whose fiat valuation cannot be determined SHALL be emitted with `is_taxable = 0` and the corresponding flag, and SHALL be excluded from every tax-base aggregation. It SHALL NOT be silently dropped.

#### Scenario: Missing-price fee disposal is excluded from the tax base

- **WHEN** a fee disposal cannot be valued
- **THEN** the event MUST be present in the calculated events with `is_taxable = 0` and `quality_flag = 'MISSING_PRICE'`
- **AND** `getSpanishTaxReport` MUST exclude it from `spotCapitalGains`
- **AND** the event MUST remain visible in the audit trail

#### Scenario: A currency difference is converted, not flagged

- **WHEN** a transaction's `fiat_currency` is `EUR` while its `fee_asset_id` or resolved price series is denominated in `USD`, and a `USD/EUR` rate is resolvable at the transaction's date
- **THEN** the value MUST be converted into the reporting currency per the `fifo-fx-conversion` capability
- **AND** the derived events MUST carry no currency-related quality flag and MUST remain taxable
- **AND** the basis MUST NOT be masked to `0`

#### Scenario: Currency mismatch survives only where conversion is impossible

- **WHEN** a currency difference exists and no rate can be resolved for the pair and date
- **THEN** the derived events MUST carry `quality_flag = 'MISSING_FX_RATE'` and `is_taxable = 0`
- **AND** `CURRENCY_MISMATCH` MUST be reserved for a currency disagreement that conversion cannot address at all — a manual price override stated in a currency other than the transaction's

#### Scenario: Aggregations cannot absorb a NULL into a total

- **WHEN** tax-base totals are computed
- **THEN** they MUST filter on `is_taxable = 1`
- **AND** the count of excluded flagged rows MUST be reported alongside the total
