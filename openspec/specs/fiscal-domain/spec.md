# Fiscal Domain Specification

## Purpose

The fiscal domain model: canonical lot status, typed disposal provenance with flag fields kept separate, custody location, and manual value provenance.
## Requirements
### Requirement: Canonical Lot Status in the Domain Model

`TaxLotEntity.status` SHALL be typed as the canonical `'OPEN' | 'PARTIAL' | 'CLOSED'` union and SHALL be required, not optional. The `'FULL' | 'PARTIAL' | 'EMPTY'` union SHALL be removed from the domain model and from every DTO schema.

#### Scenario: Domain entity carries the canonical union

- **WHEN** `TaxLotEntity` is inspected
- **THEN** `status` MUST be typed `'OPEN' | 'PARTIAL' | 'CLOSED'`
- **AND** it MUST NOT be optional

#### Scenario: DTO schema validates the canonical vocabulary

- **WHEN** `ExternalTaxLotSchema` parses a backend payload with `status: 'OPEN'`
- **THEN** the parse MUST succeed and produce `status: 'OPEN'`
- **WHEN** the payload carries `status: 'FULL'`
- **THEN** the parse MUST fail and emit a controlled error to the `errorBus`

#### Scenario: Mock schemas share the canonical vocabulary

- **WHEN** `MockDtoSchemas` maps a mock lot
- **THEN** it MUST produce the same `'OPEN' | 'PARTIAL' | 'CLOSED'` values as the real adapter
- **AND** mock and real payloads MUST be interchangeable at the port boundary

### Requirement: Typed Disposal Provenance and Separate Flag Fields on Lot Events

`TaxLotHistoryEvent` SHALL carry a required `disposalType` typed as `'SELL' | 'SWAP' | 'FEE' | 'SPEND'`, retain its existing `flag` field typed as the fiscal-classification union, and gain a separate optional `qualityFlag` typed as the canonical data-quality union. None SHALL be typed as a bare `string`, and the `any` type SHALL NOT be used anywhere in the fiscal domain.

#### Scenario: Event exposes real provenance

- **WHEN** a `TaxLotHistoryEvent` is produced from a fee disposal
- **THEN** `disposalType` MUST be `'FEE'`
- **AND** the UI MUST be able to distinguish it from a genuine sale without inspecting free text

#### Scenario: Existing fiscal classification is preserved

- **WHEN** a `TaxLotHistoryEvent` derives from a Tangem wallet-activation operation
- **THEN** `flag` MUST remain `'WALLET_ACTIVATION'`
- **AND** the existing badge and audit-trail logic that reads it MUST continue to work unchanged

#### Scenario: Classification and defect coexist on one event

- **WHEN** a wallet-activation operation also has an unresolvable price
- **THEN** `flag` MUST be `'WALLET_ACTIVATION'` and `qualityFlag` MUST be `'MISSING_PRICE'`
- **AND** neither MUST overwrite the other

#### Scenario: Both flag fields are typed unions

- **WHEN** `TaxLotHistoryEvent.flag` and `TaxLotHistoryEvent.qualityFlag` are inspected
- **THEN** each MUST be typed as its own union or `undefined`, never as `string`
- **AND** an unrecognised value from the backend MUST fail Zod validation rather than flow through as a string

#### Scenario: Non-taxable events are explicit

- **WHEN** an event carries a data-quality flag
- **THEN** `isTaxable` MUST be `false`
- **AND** the entity MUST be consumable by the UI to render a non-taxable indicator

### Requirement: Custody Location in the Domain Model

The domain SHALL distinguish the venue where a lot was acquired from the accounts currently holding it. `TaxLotEntity` SHALL retain `exchange` as the acquiring venue and gain a `currentLocations` collection describing present custody per account.

#### Scenario: Acquiring venue and current custody differ

- **WHEN** a lot acquired on `Kraken:spot` has been partially moved to a self-custody wallet
- **THEN** `exchange` MUST read the acquiring venue
- **AND** `currentLocations` MUST contain one entry per holding account with its quantity

#### Scenario: Synthetic custody is representable

- **WHEN** part of a lot is attributed to `ownwallet-XRP`
- **THEN** `currentLocations` MUST include that account
- **AND** the entry MUST be marked as synthetic so the UI can present it distinctly

#### Scenario: Custody entries use branded identifiers and precision values

- **WHEN** a `currentLocations` entry is constructed
- **THEN** its account identifier MUST use a branded type from `BrandedTypes.ts`
- **AND** its quantity MUST use the project's precision value object, not a raw primitive

### Requirement: Manual Value Provenance in the Domain Model

The domain SHALL represent whether a monetary value originated from a manual assignment rather than from market data, as a typed field on the affected entities.

#### Scenario: Manually assigned cost basis is marked

- **WHEN** a lot's cost basis derives from a manual price override
- **THEN** the entity MUST expose that provenance as a typed field
- **AND** the UI MUST NOT infer it from the absence of a flag

#### Scenario: Provenance survives the anti-corruption layer

- **WHEN** the backend payload carries the manual-value provenance
- **THEN** the Zod DTO schema MUST validate and map it into the domain entity
- **AND** an unrecognised provenance value MUST fail validation

### Requirement: Fiscal Domain Remains Framework-Free

The fiscal domain models and all new value objects SHALL contain no framework dependency, and no use of the `any` type. Adopting a precision value object SHALL NOT relax this: the fiscal domain models MAY depend on `Money` from `@kryptofolio/core-domain`, which keeps `decimal.js` private behind its own surface, and SHALL NOT import an arithmetic library directly.

#### Scenario: Domain layer imports no framework

