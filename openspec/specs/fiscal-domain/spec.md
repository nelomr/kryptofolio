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

The fiscal domain models and all new value objects SHALL contain no framework dependency, and no use of the `any` type.

#### Scenario: Domain layer imports no framework

- **WHEN** the fiscal domain models, custody value objects, and provenance types are inspected
- **THEN** they MUST NOT import Zod, Axios, or Vue
- **AND** `scripts/check-domain-isolation.sh` MUST pass

#### Scenario: No any type is present

- **WHEN** the fiscal domain and its DTO schemas are type-checked
- **THEN** no `any` type MUST appear
- **AND** `unknown` with narrowing MUST be used where a dynamic value is unavoidable

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

