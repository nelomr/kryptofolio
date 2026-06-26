# financial-data-models Specification

## Purpose
TBD - created by archiving change phase-1-sqlite-oltp. Update Purpose after archive.
## Requirements
### Requirement: Unified Financial Types via `shared-types`
The domain SHALL use Branded Types and strict Zod schemas housed exclusively in `packages/shared-types` (`SpotTransactionSchema`, `FuturesTransactionSchema`, `TaxLotSchema`) to guarantee seamless interoperability between the frontend mocks/views and the backend SQLite adapters.

#### Scenario: Instantiating a HoldingItem
- **WHEN** mapping an aggregate representing a portfolio holding
- **THEN** it strictly conforms to the `HoldingItem` type structure, ensuring `unrealized_pnl_eur` and `cost_basis_eur` are accurately typed and verified

