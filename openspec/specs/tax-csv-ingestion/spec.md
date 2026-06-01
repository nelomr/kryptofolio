## ADDED Requirements

### Requirement: uploadTaxFile on ITaxRepository is backend-agnostic
The system SHALL expose `uploadTaxFile(file: File): Promise<void>` on `ITaxRepository`. The implementation details are adapter-specific: `MockTaxAdapter` parses the file locally in the browser; `RestTaxAdapter` uploads it to the backend as multipart. The port signature SHALL be identical in both cases.

#### Scenario: Mock adapter ingests CSV locally without network
- **WHEN** `uploadTaxFile(file)` is called on `MockTaxAdapter` with a valid CSV file
- **THEN** no HTTP request SHALL be made
- **AND** the parsed entities SHALL be available via `getTransactions()` after the call resolves

#### Scenario: Rest adapter sends multipart POST to backend
- **WHEN** `uploadTaxFile(file)` is called on `RestTaxAdapter`
- **THEN** the adapter SHALL construct a `FormData` with `fd.append('file', file)` and POST it to `/api/tax/upload`
- **AND** SHALL NOT attempt to parse the file contents in the browser

---

### Requirement: Bit2Me parser handles Spanish types and directional mapping
Bit2Me uses Spanish operation types (`trade`, `deposit`, `withdrawal`, `staking`, `swap`). Trades are directional using source/destination columns.

#### Scenario: Trade from EUR to Crypto is a BUY
- **WHEN** `Tipo de operación` is `trade`, `Moneda de origen` is `EUR`, and `Moneda de destino` is `BTC`
- **THEN** the parser SHALL emit `type: 'BUY'`, `symbol: 'BTC'`, using `Cantidad de destino` as amount and `Cantidad de origen` as totalEur

#### Scenario: Crypto-to-Crypto Swap is parsed as SELL + BUY
- **WHEN** `Tipo de operación` is `swap`, from `ETH` to `BTC`
- **THEN** the parser SHALL emit two entities: a `SELL` for `ETH` and a `BUY` for `BTC`

---

### Requirement: deleteAllTransactions resets the fiscal transaction state
The system SHALL expose `deleteAllTransactions(): Promise<void>` on `ITaxRepository`. In `MockTaxAdapter` it clears the mutable `_transactions` array. In `RestTaxAdapter` it issues a DELETE to the backend.

#### Scenario: Mock adapter returns empty array after bulk delete
- **WHEN** `deleteAllTransactions()` is called on `MockTaxAdapter`
- **THEN** `getTransactions()` SHALL return `[]`
- **AND** the mock seed data SHALL NOT be auto-restored until a new `MockTaxAdapter` instance is created

#### Scenario: Rest adapter calls DELETE endpoint
- **WHEN** `deleteAllTransactions()` is called on `RestTaxAdapter`
- **THEN** the adapter SHALL issue `DELETE /api/tax/transactions`
- **AND** SHALL resolve void on HTTP 2xx

#### Scenario: Rest adapter failure throws TaxOperationError
- **WHEN** the backend responds with 5xx on the DELETE
- **THEN** the adapter SHALL throw `TaxOperationError` with `code: 'DELETE_FAILED'`

---

### Requirement: Bit2Me detected by Tipo de operación column
- **WHEN** a file (CSV or XLSX) contains the column `'Tipo de operación'`
- **THEN** `Bit2MeXlsxParser.detect(headers)` SHALL return `true`

---

### Requirement: papaparse used for CSV, SheetJS for XLSX
The system SHALL use `papaparse@5.4.1` for `.csv` files and `xlsx@0.18.5` for `.xlsx` files within `MockTaxAdapter`.

#### Scenario: SheetJS translates XLSX to JSON array
- **WHEN** `uploadTaxFile` is called with an `.xlsx` file
- **THEN** the adapter SHALL dynamically load `xlsx`, read the file as an array buffer, and call `XLSX.utils.sheet_to_json` to produce a raw rows array matching the CSV parser interface

#### Scenario: Lazy loading protects bundle size
- **WHEN** `uploadTaxFile` is never called
- **THEN** neither `papaparse` nor `xlsx` SHALL be loaded into the initial application bundle

---

### Requirement: Vitest unit tests for file parsers (strict TDD)
Each exchange-specific parser SHALL have dedicated Vitest tests using real header/row samples from the reference files.

#### Scenario: KrakenSpotCsvParser tests cover BUY/SELL/DEPOSIT/WITHDRAWAL/TRANSFER
- **WHEN** tests run against sample rows from `kraken_spot.csv`
- **THEN** at minimum 5 scenarios SHALL pass: BUY pair merge, SELL pair merge, crypto deposit, SOL withdrawal with fee, EUR-to-futures transfer

#### Scenario: BitvavoCsvParser tests cover buy/withdrawal/campaign types
- **WHEN** tests run against sample rows from `bitvavo_spot.csv`
- **THEN** at minimum 3 scenarios SHALL pass: ETH buy, XRP withdrawal, campaign_new_user_incentive as REWARD

#### Scenario: BitUnixCsvParser tests cover deposit/withdrawal
- **WHEN** tests run against sample rows from `bitunix_spot.csv`
- **THEN** at minimum 2 scenarios SHALL pass: ADA deposit, ADA withdrawal with fee

#### Scenario: TangemCsvParser tests cover WALLET_ACTIVATION
- **WHEN** tests run against sample rows from `tangem_activacion_xrp.csv`
- **THEN** 1 scenario SHALL pass: XRP wallet activation mapped to DEPOSIT

#### Scenario: Bit2MeXlsxParser tests cover trade, swap, and staking
- **WHEN** tests run against sample rows based on Bit2Me structure
- **THEN** scenarios SHALL pass for EUR->Crypto (BUY), Crypto->EUR (SELL), Swap (SELL+BUY), and Staking (REWARD)

#### Scenario: Unknown format detection test
- **WHEN** headers `['foo', 'bar', 'baz']` are passed to all registered parsers
- **THEN** all `detect()` calls SHALL return `false`
- **AND** `uploadTaxFile` SHALL throw `TaxOperationError` with `code: 'UPLOAD_FAILED'`
