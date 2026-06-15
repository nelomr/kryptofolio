## Purpose
Define requirements for CSV/XLSX transaction file ingestion and verification.
## Requirements
### Requirement: UI uses mutation for CSV upload
The system SHALL use `useUploadTaxFileMutation` when uploading a CSV file from the UI.

#### Scenario: Automatic refetch after upload
- **WHEN** the user uploads a CSV file via the UI
- **THEN** the system SHALL call the mutation and automatically invalidate the transactions query upon success, ensuring the table updates automatically

### Requirement: Exhaustive auto-mapping dictionary
The system SHALL correctly map standard export headers from Binance, Kraken, Coinbase, KuCoin, and Bitunix automatically without user intervention by defining their exact aliases in the mapping dictionary.

#### Scenario: Importing an exchange CSV file with exact headers
- **WHEN** the user uploads a CSV containing headers like `Date (UTC)`, `uid`, `trade price`, `Outgoing Asset`, `Change`
- **THEN** the system auto-assigns them to their respective internal mapped properties (`date`, `tx_id`, `price_fiat`, `asset_out`, `amount`) correctly.

### Requirement: Alphabetical target header mapping selection
The manual header mapping selection dropdown SHALL display available target mapping options in alphabetical order based on their translated labels.

#### Scenario: User clicks to manually map a column
- **WHEN** the user opens the dropdown to assign an internal target to an unmapped CSV column
- **THEN** the target options are sorted alphabetically, ensuring quick scannability.

### Requirement: Differentiated Spot vs Futures Validation
The system SHALL validate imported rows differently depending on whether the market type is Spot or Futures. Both require `date` and `tx_type`.

#### Scenario: Validating a Futures Trade
- **WHEN** marketType is FUTURES and a row contains `amount`, `symbol`, `price_fiat`, and `asset`
- **THEN** the row is considered valid.

#### Scenario: Validating a Futures PnL Settlement
- **WHEN** marketType is FUTURES and a row contains `realized_pnl` but missing `pnl_currency`
- **THEN** the system falls back to the transaction's quote currency or asset, and marks the row as valid.

#### Scenario: Fallback unknown headers to Metadata
- **WHEN** a CSV contains proprietary or unknown headers (e.g. `liquidation fee`, `mark price`)
- **THEN** the system automatically maps these to `metadata` (Metadata Pass-through) rather than leaving them unmapped.