- **WHEN** the fiscal domain models, custody value objects, and provenance types are inspected
- **THEN** they MUST NOT import Zod, Axios, or Vue
- **AND** `scripts/check-domain-isolation.sh` MUST pass

#### Scenario: No any type is present

- **WHEN** the fiscal domain and its DTO schemas are type-checked
- **THEN** no `any` type MUST appear
- **AND** `unknown` with narrowing MUST be used where a dynamic value is unavoidable

#### Scenario: Precision arrives as a value object, not as an arithmetic library

- **WHEN** `apps/frontend/src/core/domain/models/FiscalEntities.ts` and the fiscal consumers converted by this change are inspected
- **THEN** they MUST import `Money` from `@kryptofolio/core-domain` and MUST NOT import `decimal.js`
- **AND** `Money` MUST keep its `Decimal` private, exposing no getter for it and no `toNumber()`, so no consumer can obtain the library value or a float from it
- **AND** `scripts/check-domain-isolation.sh` MUST still pass with the new import in place.

### Requirement: Derivative Operation Type Is a Total Image of the Emitter's Closed Enum

`FuturesTransactionType` SHALL be exactly the emitter's four `FuturesTxType` values under the entity's existing `FUTURES_`-prefixed naming, plus `UNKNOWN`: `'FUTURES_TRADE' | 'FUTURES_FUNDING' | 'FUTURES_SETTLEMENT' | 'FUTURES_LIQUIDATION' | 'UNKNOWN'`. Excepting `UNKNOWN` itself, it SHALL NOT carry a member with no possible producer on the per-transaction futures route.

`UNKNOWN` is deliberately kept even though the real route's own mapping cannot produce it: a second, unvalidated producer still inhabits it — a bare `z.string().transform(val => val as FuturesTransactionType)` cast on a mock schema, admitting any string into the union at that boundary. That cast is a distinct anti-corruption gap, outside this route and outside this requirement's fix; closing it, and with it the question of whether `UNKNOWN` still needs a member once no producer reaches it, is a follow-up.

The mapping from the emitter's `tx_type` to this union SHALL be total and exhaustive by type: every value of `FuturesTxType` SHALL have a distinct, meaningful destination, and adding a fifth `FuturesTxType` value upstream SHALL fail this mapping's own typecheck rather than silently degrade to `UNKNOWN`. A `tx_type` value outside the closed enum SHALL be a parse rejection, never a value admitted and typed `UNKNOWN`.

A collateral conversion SHALL NOT be represented as a `FuturesTransactionType`: it is not a `FuturesTxType` at its own emitter, and folding it into this union — whether as its own member or by collapsing it onto an existing one — would either resurrect a member no producer can reach or invent a position that was never opened.

#### Scenario: Every emitter type reaches its own entity value

- **WHEN** a row is produced for each of `TRADE`, `FUNDING_FEE`, `SETTLEMENT`, `LIQUIDATION`
- **THEN** `TaxDerivativeEntity.type` MUST be `FUTURES_TRADE`, `FUTURES_FUNDING`, `FUTURES_SETTLEMENT`, `FUTURES_LIQUIDATION` respectively
- **AND** none of the four MUST be typed `UNKNOWN`

#### Scenario: A fifth emitter value fails the typecheck, not the runtime

- **WHEN** `FuturesTxType` gains a value the mapping does not enumerate
- **THEN** the mapping SHALL fail to compile
- **AND** the failure SHALL NOT first appear as a runtime `UNKNOWN` on a real row

#### Scenario: An off-vocabulary value is rejected, not admitted as UNKNOWN

- **WHEN** a row's `tx_type` is outside the closed `FuturesTxType` enum
- **THEN** the row MUST be rejected at the parsing boundary
- **AND** it MUST NOT be typed `UNKNOWN` and rendered as though it parsed

#### Scenario: A collateral conversion has no member in this union

- **WHEN** the derivative operation-type union is inspected
- **THEN** it SHALL NOT contain a member meaning "conversion"
- **AND** a collateral movement SHALL continue to be represented by its own `CollateralMovementType`, never folded into `FuturesTransactionType`

### Requirement: Fiscal Magnitudes Are Precision Value Objects

Every monetary and every quantity field of the fiscal domain model in `apps/frontend/src/core/domain/models/FiscalEntities.ts` SHALL be typed as the `Money` value object from `@kryptofolio/core-domain`, never as a native `number`. The retype covers exactly these fields, which are the fields currently typed `number`:

- `TaxDerivativeEntity`: all five of `amount`, `tradePrice`, `realizedPnl`, `fees` and `funding` become `Money | null`, per the derivatives requirement below
- `TaxTransactionEntity`: `amountIn?` and `amountOut?` become `Money | undefined`, keeping their `?`; `amount`, `totalEur`, `priceEur` and `feeEur` become `Money | null`, per the unresolved-magnitude requirement below
- `TaxLotEntity`: `originalQty`, `remainingQty`, `unitCost`, `totalCost`
- `TaxLotHistoryEvent`: `amountFromLot`, and `saleFeeEur` — which becomes `Money | null`, losing its `?`, per the unresolved-disposal-fee requirement below
- `LotRelocationEntity`: `qty`
- `LotCustodyLocation`: `qty`

Fields whose meaning is a count, a tally, or a calendar year SHALL remain `number`. Fields already carried by a compliant precision representation SHALL be left unchanged: `TaxReportSummary`'s aggregate figures remain exact decimal `string`, and `TaxLotHistoryEvent.salePrice` / `.gainLoss` remain `ConvertedAmount | null` so the conversion-outcome union and its rate, rate date, native currency and unconvertible arm survive.

