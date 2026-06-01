# mock-adapters Specification

## Requirements

### Requirement: Offline development capability

The system SHALL provide a `MockCryptoAdapter` that implements `ICryptoPortfolioRepository` and returns realistic, hardcoded dummy data for offline UI development.

#### Scenario: Fetching portfolio offline

- **WHEN** the UI requests portfolio assets using the mock adapter
- **THEN** the system simulates network latency and returns a pre-defined array of `CryptoAssetEntity`

## MODIFIED Requirements

### Requirement: Offline development capability

The system SHALL provide mock adapters that implement their corresponding repository interfaces and return realistic, hardcoded dummy data for offline UI development. `MockTaxAdapter` MUST implement all methods defined by `ITaxRepository` including `uploadTaxFile` and `deleteAllTransactions`. Its internal state MUST be mutable so that write operations are observable through `getTransactions()`.

#### Scenario: Fetching portfolio offline

- **WHEN** the UI requests portfolio assets using the mock adapter
- **THEN** the system simulates network latency and returns a pre-defined array of `CryptoAssetEntity`

#### Scenario: MockTaxAdapter seed dataset covers all transaction types

- **WHEN** `getTransactions()` is called on a freshly constructed `MockTaxAdapter`
- **THEN** the returned array SHALL contain at least one transaction of each type: `BUY`, `SELL`, `DEPOSIT`, `WITHDRAWAL`, `FEE`, `TRANSFER_IN`, `TRANSFER_OUT`, `AIRDROP`, `REWARD`, `SWAP`, `MIGRATION_SWAP`
- **AND** SHALL include transactions from at least two fiscal years (2024, 2025)
- **AND** SHALL include transactions from at least three exchanges (`Kraken`, `Bitvavo`, `Phantom`)

#### Scenario: MockTaxAdapter seed covers invalid transactions

- **WHEN** `getInvalidTransactions()` is called
- **THEN** the returned array SHALL contain at least 3 transactions with edge-case data: missing price, zero amount, and unrecognized symbol

#### Scenario: MockTaxAdapter getReport returns realistic 2024 data with auditTrail

- **WHEN** `getReport(2024, 'FIFO')` is called
- **THEN** the returned `TaxReportEntity` SHALL have non-zero `capitalGainsEur`, non-zero `feeEur`, and an `auditTrail` array with at least 5 `TaxLotHistoryEvent` entries

#### Scenario: deleteTransaction mutates internal state

- **WHEN** `deleteTransaction('tx-mock-001')` is called on `MockTaxAdapter`
- **THEN** a subsequent `getTransactions()` call SHALL NOT include the deleted transaction

#### Scenario: uploadTaxFile with Kraken Spot CSV populates state

- **WHEN** `uploadTaxFile(krakenSpotFile)` is called with a valid Kraken Spot CSV `File` object
- **THEN** `getTransactions()` SHALL return the parsed entities merged with the existing seed (or replace, per implementation decision)
- **AND** at least one `BUY` or `SELL` entity SHALL be present from the parsed data

#### Scenario: uploadTaxFile with unknown format throws TaxOperationError

- **WHEN** `uploadTaxFile(file)` is called with a CSV file whose headers don't match any known exchange format
- **THEN** the adapter SHALL throw a `TaxOperationError` with `code: 'UPLOAD_FAILED'`

#### Scenario: deleteAllTransactions clears state

- **WHEN** `deleteAllTransactions()` is called on `MockTaxAdapter`
- **THEN** a subsequent `getTransactions()` call SHALL return an empty array
