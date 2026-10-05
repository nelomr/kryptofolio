# spot-transaction-search Specification

## Purpose
TBD - created by archiving change add-ai-advisor-read-and-scenario-tools. Update Purpose after archive.
## Requirements
### Requirement: Search Spot Transactions Through One Read Use Case
`SearchSpotTransactionsUseCase` SHALL read `getSpotTransactions()` and `getSpotTransactionOverrides()`, apply the edit-override view, filter, order, and paginate, and return the result. It SHALL be the single path used by both the `GET /tax/transactions/spot` route and the advisor's `tx_search` tool.

#### Scenario: Route and tool share the use case
- **WHEN** `routes/tax.ts` and the `tx_search` tool factory are inspected
- **THEN** both obtain spot transactions only through `SearchSpotTransactionsUseCase`, and neither contains its own override-merge logic

#### Scenario: The use case writes nothing
- **WHEN** the use case runs
- **THEN** it calls only read methods on its ports and persists nothing

### Requirement: The Override View Is A Pure Domain Service
`withOverrideView`, `editedFieldsOf`, and the `SpotTransactionOverrideView` union SHALL live in `apps/backend/src/core/domain/services/EffectiveSpotTransactionView.ts`, beside `toEffectiveSpotTransaction`. They SHALL be pure and perform no I/O. They SHALL NOT remain in `routes/tax.ts`.

#### Scenario: Route file no longer owns the merge
- **WHEN** `infrastructure/routes/tax.ts` is inspected
- **THEN** it declares neither `withOverrideView` nor `editedFieldsOf`

#### Scenario: Domain service is pure
- **WHEN** `EffectiveSpotTransactionView.ts` is inspected
- **THEN** it imports no port, no Zod, no SQL, and no filesystem or network module

### Requirement: Filters Apply To Effective Post-Edit Values
The use case request SHALL be `{ accountId?, symbol?, from?, to?, types?, paging }`. `accountId` SHALL be supplied only by the `GET /tax/transactions/spot` route from its `accountId` query; the `tx_search` tool SHALL NOT supply it. `from` and `to` SHALL be ISO dates, inclusive, compared against the date part of the effective post-edit timestamp. `types` SHALL be matched against the effective post-edit type. `symbol` SHALL match either the in-asset or the out-asset of the row. An omitted filter SHALL impose no constraint.

#### Scenario: An edited type is searched as edited
- **WHEN** a transaction stored as `BUY` has an override changing its type to `SELL` and the request filters `types: ['SELL']`
- **THEN** the row is returned, and the request `types: ['BUY']` does not return it

#### Scenario: An edited date is searched as edited
- **WHEN** a transaction stored on 2024-01-10 has an override moving it to 2024-03-05 and the request has `from: 2024-03-01`
- **THEN** the row is returned

#### Scenario: Date bounds are inclusive
- **WHEN** a transaction's effective date equals `from` or equals `to`
- **THEN** the row is returned

#### Scenario: Symbol matches either side
- **WHEN** the request filters `symbol: 'ETH'`
- **THEN** a row that acquires `ETH` and a row that disposes of `ETH` are both returned

#### Scenario: Empty types array is rejected by the tool input schema
- **WHEN** `tx_search` input carries `types: []`
- **THEN** `txSearchInputSchema` rejects it; the use case itself performs no `types` validation

#### Scenario: Unknown type is rejected by the tool input schema
- **WHEN** `tx_search` input carries a `types` entry outside the spot `tx_type` enum
- **THEN** `txSearchInputSchema` rejects it

#### Scenario: The tool never scopes by account
- **WHEN** the `tx_search` tool calls the use case
- **THEN** the request carries no `accountId`, so every account is searched

#### Scenario: No filters returns every transaction
- **WHEN** the request omits `symbol`, `from`, `to`, and `types`
- **THEN** every spot transaction is a candidate result

