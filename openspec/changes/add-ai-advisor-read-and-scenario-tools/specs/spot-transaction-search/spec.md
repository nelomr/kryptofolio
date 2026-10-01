## ADDED Requirements

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
The request SHALL be `{ symbol?, from?, to?, types?, page }`. `from` and `to` SHALL be ISO dates, inclusive, compared against the effective post-edit timestamp. `types` SHALL be a non-empty subset of the existing spot `tx_type` enum, matched against the effective post-edit type. `symbol` SHALL match either the in-asset or the out-asset of the row. An omitted filter SHALL impose no constraint.

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

#### Scenario: Empty types array is rejected
- **WHEN** the request carries `types: []`
- **THEN** input validation rejects it

#### Scenario: Unknown type is rejected
- **WHEN** the request carries a `types` entry outside the spot `tx_type` enum
- **THEN** input validation rejects it

#### Scenario: No filters returns every transaction
- **WHEN** the request omits `symbol`, `from`, `to`, and `types`
- **THEN** every spot transaction is a candidate result

### Requirement: Results Are Ordered For Display Only
Results SHALL be ordered by effective `timestamp` descending, then by `id_hash`, through a `core-domain` ordering helper. This ordering SHALL be used for display only and SHALL NOT feed, replace, or reorder the tax FIFO queue.

#### Scenario: Newest first with a stable tiebreak
- **WHEN** two transactions have the same effective timestamp
- **THEN** they are returned in `id_hash` order, identically on every call

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
- **THEN** the use case is invoked with `{ kind: 'all' }`, and the response shape is identical to its shape before this change

### Requirement: Each Row Carries Its Edit State As A Union Derived From The Override
Each returned row SHALL carry date, type, assets and amounts in and out, `price_fiat`, `total_fiat`, the fee in its existing union form, and the exchange or account name, together with `edited: boolean` derived from the override arm. For the advisor projection, the pre-edit `original` row SHALL be omitted.

#### Scenario: Edited row is flagged
- **WHEN** a transaction has a spot-transaction override
- **THEN** its projected row carries `edited: true` and its effective values

#### Scenario: Unedited row is flagged
- **WHEN** a transaction has no override
- **THEN** its projected row carries `edited: false`

#### Scenario: Explicit zero fee is not collapsed
- **WHEN** a transaction's fee is the explicit value `0`
- **THEN** the row's fee union preserves it as a zero fee and does not present it as an absent fee
