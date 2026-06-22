# domain-anti-corruption Specification

## Purpose
TBD - created by archiving change phase-0-domain-conditioning. Update Purpose after archive.
## Requirements
### Requirement: String-Based API Boundaries
All financial numbers crossing the application boundaries (e.g., from DB to Domain, or Frontend to Backend) MUST be transported as strings to preserve precision. The system MUST validate these strings before instantiation.

#### Scenario: Zod Validation of Financial Strings
- **WHEN** a payload containing financial data enters the system
- **THEN** it SHALL be validated against a Zod schema (e.g., `preciseAmountSchema`)
- **AND** the schema SHALL enforce a strict regex for decimal strings (`/^-?\d+(\.\d+)?$/`)
- **AND** it SHALL verify that `decimal.js` can successfully parse the string.

#### Scenario: Rejection of Invalid Floats
- **WHEN** a payload contains a native JavaScript `number` for a financial field instead of a valid string
- **THEN** the Zod schema validation SHALL fail.

