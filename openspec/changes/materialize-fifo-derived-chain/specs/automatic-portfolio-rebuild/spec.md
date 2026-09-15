## MODIFIED Requirements

### Requirement: `needs_recalculation` Is a Retryable Pending-Work Marker

The `needs_recalculation` setting SHALL be retained as a pending-work marker. It SHALL be set when the ledger changes and cleared only on successful materialisation. It SHALL additionally govern the derived DuckDB chain: while it is `'true'`, no read SHALL be served from the derived chain until a rebuild has committed.

#### Scenario: Failed automatic rebuild remains retryable

- **WHEN** the automatic materialisation after an ingestion batch fails
- **THEN** `needs_recalculation` MUST remain `'true'`
- **AND** the ingestion response MUST report that materialisation did not complete
- **AND** the persisted transactions MUST be retained

#### Scenario: Manual endpoint remains available as an explicit retry

- **WHEN** the user invokes `POST /api/portfolio/rebuild`
- **THEN** materialisation MUST run regardless of the flag's current value
- **AND** it MUST return the same reconciliation summary shape as the automatic path

#### Scenario: Flag drives the pending indicator

- **WHEN** `needs_recalculation` is `'true'`
- **THEN** the UI MUST indicate that derived figures are pending recalculation

#### Scenario: Flag is cleared only after the derived rows are committed

- **WHEN** materialisation succeeds
- **THEN** the flag MUST be cleared as the last step of the successful run, after every derived row has
  been written
- **AND** a run that fails at any earlier point MUST leave the flag `'true'`

#### Scenario: A dirty flag is never served around

- **WHEN** `needs_recalculation` is `'true'` and a read request reaches a use case consuming the derived chain
- **THEN** the request MUST NOT be answered from the pre-mutation derived chain
- **AND** it MUST be answered only after a rebuild has committed and the flag has been cleared

The flag is read and written through `IUserSettingsPort` against the settings database, while the
derived tables live in the ledger database. One transaction cannot span two SQLite files, so
"within the same transaction" is not achievable as wired; the two observable guarantees above are, and
they are what the retry behaviour depends on.

## ADDED Requirements

### Requirement: Read Requests Rebuild Synchronously When the Chain Is Stale

A read request that consumes the derived FIFO chain and finds `needs_recalculation` set to `'true'` SHALL trigger a synchronous rebuild and SHALL be answered only from the rebuilt chain. The request SHALL wait for the rebuild rather than being served stale data or a background-refresh placeholder. Concurrent read requests finding the same stale chain SHALL share one rebuild.

#### Scenario: A read after an import waits for the rebuild

- **WHEN** an import has set `needs_recalculation` to `'true'` and the user opens the dashboard
- **THEN** the first read request MUST trigger a rebuild and MUST resolve only after that rebuild commits
- **AND** the figures returned MUST reflect the imported transactions

#### Scenario: A fan-out of reads pays the rebuild once

- **WHEN** the dashboard issues its parallel read requests against a stale chain
- **THEN** exactly one rebuild MUST run
- **AND** every request MUST be answered from the same committed rebuild

#### Scenario: The trigger works outside HTTP

- **WHEN** a read use case consuming the derived chain is invoked directly, with no HTTP request and no middleware in the path
- **THEN** the staleness check and synchronous rebuild MUST still occur before its first analytical read

#### Scenario: A failing rebuild surfaces as a typed failure, never as stale data

- **WHEN** the rebuild triggered by a read request fails
- **THEN** the request MUST fail with a typed error
- **AND** `needs_recalculation` MUST remain `'true'`
- **AND** consecutive failures MUST apply a backoff so each subsequent request does not queue its own rebuild attempt
