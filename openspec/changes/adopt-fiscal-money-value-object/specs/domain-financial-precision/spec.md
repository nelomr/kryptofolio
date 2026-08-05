## MODIFIED Requirements

### Requirement: Financial Arithmetic Encapsulation
All financial amounts, fees, and fiat values across the application SHALL be represented and computed using a precision Value Object (`Money` or `PreciseAmount`) wrapping `decimal.js`. Native JavaScript `number` types SHALL NOT be used for any financial calculations to prevent IEEE-754 precision loss. This applies to the frontend's own domain models, not only to the backend/database boundary: a fiscal entity constructed from an already-precise wire value MUST NOT be retyped to a bare `number` on its way into the frontend's domain layer.

#### Scenario: Zero Precision Loss in Aggregation
- **WHEN** a financial Value Object is split into 10,000 micro-amounts and then summed back together
- **THEN** the total SHALL be strictly equal to the original amount (e.g., `1.000000000000000000`)
- **AND** there SHALL NOT be any ghost balances or rounding differences.

#### Scenario: No Native Numbers in Financial Entities
- **WHEN** `Transaction` or `Account` entities are inspected
- **THEN** properties like `amount`, `fee_amount`, and `fiat_value_eur` SHALL be typed as the precision Value Object, not `number`.

#### Scenario: No Native Numbers in the Frontend's Fiscal Entities
- **WHEN** `apps/frontend/src/core/domain/models/FiscalEntities.ts`'s `TaxTransactionEntity`, `TaxLotEntity`, `TaxLotHistoryEvent`, `TaxDerivativeEntity`, and `TaxReportSummary` are inspected
- **THEN** every monetary or quantity field (cost, price, fee, gain/loss, realized PnL, funding, capital gains/losses, estimated IRPF) SHALL be typed as `Money`, or `Money | null` where the parent change's own nullability decision applies
- **AND** a genuinely-integer field (a count, a year) SHALL NOT be forced into `Money`

#### Scenario: A comparison against a fiscal `Money` field does not fall back to a native operator
- **WHEN** a view or composable compares, sorts, or checks the sign of a `Money`-typed fiscal field
- **THEN** it SHALL use `Money`'s own `compareTo`/`isNegative`/`isZero`/`isPositive` methods
- **AND** it SHALL NOT read a private numeric representation to perform the comparison itself
