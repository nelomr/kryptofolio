# domain-financial-precision Specification

## Purpose
TBD - created by archiving change phase-0-domain-conditioning. Update Purpose after archive.
## Requirements
### Requirement: Financial Arithmetic Encapsulation

All financial amounts, fees, and fiat values across the application SHALL be carried by a representation that cannot lose a decimal place. Three carriers satisfy this requirement, and no other: a precision Value Object wrapping `decimal.js` (`Money` in `packages/core-domain`, or the branded `PreciseAmount` in `apps/backend`); an exact decimal `string` validated by `preciseAmountSchema`; or a discriminated union whose amount fields are themselves `preciseAmountSchema` strings (`ConvertedAmount` in `packages/shared-types`, which additionally carries the conversion outcome). Native JavaScript `number` types SHALL NOT be used for any financial amount or for any financial calculation, to prevent IEEE-754 precision loss.

This requirement applies to the frontend's own domain models, not only to the backend and database boundary: a fiscal magnitude that arrives over the wire as an exact decimal string SHALL NOT be retyped to a bare `number` on its way into the frontend's domain layer.

Choosing among the compliant carriers is a modelling decision, not a licence to loosen precision. A field whose only operations are display and aggregation MAY remain an exact decimal `string`. A field that is compared, sorted, or arithmetically combined SHALL be a precision Value Object, so that the comparison and the arithmetic are performed by `decimal.js` and never by a native operator. A field that must also report whether and how it was currency-converted SHALL remain a `ConvertedAmount`, because collapsing that union into a bare amount would delete fiscal information (the applied rate, its date, the native currency, and the unconvertible outcome) that no precision type can represent.

A compliant carrier does not by itself make an operation compliant. Every comparison, sign test, and ordering of a value held by any of the three carriers SHALL be performed exactly — by the Value Object's own comparison surface, or by a named exact-decimal comparison helper over the string contract — and SHALL NOT be performed by projecting the value to a `number` first. This holds regardless of what the result is used for: a comparison whose only consumer is a CSS class is still a comparison, and while a lost trailing digit is harmless to a rendered *magnitude*, it is not harmless to a *sign*, which is the entire output of a sign test.

Where a value originates outside the fiscal domain as a `number`, the loss has already happened upstream; converting it SHALL be an explicit, named boundary step that produces an exact decimal string, and SHALL NOT be performed by native string coercion.

No shared helper that truncates, rounds, or otherwise degrades an amount SHALL remain reachable from application code, whether or not it currently has a consumer. An unreferenced but importable lossy helper is a defect of this requirement, because it is what the next implementer finds when looking for a way to compare two amounts.

#### Scenario: Zero Precision Loss in Aggregation

- **WHEN** a financial Value Object is split into 10,000 micro-amounts and then summed back together
- **THEN** the total SHALL be strictly equal to the original amount (e.g., `1.000000000000000000`)
- **AND** there SHALL NOT be any ghost balances or rounding differences.

#### Scenario: No Native Numbers in Financial Entities

- **WHEN** `Transaction` or `Account` entities are inspected
- **THEN** properties like `amount`, `fee_amount`, and `fiat_value_eur` SHALL be typed as the precision Value Object, not `number`.

#### Scenario: No Native Numbers in the Frontend's Fiscal Entities

- **WHEN** `apps/frontend/src/core/domain/models/FiscalEntities.ts` is inspected
- **THEN** no monetary or quantity field of `TaxDerivativeEntity`, `TaxTransactionEntity`, `TaxLotEntity`, `TaxLotHistoryEvent`, `LotRelocationEntity`, or `LotCustodyLocation` SHALL be typed `number`
- **AND** each such field SHALL be typed `Money`, or `Money | null` where the layer below it reports an unresolved figure as distinct from a zero one
- **AND** a field already carried by a compliant non-`Money` representation SHALL be left as it is: `TaxReportSummary`'s six aggregate figures SHALL remain exact decimal `string`, and `TaxLotHistoryEvent.salePrice` / `.gainLoss` SHALL remain `ConvertedAmount | null`
- **AND** a genuinely-integer field — a year, a count, or a row tally — SHALL NOT be forced into `Money`.

#### Scenario: A comparison against a fiscal `Money` field does not fall back to a native operator