A field that is genuinely optional SHALL remain optional through the retype: `Money | undefined` and a `Money` of value zero are distinct states and SHALL NOT be collapsed into one another, in either direction. The retype SHALL NOT, however, be read as a mandate to preserve every literal `?`. Where a field's absence and its unresolvedness are not distinguished by any reader, it SHALL carry two states and not three: an absent wire value and an explicit null one SHALL both map to `null`, and `Money | null | undefined` SHALL NOT be introduced, because the third arm would be a representable state no code inspects. Because every `Money` instance is truthy, a falsy guard (`!field`, `field || fallback`) over a retyped field SHALL be replaced by an explicit comparison against the field's own absent state, and deleted where the field has none.

The retype SHALL be observationally invisible in the user interface: for every retyped field, the characters rendered on screen SHALL be identical to those rendered before the change. Exactly seven columns across three tables are permitted to change, all of them cells that previously asserted or disguised a zero no layer had resolved, and all governed by the requirements below: the transactions table's total, price and amount columns; the tax report details table's fee column; and the derivatives table's amount, PnL, and fees/funding-with-net-impact columns. No column outside that list SHALL change a rendered character. The derivatives table's three columns are compared against the state *after* the derivatives PnL contract change has landed, not against today's screen, because that table renders no rows at all before it; the field `feeEur` adds no column, having no cell anywhere.

#### Scenario: Every fiscal magnitude is a `Money`

- **WHEN** `TaxDerivativeEntity`, `TaxTransactionEntity`, `TaxLotEntity`, `TaxLotHistoryEvent`, `LotRelocationEntity`, and `LotCustodyLocation` are type-checked
- **THEN** `amount`, `tradePrice`, `realizedPnl`, `fees` and `funding` on `TaxDerivativeEntity` SHALL each be `Money | null`
- **AND** `amountIn` and `amountOut` on `TaxTransactionEntity` SHALL be `Money | undefined`, and `amount`, `totalEur`, `priceEur` and `feeEur` SHALL each be `Money | null`
- **AND** `originalQty`, `remainingQty`, `unitCost` and `totalCost` on `TaxLotEntity` SHALL be `Money`
- **AND** `amountFromLot` on `TaxLotHistoryEvent` SHALL be `Money`, and `saleFeeEur` SHALL be `Money | null` and SHALL NOT be optional
- **AND** `qty` on `LotRelocationEntity` SHALL be `Money`
- **AND** `qty` on `LotCustodyLocation` SHALL be `Money`
- **AND** none of them SHALL be `number`, `Money | number`, or a union with any numeric arm.

#### Scenario: Custody quantities close a pre-existing precision gap

- **WHEN** a `LotCustodyLocation` entry of `TaxLotEntity.currentLocations` is constructed
- **THEN** its `qty` SHALL be a `Money`, and its `accountId` SHALL remain a branded `AccountId`
- **AND** the "Custody entries use branded identifiers and precision values" scenario of the existing "Custody Location in the Domain Model" requirement — which already demands that a custody entry's quantity use the project's precision value object rather than a raw primitive, and which `qty: number` has been violating since that requirement was archived — SHALL be satisfied for the first time
- **AND** because zero-quantity custody rows are filtered out upstream of the domain model, this scenario imposes no requirement that a zero quantity be representable in `currentLocations`, and that upstream filtering SHALL NOT be conflated with the absent-versus-zero distinction that governs the optional magnitudes above.

#### Scenario: The DTO layer constructs `Money` from the wire string, not from a parsed float

- **WHEN** `ExternalTaxSchemas`, `ExternalFuturesSchemas`, `FiscalIntegritySchemas` or `MockDtoSchemas` maps a backend payload whose fiscal magnitude is the exact decimal string `"0.000000010000000001"`
- **THEN** the resulting entity field SHALL be a `Money` whose `toString()` returns that same string
- **AND** the mapping SHALL NOT pass the value through `parseFloat`, `Number(...)` or `z.coerce.number()` on its way into the domain entity.

#### Scenario: Counts, tallies and years are not forced into `Money`

- **WHEN** the fiscal domain model is type-checked
- **THEN** `TaxReportEntity.year`, `TaxReportEntity.excludedFlaggedEvents`, `TaxReportEntity.excludedUnresolvedIncomeCount`, `FiscalIntegrityGroupEntity.count`, `FiscalIntegrityGroupEntity.pendingReview`, `FiscalIntegrityReportEntity.totalDefects`, `FiscalIntegrityReportEntity.pendingReview`, `IngestionOutcomeEntity.processedCount` and the four `ReconciliationSummaryEntity` fields (`inserted`, `updated`, `retired`, `reactivated`) SHALL remain `number`
- **AND** no `Money` SHALL be constructed to hold any of them.

#### Scenario: An absent optional magnitude does not become a zero

- **WHEN** a `TaxTransactionEntity` of type `BUY` is produced with no swap legs, so that neither incoming nor outgoing leg amount arrived
- **THEN** `amountIn` and `amountOut` SHALL be `undefined`, and their declared type SHALL be `Money | undefined`
- **AND** they SHALL NOT be populated with a `Money` of value `0`
- **AND** a consumer distinguishing "no leg amount was stated" from "a leg amount of exactly zero was stated" SHALL be able to do so from the field alone
- **AND** this scenario SHALL NOT be read as preserving `saleFeeEur`'s `?`: that field's two wire shapes are indistinguishable to its only reader, so it carries `Money | null` and is governed by the unresolved-disposal-fee requirement instead.

#### Scenario: A truthiness guard over a retyped field is removed rather than carried over

