# Capability: Import Parsed Transactions

## Requirements

### Requirement: Submit Parsed Transactions Payload
The system SHALL allow the client to transmit an array of pre-parsed, locally validated transaction rows to the backend.

#### Scenario: Successful ingestion of parsed rows
- **WHEN** the `importTransactions` API is invoked with a valid array of `TransactionRow` objects and a specified `marketType`
- **THEN** the backend persists the transactions and the client receives a success confirmation.

#### Scenario: Backend validation failure
- **WHEN** the `importTransactions` API is invoked with rows that violate backend constraints (e.g. malformed dates or missing critical fields that bypassed frontend checks)
- **THEN** the API returns an error detailing the problematic rows and no data is persisted.

### Requirement: Deterministic Row Identifiers (Idempotency)
The system SHALL generate a deterministic unique identifier (`id_hash`) for each parsed transaction row before submission.

#### Scenario: Idempotent payload submission
- **WHEN** the frontend maps and finalizes the parsed rows
- **THEN** it generates an `id_hash` (e.g., SHA-256 concatenation of `timestamp`, `asset`, `amount`, and `tx_type`) for each row
- **AND THEN** includes this hash in the payload so the backend can safely perform an idempotent UPSERT without duplicating records.

### Requirement: Transaction Row Aggregation
The system SHALL aggregate transaction rows sharing the same `group_id` before submission.

#### Scenario: Merging multi-leg trades
- **WHEN** the user uploads a file with multi-row trades (e.g., Kraken splitting fees, inflows, and outflows into separate rows with the same ID)
- **THEN** the system SHALL merge these into a single `ValidTransactionRow` by resolving directions (`amount_in`, `amount_out`, `asset_in`, `asset_out`) and accumulating fees.

### Requirement: Required Timezone Context
The system SHALL strictly enforce that a valid timezone is provided for all parsed transactions to normalize timestamps into UTC correctly.

#### Scenario: Submitting without a timezone
- **WHEN** the client submits the payload
- **THEN** it MUST include the `timezone` as a required parameter (defaulting to "UTC" if unselected) alongside the `marketType` and `rows`.