- **WHEN** a view, composable, or sort comparator compares, orders, or checks the sign of a `Money`-typed fiscal field
- **THEN** it SHALL use `Money`'s own `compareTo`, `isNegative`, `isZero`, or `isPositive`
- **AND** it SHALL NOT reach the private `Decimal` or any numeric projection of it to perform the comparison itself
- **AND** `Money` SHALL NOT expose a `toNumber()` or a getter for its private `Decimal`, so that no such projection exists to reach for.

#### Scenario: A comparison against any exact-decimal carrier does not fall back to a native operator

- **WHEN** a view or composable checks the sign of, or orders, an exact decimal figure that is not a `Money` — a `ConvertedAmount`'s `amount` or `nativeAmount`, or a bare decimal `string` field validated by `preciseAmountSchema`
- **THEN** it SHALL compare the exact decimal strings through `compareDecimalStrings` from `packages/shared-types/src/money/compare.ts`, whose result is `-1`, `0`, or `1`
- **AND** it SHALL NOT apply `Number(...)`, `parseFloat(...)`, or unary `+` to the string and then use a native comparison operator
- **AND** given the operands `"0.1"` plus `"0.2"` against `"0.3"`, the exact comparison SHALL report equality where the float path reports `0.30000000000000004`
- **AND** the three measured sites SHALL all be converted together: `composables/useConvertedAmountDisplay.ts`'s `figureTone`, `views/TaxReport/composables/useTaxCalculations.ts`'s `getEventVariant`, and `views/TaxReport/components/TaxReportSummaryCards.vue`'s local `isPositive`.

#### Scenario: A sign test whose only consumer is a CSS class is still exact

- **WHEN** `views/TaxReport/components/TaxReportSummaryCards.vue` decides the colour class for `capitalGains`, `yields`, or `totalLosses` — three exact decimal `string` figures it receives as props
- **THEN** the predicate SHALL be an exact decimal comparison against `"0"`, not `Number(figure) > 0`
- **AND** a figure of `"0.0000000000000000001"` SHALL be reported as above zero, where the float path underflows it to `0` and paints it as neither a gain nor a loss
- **AND** the argument that a CSS class tolerates losing the last decimal places SHALL NOT be accepted as a justification, because the predicate returns only the sign and the sign is what the float path destroys
- **AND** the carrier SHALL NOT be retyped to make the comparison safe: an exact decimal `string` is already compliant, and only the operator is at fault.

#### Scenario: A `number` crossing into the fiscal domain is converted exactly at the boundary

- **WHEN** a value that originates outside the fiscal domain as a native `number` must be combined with or compared against a `Money`
- **THEN** it SHALL first be converted to an exact decimal string by the named boundary helper `preciseAmountFromNumber` from `packages/shared-types/src/money/compare.ts`, and only then passed to the `Money` constructor
- **AND** that helper's output SHALL always satisfy `preciseAmountSchema`, including for a small magnitude such as `1e-7`, for which it SHALL produce `"0.0000001"`
- **AND** the conversion SHALL NOT be performed by `String(value)` or template interpolation, which yields exponential notation such as `"1e-7"` that `preciseAmountSchema` rejects at runtime
- **AND** the helper SHALL return a `string`, not a `Money`, so that the call site cannot read the conversion as a precision upgrade of an already-lossy input.

#### Scenario: No truncating amount helper remains reachable from application code

- **WHEN** `apps/frontend/src/lib/utils.ts` is inspected
- **THEN** it SHALL export no amount-handling helper: `MONETARY_FIELDS`, `safeAmountToNumber`, `gt`, `lt`, `isPositive`, `isNegative`, `isZero` and `formatAmount` SHALL all be deleted
- **AND** in particular no helper SHALL round an amount to a fixed number of decimals on the way to a comparison, as `safeAmountToNumber`'s `parseFloat(n.toFixed(5))` does, and no helper SHALL declare a quantity to be zero because it falls below an absolute epsilon, as `isZero`'s `0.00001` does — over crypto quantities that threshold is a holding, not a zero
- **AND** they SHALL be deleted rather than reimplemented exactly, because they have no consumer and `Money` and `compareDecimalStrings` already answer these questions for their respective carriers
- **AND** `cn`, `CSSVars` and `getDeterministicHue` SHALL remain, having real consumers
- **AND** this requirement SHALL NOT be read as governing non-monetary dead code: `stringToColor` is removed from the same file as adjacent cleanup, superseded by `getDeterministicHue`, and its removal is not a precision matter.