### Requirement: Results Are Ordered For Display Only
A `page` result SHALL be ordered by effective `timestamp` descending, then by `id_hash` ascending, through the `core-domain` helper `orderByIsoDateDescendingThenKey`, before it is sliced into a page. An `all` result SHALL NOT be reordered: it SHALL keep the order returned by the ledger port (`timestamp` ascending), so the route response is unchanged. This ordering SHALL be used for display only and SHALL NOT feed, replace, or reorder the tax FIFO queue.

#### Scenario: Newest first with a stable tiebreak on the page arm
- **WHEN** two transactions have the same effective timestamp and the `page` arm is requested
- **THEN** they are returned in ascending `id_hash` order, identically on every call

#### Scenario: The all arm keeps ledger order
- **WHEN** the `all` arm is requested
- **THEN** rows are returned in the ledger port's order (`timestamp` ascending), not date-descending

#### Scenario: Ordering is a core-domain helper
- **WHEN** the use case is inspected
- **THEN** it contains no `.sort(` call of its own, and the ordering is delegated to the `core-domain` helper

### Requirement: Paging Is A Discriminated Union
The use case SHALL accept a paging arm that is either `{ kind: 'all' }` or `{ kind: 'page', page, pageSize }`. A `page` result SHALL carry `page`, `pageSize`, `totalPages`, and `totalCount`, computed from the full filtered set and not from the returned page. An `all` result SHALL return every matching row with no page fields.

#### Scenario: Totals describe the filtered set
- **WHEN** 60 transactions match the filters and `pageSize` is 25
- **THEN** page 1 returns 25 rows, with `totalCount` 60 and `totalPages` 3

#### Scenario: Last page is partial
- **WHEN** 60 transactions match, `pageSize` is 25, and `page` is 3
- **THEN** 10 rows are returned

#### Scenario: A page past the end is empty with totals intact
- **WHEN** `page` exceeds `totalPages`
- **THEN** the returned rows are empty and `totalCount` and `totalPages` are still the true values

#### Scenario: The route uses the all arm
- **WHEN** `GET /tax/transactions/spot` is called
- **THEN** the use case is invoked with the route's `accountId` query and `{ kind: 'all' }`, and the response shape and row order are identical to before this change

#### Scenario: Invalid page arguments throw
- **WHEN** the `page` arm carries a `page` or `pageSize` that is not an integer of at least 1
- **THEN** the use case throws `RangeError`

### Requirement: Each Row Carries Its Edit State As A Union Derived From The Override
The advisor projection (`toAdvisorSpotRow`) SHALL produce exactly the fields `date`, `type`, `assetIn?`, `amountIn?`, `assetOut?`, `amountOut?`, `priceFiat`, `totalFiat`, `fiatCurrency`, `fee`, `exchange?`, and `edited`, where `edited` is `true` exactly when the override arm is `ACTIVE`. `fee` SHALL be the union `{ kind: 'NONE' } | { kind: 'CHARGED', amount, assetId? }`, mirroring the override's `fee_kind`. The projection SHALL omit `id`, `id_hash`, `account_id`, and the pre-edit `original`, and SHALL expose the exchange name only. The route's rows keep their existing shape.

#### Scenario: Edited row is flagged
- **WHEN** a transaction has a spot-transaction override
- **THEN** its projected row carries `edited: true` and its effective values

#### Scenario: Unedited row is flagged
- **WHEN** a transaction has no override
- **THEN** its projected row carries `edited: false`

#### Scenario: Explicit zero fee is not collapsed
- **WHEN** a transaction's fee is the explicit value `0`
- **THEN** the row's fee is `{ kind: 'CHARGED', amount: '0' }` and is never `{ kind: 'NONE' }`

#### Scenario: Absent fee is NONE
- **WHEN** a transaction has no fee amount
- **THEN** the row's fee is `{ kind: 'NONE' }`

#### Scenario: No internal identifier is projected
- **WHEN** an advisor row is inspected
- **THEN** it contains no `id`, `id_hash`, or `account_id` field and no account name