- **WHEN** `views/Portfolio/components/table/LotEventHistory.vue` renders a lot event's `amountFromLot`
- **THEN** the existing `(row.event.amountFromLot || 0)` guard SHALL be deleted, because `amountFromLot` is required and every `Money` is truthy
- **AND** no retyped field SHALL be read behind `!field` or `field || fallback`
- **AND** where a retyped field is genuinely optional, the guard SHALL be an explicit `=== undefined` comparison, and where it is nullable the guard SHALL be an explicit null comparison.

#### Scenario: A defect-sentinel zero basis stays distinguishable from a real zero

- **WHEN** a `TaxLotEntity` carries a `qualityFlag` and therefore arrives with `unitCost` and `totalCost` of zero, because the persisted column cannot be null
- **THEN** both SHALL be a `Money` of value `0`, not `undefined`
- **AND** the UI SHALL continue to consult `qualityFlag` before presenting either figure, so an unknown basis is never reported as free.

#### Scenario: Rendered output is byte-identical after the retype

- **WHEN** the TaxReport and Portfolio screens are rendered from fiscal entities whose magnitudes are now `Money`
- **THEN** every retyped field SHALL render exactly the characters it rendered before the change, the seven columns named above excepted
- **AND** the two fixed-decimal sites — `views/Portfolio/components/table/ExpandedLotsTable.vue`'s four-decimal quantities and `views/Portfolio/components/table/LotEventHistory.vue`'s eight-decimal `amountFromLot` — SHALL render without thousands separators, via `Money.toFixed(4)` and `Money.toFixed(8)`
- **AND** they SHALL NOT be rerouted through `formatNumber` from `composables/useFormatters.ts`, whose `Intl.NumberFormat` grouping would render `12345.6789` as `12,345.6789`
- **AND** the existing rendered-text component tests SHALL pass unchanged.

#### Scenario: A retyped magnitude reaching a formatter is stringified, not re-parsed by the domain

- **WHEN** a retyped field is passed to `formatCurrency`, `formatPercent` or `formatNumber`
- **THEN** the call site SHALL pass `field.toString()`, and those formatters' signatures SHALL be unchanged
- **AND** the formatted result SHALL equal the result those formatters produced for the same value before the retype.

#### Scenario: A `Money` fiscal magnitude survives Vue reactive state

- **WHEN** fiscal entities holding `Money` magnitudes are placed in a `reactive` array or a `ref` object and read back through the resulting proxy
- **THEN** arithmetic and comparison across a proxied and a non-proxied `Money` SHALL produce the same results as outside reactive state
- **AND** no `markRaw` or `shallowRef` opt-out SHALL be required for fiscal rows to remain reactive.

### Requirement: An Unresolved Spot Magnitude Is Never Presented As Zero

`TaxTransactionEntity.totalEur` SHALL be typed `Money | null`, and the DTO transform that derives it SHALL preserve the distinction `apps/backend/src/core/domain/ports/ILedgerPort.ts` documents for `total_fiat`: `null` means no total and no price could be resolved at ingestion, while a stated `0` is a recorded fact. The transform SHALL NOT collapse the two with `?? 0`.

Because the transform re-derives `totalEur` per operation type rather than passing it through, each branch SHALL be decided on its own semantics against one criterion: a `Money` of value zero only where zero is a structural property of the operation itself; `null` where a fiat figure exists in principle but was not resolved; and the resolved figure wherever the backend resolved one. That per-branch treatment SHALL apply to `totalEur` alone, because `totalEur` is the only field the transform re-derives per operation type.

Measured at the emitter, that criterion's structural-zero arm has **no inhabitant in this transform**. `CsvIngestionUseCase.resolveFiatMagnitudes` is invoked on the single spot ingestion path before the `LedgerSpotTransaction` literal is built, and it branches on no `tx_type` whatsoever: where the source stated neither a total nor a price, it fetches a market unit price for the incoming or outgoing asset and multiplies. A `DEPOSIT`, `TRANSFER_IN`, `WITHDRAWAL` or `TRANSFER_OUT` row therefore carries a resolved `total_fiat` whenever a price series answered, exactly as an `AIRDROP` row does. Consequently **every** branch of this transform SHALL read `raw.total_fiat ?? null`, and after this change **no field in scope SHALL construct a `Money` of value zero anywhere in the fiscal DTO layer**. A later reader who finds a `Money('0')` constructed there has found a regression, and the criterion's structural-zero arm SHALL NOT be re-populated by inferring a zero from an operation type: a source that genuinely means "this row has no fiat magnitude" declares that in its own `sourceProfile` entry, never as a global assumption in a presentation-layer transform.

The same criterion, applied field by field rather than branch by branch, SHALL govern the transform's remaining coalesced magnitudes, each decided against its own emitter's declaration and not by uniformity with its neighbours:

