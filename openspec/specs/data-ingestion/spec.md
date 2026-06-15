## ADDED Requirements

### Requirement: Drag and Drop Ingestion
The system SHALL provide a dropzone area where users can upload CSV or Excel transaction files.

#### Scenario: User uploads a valid CSV file
- **WHEN** the user drops a CSV file into the dropzone
- **THEN** the system parses the file, updates the store status from IDLE to PARSING, and transitions to the interactive data grid view (REVIEW state)

#### Scenario: User uploads an unsupported file format
- **WHEN** the user drops a file that is not a CSV or Excel file
- **THEN** the parser rejects the file and the system displays an error message, returning to IDLE state

---

### Requirement: Automatic Column Mapping (With Examples)
The system SHALL automatically attempt to map raw file columns to domain properties (`date`, `amount`, `ticker`, `type`) using bilingual heuristics and fuzzy matching.

**Bilingual Heuristic Dictionary Example:**
- `date` matches: "Date", "Fecha", "Time", "Timestamp", "Creado", "Created"
- `amount` matches: "Amount", "Cantidad", "Volume", "Volumen", "Size", "Total"
- `ticker` matches: "Symbol", "Ticker", "Asset", "Moneda", "Coin", "Token", "Asset_ID"
- `type` matches: "Type", "Tipo", "Action", "Acción", "Side", "Transaction Type"

#### Scenario: Auto-mapping succeeds fully
- **WHEN** the parsed file contains standard headers: `["Fecha", "Cantidad", "Moneda", "Tipo"]`
- **THEN** the `AutoMapperService` maps these exactly to `{ date: "Fecha", amount: "Cantidad", ticker: "Moneda", type: "Tipo" }` without user intervention.

#### Scenario: Auto-mapping fails partially (Fallback to Manual)
- **WHEN** the parsed file contains unknown headers like `["Date", "Amt", "C_34_TXT", "Type"]`
- **THEN** `date`, `amount`, and `type` might map correctly, but `ticker` remains unmapped. 
- **AND THEN** the table header for `C_34_TXT` renders a `<Select>` dropdown allowing the user to manually select the `ticker` domain property.

---

### Requirement: Inline Validation and Error Highlighting (With Data Example)
The system SHALL validate each mapped row and highlight rows containing errors or missing required data directly within the grid.

**Validation Example Data Object:**
```json
{
  "id": "row-1",
  "originalData": { "Fecha": "2023-10-01", "Cantidad": "", "Moneda": "BTC" },
  "mappedData": { "date": "2023-10-01", "amount": "", "ticker": "BTC" },
  "errors": ["amount"],
  "hasError": true
}
```

#### Scenario: Row is missing a required field
- **WHEN** a parsed row has an empty or invalid value for `amount`
- **THEN** the row's `hasError` flag is set to true.
- **AND THEN** the row is visually highlighted using `bg-loss-soft`.
- **AND THEN** the specific input cell for `amount` is styled with `border-loss focus:ring-loss text-loss`.

#### Scenario: Grid contains any errors
- **WHEN** the `errorCount` computed state is greater than 0
- **THEN** an error banner is displayed (`bg-loss-soft text-loss`) showing the number of incomplete rows (e.g., "Tienes 12 filas incompletas. Edita las celdas directamente.")

---

### Requirement: Inline Cell Editing
The system SHALL allow users to directly edit the values of invalid cells inside the interactive grid to correct them without opening modal windows.

#### Scenario: User corrects an invalid cell
- **WHEN** the user types a valid value (e.g., "0.5") into an invalid `amount` cell using the inline input
- **THEN** the store's `updateCell` action runs, triggering `ValidationService.validateSingle(row)`.
- **AND THEN** the domain entity updates, clearing `errors` and setting `hasError: false`.
- **AND THEN** the `bg-loss-soft` and `border-loss` classes are immediately removed from the row and cell.

---

### Requirement: Import Confirmation
The system SHALL prevent the final import of the data if there are any unresolved errors in the transaction rows.

#### Scenario: Grid has unresolved errors
- **WHEN** the grid has one or more rows with `hasError: true` (`!isReadyToSubmit`)
- **THEN** the "Importar Transacciones" button remains disabled

#### Scenario: Grid is fully valid
- **WHEN** all rows are valid (`errorCount === 0`)
- **THEN** the "Importar Transacciones" button is enabled, and clicking it passes the sanitized array of `TransactionRow.mappedData` to the backend/ingestion endpoint.

---

### Requirement: Timezone Selection and FIFO Normalization (New)
The system SHALL ensure that all transaction dates and times imported from CSV/Excel files are strictly normalized to UTC ISO 8601 timestamps before dispatching them to the backend, protecting the integrity of FIFO calculations across multiple exchanges.

#### Scenario: User selects CSV timezone
- **WHEN** the user is in the interactive data grid view
- **THEN** they are presented with a Timezone Selector defaulting to `UTC`.
- **AND WHEN** the user selects a specific timezone (e.g. `Europe/Madrid`)
- **THEN** the system stores this timezone preference for the current import session.

#### Scenario: Backend payload generation applies normalization
- **WHEN** the user clicks "Importar Transacciones"
- **THEN** the `DateNormalizerService` intercepts the raw `date` and `time` string values for each valid row.
- **AND THEN** it applies the user-selected timezone offset to generate a single `timestamp` in `ISO 8601 UTC` format.
- **AND THEN** this standard `timestamp` replaces the raw date/time fields in the payload dispatched to the backend.
