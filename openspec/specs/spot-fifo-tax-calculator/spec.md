## ADDED Requirements

### Requirement: Spot FIFO Lots Resolution
The system SHALL use SQL Window Functions (`SUM() OVER`) and/or `WITH RECURSIVE` queries in DuckDB to chronologically match disposal transactions (Sells, Swaps) against acquisition transactions (Buys) using the First-In, First-Out rule.

#### Scenario: Standard Sell Matching
- **WHEN** a user sells 2 BTC and previously bought 1 BTC at €10k and 1 BTC at €20k
- **THEN** the Spot FIFO calculation returns a cost basis of €30k for that disposal

### Requirement: Crypto-Fee Disposal Generation
When a transaction fee is paid in a crypto asset (e.g., BNB on Binance), the system SHALL treat that fee payment as a distinct disposal (sell) of that specific asset, triggering its own capital gain/loss calculation before the primary transaction evaluates.

#### Scenario: BNB Fee on a BTC Buy
- **WHEN** a user buys 1 BTC and pays 0.1 BNB as a fee (BNB previously acquired at €10, current value €30)
- **THEN** the engine calculates a capital gain of +€2 for the 0.1 BNB disposed
- **THEN** the 1 BTC acquisition cost basis correctly reflects the fiat equivalent cost including the fee expenditure

### Requirement: Event Flattening via UNION ALL
Before applying recursive window functions, DuckDB SHALL flatten denormalized transactions into distinct chronological FIFO events.
- **WHEN** a `SWAP` transaction involves an input asset, an output asset, and a fee asset
- **THEN** DuckDB SHALL output 3 distinct events: 1 Acquisition (output asset), and 2 Disposals (input asset + fee asset), properly sequenced.
- **WHEN** a `TRANSFER_OUT` or `WITHDRAWAL` incurs a network fee paid in crypto
- **THEN** DuckDB SHALL ignore the transferred amount for tax purposes (Global FIFO rule), but MUST extract the fee as a distinct Disposal event.

### Requirement: Deterministic IDs for Upserting
DuckDB SHALL NOT generate random UUIDs for calculated output rows.
- **WHEN** generating a `tax_lot` or `lot_history_event`
- **THEN** it SHALL generate a deterministic string ID by hashing the source transaction's `id_hash` and the `asset_id` (e.g., `md5(id_hash || '_' || asset_id)`).
- **THEN** Node.js SHALL use these IDs to execute `INSERT ... ON CONFLICT DO UPDATE`, ensuring SQLite's `audit_log` only records mathematical differences, not row replacements.

### Requirement: SQLite GLOB Safe Formatting
DuckDB SHALL prevent scientific notation from reaching SQLite.
- **WHEN** returning decimal values to Node.js for insertion into SQLite
- **THEN** DuckDB MUST format the output as a pure string (e.g., using `PRINTF('%.18f', amount)`) to strictly satisfy SQLite's `NOT GLOB '*[^-0-9.]*'` constraint.
