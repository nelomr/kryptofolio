# domain-financial-precision Specification

## Purpose
TBD - created by archiving change phase-0-domain-conditioning. Update Purpose after archive.
## Requirements
### Requirement: Financial Arithmetic Encapsulation
All financial amounts, fees, and fiat values across the application SHALL be represented and computed using a precision Value Object (`Money` or `PreciseAmount`) wrapping `decimal.js`. Native JavaScript `number` types SHALL NOT be used for any financial calculations to prevent IEEE-754 precision loss.

#### Scenario: Zero Precision Loss in Aggregation
- **WHEN** a financial Value Object is split into 10,000 micro-amounts and then summed back together
- **THEN** the total SHALL be strictly equal to the original amount (e.g., `1.000000000000000000`)
- **AND** there SHALL NOT be any ghost balances or rounding differences.

#### Scenario: No Native Numbers in Financial Entities
- **WHEN** `Transaction` or `Account` entities are inspected
- **THEN** properties like `amount`, `fee_amount`, and `fiat_value_eur` SHALL be typed as the precision Value Object, not `number`.