- `priceEur` SHALL be `Money | null`. Its source `price_fiat` is nullable under the very comment that documents `total_fiat`'s null, so this is the same defect one field over, and it takes the same treatment and the same dash gate.
- `feeEur` SHALL be `Money | null`, and SHALL be `null` on every row until a fiat-denominated fee is actually exposed on the wire. Two measurements at the emitter force this. First, the key the schema reads — `fee_fiat` — **has no producer**: the spot route serialises `LedgerSpotTransaction` verbatim, and that port declares the fee as `fee_amount` plus `fee_asset_id`, so `fee_fiat` never arrives and the field is a fabricated `0` on 100% of rows today. Second, an absent `fee_amount` does not mean "the source stated no fee": `resolveFee` produces its absence from three distinct situations — an empty fee cell (`NO_FEE` with `stated: false`, which the emitter's own comment calls unknown), a stated zero with no resolvable denomination that the ledger's amount/asset pair invariant discards to NULL, and `PENDING_REVIEW`, a fee that exists with an unresolved unit. Only one of the three is a zero, so absence means unresolved. A stated, denominated zero is persisted as the string `'0'`, is truthy, and arrives as `Money('0')`, so the two states remain separable without a fabrication.
- `amount` SHALL be `Money | null`, at every one of the transform's six branch sites. Its sources `amount_in` and `amount_out` are optional at the port and their absence is genuinely reachable in the persisted ledger, and in each branch `amount` is the magnitude of the crypto leg the row is about — the leg whose asset becomes the row's `symbol` — so an absent leg is an unresolved quantity, not a quantity of zero.
- `amountIn` and `amountOut` SHALL keep their optionality as `Money | undefined` and SHALL NOT gain a `null` arm. Nothing coalesces them today, their absence is the operation's shape rather than a missing measurement, and adding a second absent state beside the `?` would be the three-state union this delta forbids elsewhere.

A rejected alternative is recorded because it is the more principled-sounding one: the schema SHALL NOT be made to reject a row whose defining leg is absent. A rejected row is not surfaced anywhere — the adapter skips it with a console warning, and the one endpoint that would list rejections returns a hardcoded empty array — so refusal would make a defective row vanish with no user-visible trace, which is worse than the zero it replaces. It also contradicts this repository's established handling of the same situation, which keeps the row and marks the figure: a lot with an unresolvable basis is retained with a quality flag, and a disposal with no resolved price is retained as a nullable conversion outcome. Refusing the row becomes the correct answer only once a surface exists that shows refusals.

A second rejected alternative is recorded because it is the tempting one-line fix for `feeEur`: the schema SHALL NOT be repointed at the emitter's real key, `fee_amount`. That value is denominated in `fee_asset_id`, which the fee router resolves to a **crypto** asset on the asset-disposal path and to a fiat currency only on the basis-adjustment path, so mapping it into a field named `…Eur` would print a fee of `0.0001 BTC` as `€0,0001` — a unit fabrication in place of a magnitude fabrication. The honest shape is a discriminated union of an asset-quantity fee against a fiat-valuation fee, carried on the wire beside its unit; that is a fee-exposure change of its own and is deliberate follow-up work. `feeEur` is therefore kept, typed `Money | null`, and left unpopulated rather than either deleted or filled from the wrong unit.

The scope of this requirement is display, and after this revision it spans **all** spot transaction types rather than only the income ones: `AIRDROP`, `REWARD` and `FEE` rows move from a fabricated `€0.00` to their resolved valuation, the four deposit/transfer types do the same having lost their forced zero, and any row whose fiat magnitude never resolved moves from `€0.00` to `—`. `totalEur` is read by three passthrough mappings and exactly one table cell; no frontend sum, comparison, or tax base reads it, and the IRPF bases are computed by the backend on its own report route from the ledger. The same holds for `priceEur` and `amount`: one table cell each, feeding no computation. `feeEur` has no cell at all. This change therefore alters no calculated fiscal figure and moves no tax liability. The defect being corrected is that three columns of one table assert a zero that was never true.

This requirement SHALL NOT be read as a fiscal change of any kind. No calculated figure changes, no total, base or estimated liability moves, and **no taxable disposal is created**: rendering a resolved valuation in the Total column of a `TRANSFER_IN` or `TRANSFER_OUT` row is a display act on a table cell that no allocation, queue or tax base reads. The global per-asset tax FIFO SHALL remain materialised backend-side from the ledger partitioned by asset and ordered by timestamp and transaction id, and per-account custody SHALL keep its own oldest-first allocation and its synthetic own-wallet counterparty. Neither ordering is touched, and the two SHALL NOT be conflated by anything in this requirement.

This requirement governs the fiscal perimeter only. The same `?? 0` idiom appears roughly sixty further times in this project's DTO layer — chiefly in the crypto-metrics, portfolio and risk-metrics schemas and the portfolio block of the mock schemas — over portfolio-valuation and metrics figures rather than fiscal magnitudes. Those are deliberately out of scope here, and this requirement's silence about them SHALL NOT be read as approval of them.

The canonical wire field names `total_fiat` and `price_fiat` SHALL be the only fiat-magnitude names this transform reads. `fee_fiat` SHALL be dropped from the schema entirely rather than merely stripped of its alias, because no route, use case or port emits it.

#### Scenario: A resolved fiat total reaches the entity instead of being discarded

- **WHEN** the transform maps an `AIRDROP`, `REWARD` or `FEE` row whose `total_fiat` the backend resolved
- **THEN** `totalEur` SHALL be a `Money` of that resolved value, not a forced zero
- **AND** the same SHALL hold for `BUY` (from `amount_out`, else `total_fiat`), `SELL` (from `amount_in`, else `total_fiat`), `SWAP` and `MIGRATION_SWAP` (from `total_fiat`), and the unclassified default branch (from `total_fiat`).

#### Scenario: An unresolved fiat total becomes null, not zero

- **WHEN** the transform maps a `BUY`, `SELL`, `SWAP`, `MIGRATION_SWAP`, `AIRDROP`, `REWARD`, `FEE` or unclassified row for which no fiat leg and no `total_fiat` arrived
- **THEN** `totalEur` SHALL be `null`
- **AND** it SHALL NOT be a `Money` of value zero, which would state that the operation moved nothing of value.

#### Scenario: A transfer or deposit reports its resolved valuation, not a forced zero

- **WHEN** the transform maps a `DEPOSIT`, `TRANSFER_IN`, `WITHDRAWAL` or `TRANSFER_OUT` row for which the ingestion layer resolved a `total_fiat`
- **THEN** `totalEur` SHALL be a `Money` of that resolved value, and SHALL NOT be a forced `Money` of value `0`
- **AND** the branch SHALL read `raw.total_fiat ?? null`, identically to every other branch of the transform
- **AND** the reason SHALL be a measurement at the emitter, not an inference from the operation type: `resolveFiatMagnitudes` runs on the single spot path for every row and branches on no `tx_type`, resolving a market valuation from the incoming or outgoing asset when the source stated none, so a forced zero was discarding a figure the backend had already resolved
- **AND** where no valuation resolved for such a row, `totalEur` SHALL be `null` and the cell SHALL render `—`, never `€0.00`
- **AND** no branch of this transform SHALL construct a `Money` of value `0`, so the criterion's structural-zero arm SHALL be stated as having no inhabitant here rather than left standing as a distinction that discriminates nothing.

#### Scenario: A structural zero is never inferred from an operation type

- **WHEN** any layer is inspected for a fiat magnitude asserted as zero on the basis of a row's `tx_type`
- **THEN** no such inference SHALL exist in the fiscal DTO layer
- **AND** a source convention stating that a given row shape carries no fiat magnitude SHALL be declared in that source's own `sourceProfile` entry and resolved per row, never assumed globally in a Zod transform
- **AND** a test asserting `totalEur` is `0` for a `DEPOSIT` SHALL be rewritten to assert the passthrough — the resolved value where `total_fiat` arrived, and `null` where it did not — and both cases SHALL be watched go red against a restored forced zero.

#### Scenario: The null total renders as a dash, not as a currency zero

- **WHEN** the transactions table renders a row whose `totalEur` is `null`
- **THEN** the cell SHALL render `—`
- **AND** the value SHALL NOT be passed to `formatCurrency` without a `null` gate, because `formatCurrency(null)` returns `'€0.00'` and would silently re-fabricate the zero this requirement removes
- **AND** `formatCurrency`'s own signature and null behaviour SHALL be unchanged, the gate living at the one call site that now holds a nullable field
- **AND** the gate SHALL follow the precedent `figureText` in `composables/useConvertedAmountDisplay.ts` already sets for a `ConvertedAmount` of `null`.

#### Scenario: A null total is never re-collapsed downstream

- **WHEN** any consumer of `totalEur` reads the field
- **THEN** it SHALL gate on `null` before invoking any `Money` method
- **AND** it SHALL NOT substitute `0`, in a formatter, an aggregation, or a comparison.

#### Scenario: An unresolved unit price becomes null

- **WHEN** the transform maps a spot row whose `price_fiat` the ledger recorded as null
- **THEN** `priceEur` SHALL be `null`, and the price cell SHALL render `—`
- **AND** the value SHALL NOT reach the currency formatter without a null gate, which would print `€0.00` for it.

#### Scenario: The fee field stops reading a key no producer sends

- **WHEN** the spot-transaction DTO schema is inspected
- **THEN** it SHALL NOT declare or read `fee_fiat`, that key being emitted by no route, use case or port — the spot route serialises `LedgerSpotTransaction`, whose fee members are `fee_amount` and `fee_asset_id`
- **AND** the only occurrences of `fee_fiat` remaining in the repository SHALL be DuckDB view internals serving other routes
- **AND** `feeEur` SHALL therefore be `null` on every parsed row, and SHALL NOT be a `Money` of value `0` on any of them
- **AND** the mock transaction schema SHALL carry the same nullable field, so the mock path does not report a zero where the real path reports `null`.

#### Scenario: An absent fee is unresolved, not a declared zero

- **WHEN** the transform maps a spot row for which `resolveFee` produced no fee amount
- **THEN** `feeEur` SHALL be `null`, because that absence has three producers and only one is a zero: an empty fee cell, which the emitter documents as unknown; a stated zero whose denomination could not be resolved, which the ledger's amount/asset pair invariant discards to NULL; and a `PENDING_REVIEW` fee that exists with an unresolved unit
- **AND** a stated, denominated zero SHALL arrive as a `Money` of value `0`, since it is persisted as the truthy string `'0'` and survives the adapter's presence gate, so the declared-zero and unresolved states SHALL remain separable without any fabrication
- **AND** no source convention SHALL be assumed to make absence mean "no fee charged": no `SourceFormatProfile` can currently declare that, its fee-denomination kinds answering only what unit a fee is charged in, so the decision SHALL be revisited only if such a declaration is added and consulted before the absence branch is taken.

#### Scenario: A row whose defining leg is absent keeps its place and reports an unresolved quantity

- **WHEN** the transform maps a row whose operation type defines its crypto leg — the incoming leg for an acquisition or inbound transfer, the outgoing leg for a disposal, fee or outbound transfer — and that leg's amount is absent in the ledger
- **THEN** `amount` SHALL be `null` and the amount cell SHALL render `—`
- **AND** the row SHALL still appear in the table, and the parse SHALL NOT be made to fail, because a rejected row is skipped with only a console warning and the endpoint that would list rejections returns a hardcoded empty array, so refusal would remove the row from the user's view entirely
- **AND** `amount` SHALL NOT be a `Money` of value zero, which would state that the row moved none of an asset
- **AND** every one of the transform's six branches SHALL apply this, each reading its own defining leg.

#### Scenario: The legacy `*_eur` wire aliases are gone

- **WHEN** the spot-transaction DTO schema is inspected
- **THEN** it SHALL declare `price_fiat` and `total_fiat`, and SHALL NOT declare `price_eur`, `fee_eur`, `total_eur` or `fee_fiat` — the last having no producer either, so deleting the alias alone would leave a key that never arrives
- **AND** no `??` fallback chain SHALL read an `*_eur` alias when deriving `totalEur`, `priceEur` or `feeEur`
- **AND** the deletion SHALL be safe because no route, use case or port in `apps/backend/src` emits those three names; the only feeders are frontend test fixtures, which SHALL be renamed to the canonical names in the same commit
- **AND** no compatibility tolerance SHALL be retained for an older backend, there being no deployment path that ships the two sides at different versions.

### Requirement: A Disposal Fee That Was Never Resolved Is Never Reported As Zero

A disposal event's fee figure SHALL be reported as unresolved wherever no fee was ever computed for it, and SHALL NOT be asserted as zero. The audit-trail emitter in the Spanish tax report use case SHALL emit `null` for `sale_fee`, and its DTO SHALL declare that field `ConvertedAmount | null`, matching the two nullable figures beside it in the same block rather than standing as the block's one non-nullable exception. The frontend field `TaxLotHistoryEvent.saleFeeEur` SHALL be typed `Money | null` and SHALL NOT be optional.

The reason the emitted value is `null` and not a figure is that no figure exists to emit: the converted-disposal-event port the emitter reads carries no fee member of any kind, so the hardcoded zero was never a placeholder for a value in hand — it was an assertion with no source. Resolving a real disposal fee, which would mean threading one through the disposal-event projection, is explicitly outside this requirement; this requirement only stops the report claiming a fee of zero.

The carrier on the wire SHALL be `ConvertedAmount | null` rather than an exact-decimal-string carrier, so that when a fee is eventually computed it reports its own conversion outcome exactly as the sale price beside it does, and no second migration of this field is required.

#### Scenario: An unresolved disposal fee travels as null, not as zero

- **WHEN** the Spanish tax report's audit trail is emitted for any disposal event
- **THEN** `sale_fee` SHALL be `null`
- **AND** it SHALL NOT be `0`, and the DTO SHALL NOT declare it as a non-nullable number
- **AND** the resulting `saleFeeEur` SHALL be `null`, never a `Money` of value zero, because retyping a fabricated zero to a precision Value Object would only make the fabrication exact.

#### Scenario: The fee cell renders a dash on every audit-trail row

- **WHEN** the tax report details table renders a row whose `saleFeeEur` is `null`
- **THEN** the cell SHALL render `—`
- **AND** this SHALL apply to every audit-trail row, all of which previously rendered a fabricated `€0.00`
- **AND** rows reached through the token-history route SHALL be unchanged, having already rendered `—`
- **AND** no total, tax base or estimated liability SHALL change, the field being display-only and feeding no computation.

#### Scenario: The existing null guard is sufficient and stays

- **WHEN** the fee cell's guard is inspected after the retype
- **THEN** the existing loose null comparison SHALL be retained, since it already catches both a null and an absent value and therefore no null ever reaches the currency formatter's `'€0.00'` fallback
- **AND** the only change at that call site SHALL be stringifying the `Money` for the formatter
- **AND** no new dash-rendering gate SHALL be added there, this being the difference from the transactions table's total cell, which had no guard at all.

#### Scenario: The unassigned token-history fee field is deleted

- **WHEN** the token-history use case's disposal-event DTO is inspected
- **THEN** its `sale_fee` declaration SHALL be removed, being declared and never assigned on that route
- **AND** the DTO SHALL NOT advertise a figure the route does not produce.

#### Scenario: Computing a real disposal fee is out of scope

- **WHEN** this requirement is verified
- **THEN** no fee value SHALL be derived, inferred, or attributed to a disposal event
- **AND** the absence of a fee figure SHALL be reported as unresolved rather than filled in
- **AND** a later change threading a real fee through the disposal-event projection SHALL be able to populate the same `ConvertedAmount` carrier without altering its type.

### Requirement: A Derivative Figure Its Emitter Did Not State Is Null, Not Zero

`TaxDerivativeEntity`'s five magnitudes SHALL each be typed against what their emitter actually declares. The emitter is **`LedgerFuturesTransaction`**, reached through the futures transactions route, and it declares all five carriers — `amount`, `trade_price`, `realized_pnl`, `funding_amount` and `fee_amount` — as **optional** exact `PreciseAmount`s, each backed by a nullable TEXT column and each mapped from a SQL NULL to `undefined` by the ledger adapter. Accordingly all five of `amount`, `tradePrice`, `realizedPnl`, `fees` and `funding` SHALL be `Money | null`, and none SHALL be a non-nullable `Money` whose absence produces a `Money` of value zero.

Because the five carriers are one shape, no split among them SHALL be introduced. Any division into "always sent" and "never sent" figures would have to be invented rather than measured: the earlier reading rested on a per-symbol `GROUP BY` aggregate that no longer serves this entity, and the four futures transaction types do not partition into those that can carry a given figure and those that cannot — a `TRADE` may or may not close a position, while `SETTLEMENT` and `LIQUIDATION` always realize something.

The measurement that decides all five the same way is that **the emitter distinguishes a stated zero from an absence, and preserves the stated zero**. The columns are TEXT, so a declared zero is persisted as the string `'0'`, is truthy, and survives the adapter's presence gate as `'0'`, arriving as a `Money` of value zero; `undefined` is therefore reachable only through a SQL NULL. And the ingestion layer documents that NULL: `resolveFee` persists `'0'` for a stated zero that carries a denomination and records in its own words that an undenominated zero "could only be stored as the NULL that means *unknown*". A carrier able to say zero and choosing to say nothing is not saying zero. This applies verbatim to `fees` and `funding`, whose absence is therefore unstated rather than measured-as-zero, and to `realizedPnl`, which is the report's primary taxable figure and where a fabricated zero would be a declared figure nobody measured.

A figure that was never resolved SHALL be reported through its type, never through a numeric sentinel. The pattern this replaces is a `0` that means both "genuinely zero" and "never supplied", read back as `!== 0` to choose between a figure and a dash; one value standing for two facts is the representable-but-meaningless state a discriminated shape exists to forbid, and retyping it to an exact `Money` while keeping an `isZero()` test would restate the defect in a new type rather than remove it.

The emitter SHALL NOT be modified by this requirement: it declares five optional exact carriers, preserves a stated zero, and its NULLs mean what the ingestion layer says they mean, so the fabrication is entirely in the frontend's coalescing. Where a given exchange genuinely never states one of these figures, that is a per-source convention to be declared in `sourceProfile/profiles.ts` and resolved per row — never a global display-layer assumption that one shape of NULL means zero.

This requirement's render changes SHALL be compared against the state after the derivatives PnL contract change has landed, because that change is what makes `LedgerFuturesTransaction` the emitter at all, and because the derivatives table renders no rows for any user before it. "Unchanged from today" is not a claim this requirement makes about that table. This requirement SHALL NOT be read as a fiscal change: no calculated figure moves, no disposal is created, and neither the global per-asset tax FIFO nor the per-account custody allocation is touched.

#### Scenario: All five derivative magnitudes are nullable, matching their optional carriers

- **WHEN** `TaxDerivativeEntity` is type-checked
- **THEN** `amount`, `tradePrice`, `realizedPnl`, `fees` and `funding` SHALL each be `Money | null`
- **AND** none of them SHALL be a non-nullable `Money`, and the DTO transform SHALL NOT coalesce any of them to a zero
- **AND** the transform SHALL read the emitter's own keys — `amount`, `trade_price`, `realized_pnl`, `funding_amount` and `fee_amount` — constructing a `Money` on the present branch and `null` on the absent one.

#### Scenario: A funding row's absent position size and price are null, not zero

- **WHEN** a derivatives row of the emitter's `FUNDING_FEE` transaction type is mapped, carrying neither a position size nor an execution price
- **THEN** `amount` and `tradePrice` SHALL each be `null`
- **AND** they SHALL NOT be a `Money` of value zero, which would state that a position of zero was traded at a price of zero
- **AND** the frontend entity type for such a row SHALL be its own `FUTURES_FUNDING` value, which SHALL NOT be confused with the emitter's `FUNDING_FEE` in either direction.

#### Scenario: A stated zero is distinguishable from an unresolved figure

- **WHEN** a futures row carries a source-declared zero for its fee, its funding or its realized result
- **THEN** the corresponding field SHALL be a `Money` of value zero, because the persisted TEXT `'0'` is truthy and survives the adapter's presence gate
- **AND** a row whose corresponding column is SQL NULL SHALL yield `null` for that field
- **AND** the two SHALL be distinguishable from the field alone, with no reader inferring either state from the transaction type.

#### Scenario: A dash is chosen by a null test, not by comparing against zero

- **WHEN** a view decides whether to render a derivative's position size, execution price, realized result, or fee and funding breakdown as a dash
- **THEN** it SHALL branch on the field being `null`
- **AND** it SHALL NOT branch on the field being equal to zero, whether written as `!== 0` or as `isZero()`
- **AND** a genuinely zero figure SHALL therefore render as a zero — and appear in the fees/funding breakdown — rather than as a dash or being suppressed
- **AND** the null arm SHALL precede any `isPositive`/`isNegative` test and any `>= 0` comparison, since `null >= 0` evaluates true in JavaScript.

#### Scenario: A null figure is never passed to a formatter that fabricates a zero

- **WHEN** the derivatives table renders a row whose `amount`, `tradePrice` or `realizedPnl` is `null`
- **THEN** an explicit `=== null` gate SHALL render `—` before the value reaches a formatter
- **AND** the gate SHALL be required rather than incidental, because the currency formatter returns `'€0.00'` for `null` and the number formatter returns its own zero-shaped fallback, so retyping the field without the gate would silently re-fabricate the zero
- **AND** the formatters' own signatures and null behaviour SHALL be unchanged, each gate living at the call site that now holds a nullable field.

#### Scenario: Net impact propagates null rather than summing an unknown as zero

- **WHEN** the net impact of a derivatives row is computed from its funding and its fees
- **THEN** it SHALL return the exact `Money` difference when both operands are resolved, using `Money`'s own subtraction
- **AND** it SHALL return `null` when **either** operand is `null`, and SHALL NOT sum an unresolved operand as zero nor sum only the resolved component, both of which are the coalescing fabrication under another name
- **AND** the cell SHALL render `—` for that `null`, with the class-selecting comparison taking its null arm first
- **AND** the resolved result SHALL be exact for values whose float arithmetic would round, such as a funding of `0.3` against fees of `0.1` yielding exactly `0.2`.

#### Scenario: Sorting by realized PnL places unresolved rows last in both directions

- **WHEN** the derivatives table is sorted by `realizedPnl`, which is now nullable
- **THEN** rows whose `realizedPnl` is `null` SHALL sort **last** in ascending order and last in descending order, an unresolved figure being not smaller than a loss
- **AND** the null check SHALL be explicit and precede any `compareTo` call, and the comparator SHALL remain total so that the sort's stability still holds
- **AND** the ascending and the descending assertions SHALL each be watched go red against a deliberate sign break in the comparator.

