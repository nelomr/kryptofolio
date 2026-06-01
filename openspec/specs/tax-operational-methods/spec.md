## ADDED Requirements

### Requirement: ICsvIngestionPort defines exchange-specific parser contract
The system SHALL define `ICsvIngestionPort` at `src/core/domain/ports/ICsvIngestionPort.ts` as a typed interface for exchange CSV parsers.

#### Scenario: Port defines detect and parse methods
- **WHEN** an exchange parser class implements `ICsvIngestionPort`
- **THEN** TypeScript SHALL require `detect(headers: string[]): boolean` and `parse(rawRows: Record<string, string>[]): TaxTransactionEntity[]`

---

### Requirement: Format auto-detection by header fingerprint
The CSV ingestion system SHALL identify the exchange format by inspecting the parsed header columns before attempting row transformation.

#### Scenario: Kraken Spot detected by txid + refid + subclass columns
- **WHEN** a CSV file contains the columns `['txid', 'refid', 'time', 'type', 'subclass', 'asset', 'amount']`
- **THEN** `KrakenSpotCsvParser.detect(headers)` SHALL return `true`
- **AND** no other registered parser SHALL return `true` for the same header set

#### Scenario: Bitvavo detected by Quote Currency + Transaction ID columns
- **WHEN** a CSV file contains the columns `['Quote Currency', 'Transaction ID', 'Type', 'Currency']`
- **THEN** `BitvavoCsvParser.detect(headers)` SHALL return `true`

#### Scenario: BitUnix detected by Outgoing Asset + Incoming Asset + Label columns
- **WHEN** a CSV file contains the columns `['Outgoing Asset', 'Incoming Asset', 'Label', 'Date (UTC)']`
- **THEN** `BitUnixCsvParser.detect(headers)` SHALL return `true`

#### Scenario: Tangem detected by Notes column without other exchange markers
- **WHEN** a CSV file contains `['Date', 'Type', 'Asset', 'Amount', 'Fee', 'Notes']` and does NOT contain Kraken/Bitvavo/BitUnix markers
- **THEN** `TangemCsvParser.detect(headers)` SHALL return `true`

#### Scenario: Unknown format throws TaxOperationError
- **WHEN** no registered parser's `detect()` returns `true` for a given header set
- **THEN** the system SHALL throw a `TaxOperationError` with `code: 'UPLOAD_FAILED'` and message indicating the format is unsupported

---

### Requirement: Kraken Spot CSV parser merges paired trade rows by refid
The Kraken Spot format exports two rows per spot trade (EUR leg + crypto leg) sharing the same `refid`. The parser SHALL merge these pairs into a single `TaxTransactionEntity`.

#### Scenario: BUY trade pair — EUR leg negative, crypto leg positive
- **WHEN** rows share `refid = 'TTE7DJ-SLH4A-HWU24P'`, one with `asset='EUR', amount=-50.00` and one with `asset='PUMP', amount=7704.16`
- **THEN** the parser SHALL emit one entity with `type: 'BUY'`, `symbol: 'PUMP'`, `amount: 7704.16`, `totalEur: 50.00`, `feeEur: 0` (fee is in PUMP, not EUR — stored as 0 until price enrichment)
- **AND** `refId: 'TTE7DJ-SLH4A-HWU24P'`, `exchange: 'Kraken'`

#### Scenario: SELL trade pair — EUR leg positive, crypto leg negative
- **WHEN** rows share a `refid`, one with `asset='EUR', amount=448.75` (positive) and one with `asset='ENA', amount=-957.64` (negative)
- **THEN** the parser SHALL emit one entity with `type: 'SELL'`, `symbol: 'ENA'`, `amount: 957.64`, `totalEur: 448.75`

#### Scenario: Single-row deposit is processed without pairing
- **WHEN** a row has `type='deposit'` and `subclass='crypto'` with `asset='HBAR', amount=5239.22`
- **THEN** the parser SHALL emit one entity with `type: 'DEPOSIT'`, `symbol: 'HBAR'`, `amount: 5239.22`

#### Scenario: Single-row withdrawal is processed without pairing
- **WHEN** a row has `type='withdrawal'`, `asset='SOL'`, `amount=-0.006`, `fee=0.005`
- **THEN** the parser SHALL emit one entity with `type: 'WITHDRAWAL'`, `symbol: 'SOL'`, `amount: 0.006`, `feeEur: 0` (fee is in SOL, not EUR — stored as 0 until price enrichment)

