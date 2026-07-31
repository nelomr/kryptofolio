## ADDED Requirements

### Requirement: Fiat Magnitudes Are Sign-Normalised at Ingestion

`CsvIngestionUseCase` SHALL persist `total_fiat` and `price_fiat` as non-negative magnitudes, applying `.abs()` symmetrically with the treatment already applied to `amount_in` and `amount_out`. Transaction direction SHALL be carried by `tx_type` and the directional asset fields only.

#### Scenario: Kraken BUY row with a negative EUR cost leg

- **WHEN** a source row yields `total_fiat = -299.70` for a `BUY` of 247.10551 XRP
- **THEN** the persisted `total_fiat` MUST be `299.70`
- **AND** the derived `unit_cost_fiat` MUST be positive

#### Scenario: Persistence layer rejects negative fiat magnitudes

- **WHEN** an attempt is made to insert a `spot_transactions` row with a negative `total_fiat` or `price_fiat`
- **THEN** the SQLite `CHECK` constraint MUST reject the write

#### Scenario: Sign normalisation is applied via the precision value object

- **WHEN** fiat magnitudes are normalised
- **THEN** the computation MUST use `Decimal` / `PreciseAmount` arithmetic
- **AND** native JavaScript `number` arithmetic MUST NOT be used

### Requirement: Unknown Transaction Types Fail Loudly

`toSpotTxType()` SHALL NOT default an unrecognised source value to `'BUY'` or to any other type. An unmapped value SHALL raise a controlled ingestion error naming the offending value and the source row's timestamp.

#### Scenario: Unrecognised source type is rejected

- **WHEN** a CSV row carries `tx_type = 'LIQUIDATION_TRANSFER'` with no mapping
- **THEN** ingestion of that row MUST fail with an error naming the value
- **AND** no `spot_transactions` row MUST be written for it
- **AND** the failure MUST NOT be silently converted into a `BUY` acquisition

#### Scenario: Rejected row does not silently vanish through the policy join

- **WHEN** an unmapped type would otherwise be excluded by the FIFO event policy
- **THEN** the row MUST be reported as rejected at ingestion time rather than persisted and silently ignored downstream

#### Scenario: Batch reports rejected rows without aborting valid ones

- **WHEN** a batch contains both mappable and unmappable rows
- **THEN** the use case MUST report the rejected rows with their reasons in its result
- **AND** MUST persist the valid rows

### Requirement: Deterministic Parser Transaction Identity

CSV parsers SHALL derive transaction identifiers deterministically from source fields. Non-deterministic sources such as `Math.random()` SHALL NOT contribute to any identifier, as this defeats the ledger's `id_hash` idempotency guarantee and makes re-ingestion unsafe.

#### Scenario: Kraken row lacking both txid and refid

- **WHEN** `KrakenSpotCsvParser` encounters a row with neither `txid` nor `refid`
- **THEN** it MUST derive the identifier from a deterministic hash of the row's content
- **AND** re-parsing the same file MUST produce the identical identifier

#### Scenario: Re-importing the same file creates no duplicates

- **WHEN** an identical CSV file is imported twice
- **THEN** the second import MUST insert zero new `spot_transactions` rows

#### Scenario: Manual overrides survive re-ingestion

- **WHEN** a manual override was authored against a transaction and the source CSV is re-ingested
- **THEN** the override MUST still apply, because the transaction identity is unchanged

### Requirement: Sub-Account Resolution From the Source Wallet Column

The ingestion pipeline SHALL resolve each transaction to the correct child account when the source provides a wallet designation, creating the venue parent and child accounts as needed.

#### Scenario: Kraken earn wallet resolves to a child account

- **WHEN** a Kraken row carries `wallet = 'earn'` for the venue `Kraken`
- **THEN** the transaction's `account_id` MUST reference the `Kraken:earn` child account
- **AND** that account MUST have `parent_account_id` referencing `Kraken`

#### Scenario: Absent wallet designation falls back to the venue

- **WHEN** a source row provides no wallet designation
- **THEN** the transaction MUST be attributed to the venue account
- **AND** no child account MUST be fabricated

#### Scenario: Sub-account resolution is deterministic

- **WHEN** the same file is ingested twice
- **THEN** the resolved account identifiers MUST be identical across both runs

### Requirement: Fiat Price Fallback Is Explicit About Failure

When the historical price provider cannot resolve a value, `CsvIngestionUseCase` SHALL persist the transaction with unresolved fiat magnitudes recorded as unresolved rather than as `0`, so that downstream flagging can distinguish "worth nothing" from "unknown".

#### Scenario: Price provider returns no value for a STAKING reward

- **WHEN** the historical price cannot be resolved for a `STAKING` receipt
- **THEN** the transaction MUST be persisted with its fiat magnitudes marked unresolved
- **AND** the derived lot MUST be flagged `MISSING_PRICE`
- **AND** the acquisition MUST NOT silently receive a `0` cost basis presented as genuine

#### Scenario: Currency mismatch between fee and transaction is recorded

- **WHEN** a row's resolved `fiat_currency` differs from its `fee_currency` and no conversion rate is available
- **THEN** the transaction MUST be persisted and its derived events flagged `CURRENCY_MISMATCH`
- **AND** ingestion MUST NOT mix the two currencies into a single arithmetic result

#### Scenario: Unresolved price does not block the batch

- **WHEN** many rows in a batch have unresolvable prices
- **THEN** ingestion MUST complete and persist them
- **AND** the result MUST report the count pending manual review
