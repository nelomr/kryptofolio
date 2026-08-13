# Mock Adapters Specification

## Purpose

Adapters that keep the app fully usable offline.

## Requirements

### Requirement: Offline development capability
The system SHALL provide mock adapters (`MockTaxAdapter`, `MockWalletRepository`, etc.) that implement their corresponding repository interfaces but use the Hono RPC client to fetch realistic dummy data from the BFF for offline UI development. Its internal state for write operations MAY be mutable within the BFF to allow observable updates.

#### Scenario: Fetching portfolio offline
- **WHEN** the UI requests portfolio assets using the mock adapter
- **THEN** the adapter calls the BFF `/api/wallets` and `/api/summary` endpoints and returns the array of `CryptoAssetEntity`

#### Scenario: MockTaxAdapter seed dataset covers all transaction types
- **WHEN** `getTransactions()` is called on a freshly constructed `MockTaxAdapter`
- **THEN** the adapter calls the BFF `/api/transactions` endpoint and the returned array SHALL contain at least one transaction of each type
- **AND** SHALL include transactions from at least two fiscal years (2024, 2025)
- **AND** SHALL include transactions from at least three exchanges (`Kraken`, `Bitvavo`, `Phantom`)

#### Scenario: MockTaxAdapter seed covers invalid transactions
- **WHEN** `getInvalidTransactions()` is called
- **THEN** the adapter calls the BFF and the returned array SHALL contain at least 3 transactions with edge-case data: missing price, zero amount, and unrecognized symbol

#### Scenario: MockTaxAdapter getReport returns realistic 2024 data with auditTrail
- **WHEN** `getReport(2024, 'FIFO')` is called
- **THEN** the adapter calls the BFF `/api/tax` endpoint and the returned `TaxReportEntity` SHALL have non-zero `capitalGainsEur`, non-zero `feeEur`, and an `auditTrail` array with at least 5 `TaxLotHistoryEvent` entries

#### Scenario: deleteTransaction mutates internal state
- **WHEN** `deleteTransaction('tx-mock-001')` is called on `MockTaxAdapter`
- **THEN** it sends a DELETE request to the BFF, and a subsequent `getTransactions()` call SHALL NOT include the deleted transaction

#### Scenario: uploadTaxFile with Kraken Spot CSV populates state
- **WHEN** `uploadTaxFile(krakenSpotFile)` is called with a valid Kraken Spot CSV `File` object
- **THEN** it sends the file to the BFF, and `getTransactions()` SHALL return the parsed entities merged with the existing seed
- **AND** at least one `BUY` or `SELL` entity SHALL be present from the parsed data

#### Scenario: uploadTaxFile with unknown format throws TaxOperationError
- **WHEN** `uploadTaxFile(file)` is called with a CSV file whose headers don't match any known exchange format
- **THEN** the adapter SHALL throw a `TaxOperationError` with `code: 'UPLOAD_FAILED'` based on the BFF response

#### Scenario: deleteAllTransactions clears state
- **WHEN** `deleteAllTransactions()` is called on `MockTaxAdapter`
- **THEN** it sends a request to the BFF, and a subsequent `getTransactions()` call SHALL return an empty array