#### Scenario: Transfer to futures is mapped to TRANSFER_OUT
- **WHEN** a row has `type='transfer'`, `subtype='spottofutures'`, `amount=-200.00`, `asset='EUR'`
- **THEN** the parser SHALL emit one entity with `type: 'TRANSFER_OUT'`, `symbol: 'EUR'`, `amount: 200.00`

---

### Requirement: Bitvavo CSV parser handles single-row trades
The Bitvavo format has one row per operation. BUY/SELL are identified by the `Type` column. Amounts may be negative for outgoing direction.

#### Scenario: BUY row mapped correctly
- **WHEN** a row has `Type='buy'`, `Currency='ETH'`, `Amount=0.30338`, `Quote Price=1645`, `Received/Paid Amount=-499.81`, `Fee amount=0.7499`
- **THEN** the parser SHALL emit `type: 'BUY'`, `symbol: 'ETH'`, `amount: 0.30338`, `totalEur: 499.81`, `feeEur: 0.7499`

#### Scenario: Withdrawal row mapped correctly
- **WHEN** a row has `Type='withdrawal'`, `Currency='XRP'`, `Amount=-439.55`
- **THEN** the parser SHALL emit `type: 'WITHDRAWAL'`, `symbol: 'XRP'`, `amount: 439.55`, `feeEur: 0`

#### Scenario: Campaign incentive mapped as REWARD
- **WHEN** a row has `Type='campaign_new_user_incentive'`, `Currency='EUR'`, `Amount=10`
- **THEN** the parser SHALL emit `type: 'REWARD'`, `symbol: 'EUR'`, `amount: 10`

---

### Requirement: BitUnix CSV parser handles outgoing/incoming direction columns
BitUnix uses a direction-based model: `Outgoing Asset + Outgoing Amount` for what leaves, `Incoming Asset + Incoming Amount` for what arrives.

#### Scenario: Deposit row mapped correctly
- **WHEN** a row has `Label='Deposit'`, `Outgoing Amount=0`, `Incoming Asset='ADA'`, `Incoming Amount=543.344684`
- **THEN** the parser SHALL emit `type: 'DEPOSIT'`, `symbol: 'ADA'`, `amount: 543.344684`

#### Scenario: Withdrawal row mapped correctly
- **WHEN** a row has `Label='Withdraw'`, `Outgoing Asset='ADA'`, `Outgoing Amount=546.844684`, `Fee Amount=1`
- **THEN** the parser SHALL emit `type: 'WITHDRAWAL'`, `symbol: 'ADA'`, `amount: 546.844684`, `feeEur: 0` (fee in ADA, not EUR)

---

### Requirement: Tangem CSV parser handles wallet activation events
Tangem exports are minimal: one row per event, with a `Notes` field and a `WALLET_ACTIVATION` type.

#### Scenario: WALLET_ACTIVATION row mapped to DEPOSIT with flag
- **WHEN** a row has `Type='WALLET_ACTIVATION'`, `Asset='XRP'`, `Amount=1.0`, `Fee=0.0`, `Notes='Tangem Base Reserve'`
- **THEN** the parser SHALL emit `type: 'DEPOSIT'`, `symbol: 'XRP'`, `amount: 1.0`, `feeEur: 0`
- **AND** the entity's `refId` SHALL contain `'WALLET_ACTIVATION'` for audit traceability

---

### Requirement: Per-row Zod validation with partial failure tolerance
Each parsed row SHALL be validated individually. Row failures SHALL be tolerated without aborting the batch.

#### Scenario: Valid rows are ingested, invalid rows are skipped
- **WHEN** a CSV with 10 rows is parsed and 2 rows have missing or malformed required fields
- **THEN** the system SHALL ingest 8 entities and emit a single `'validation-error'` event on `errorBus` indicating 2 rows were skipped
- **AND** SHALL NOT throw an exception

---

### Requirement: TaxOperationError domain error class
The system SHALL provide `TaxOperationError` at `src/core/infrastructure/errors/TaxOperationError.ts` for operation-level failures distinct from Zod validation errors.

#### Scenario: Error carries a typed code
- **WHEN** `new TaxOperationError('UPLOAD_FAILED', 'Unsupported format')` is constructed
- **THEN** `err.code === 'UPLOAD_FAILED'` and `err.message === 'Unsupported format'` SHALL be accessible without casting

#### Scenario: Error bus receives operation-error before throw
- **WHEN** `uploadTaxFile` fails due to an unknown format
- **THEN** `errorBus.emit('operation-error', { code: 'UPLOAD_FAILED', message })` SHALL be called before the error is thrown
