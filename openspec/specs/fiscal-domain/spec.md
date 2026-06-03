# fiscal-domain Specification

## Purpose
TBD - created by archiving change hex-arch-zod-refactor. Update Purpose after archive.
## Requirements
### Requirement: Define Tax and Fiscal Domain Models
The system SHALL define strict TypeScript domain models for all fiscal capabilities inferred from the legacy system, protecting the UI from fragmented legacy properties.

#### Scenario: Defining Tax Transactions
- **WHEN** creating the `TaxTransactionEntity`
- **THEN** it MUST include normalized fields: `symbol`, `type` (BUY, SELL, DEPOSIT, etc.), `amount`, `total_eur`, `price_eur`, `fee_eur`, and `timestamp` as a native `Date` object

#### Scenario: Defining Portfolio Summaries
- **WHEN** creating the `PortfolioSummaryEntity`
- **THEN** it MUST contain nested metrics (`total_equity_eur`, `total_cost_basis_eur`, `total_realized_pnl_eur`, `total_unrealized_pnl_eur`, `total_pnl_eur`) and an array of `HoldingEntity`

#### Scenario: Defining Tax Reports
- **WHEN** creating the `TaxReportEntity`
- **THEN** it MUST include a summary with `capital_gains_eur`, `capital_losses_eur`, `savings_base_yields_eur`, `general_base_airdrops_eur`, `net_patrimonial_result_eur`, and `estimated_irpf_eur`
- **AND** include an `audit_trail` array of detailed calculation events

### Requirement: Zod Schemas for Legacy Data Sanitization
The system SHALL implement complex Zod DTO schemas (`ExternalTaxTransactionSchema`, `ExternalTaxReportSchema`, `ExternalTokenDetailsSchema`) to normalize inconsistencies from the legacy API before they reach the domain layer.

#### Scenario: Resolving Transaction Types and Symbols
- **WHEN** the legacy API sends a transaction with `tx_type: 'BUY'`, `asset_in: 'BTC'`, and `amount_in: 0.5`
- **THEN** the Zod schema (`preprocess`) MUST map it cleanly so the adapter can construct a `TaxTransactionEntity` with `type: 'BUY'`, `symbol: 'BTC'`, and `amount: 0.5`

#### Scenario: Resolving Numeric Strings and Aliases
- **WHEN** the legacy API sends metrics like `weighted_average_cost` or string values like `"0.50"`
- **THEN** Zod MUST cast them to numbers and map them to their standard domain equivalents (e.g., `avg_price_eur`)

## MODIFIED Requirements

### Requirement: Define Tax and Fiscal Domain Models
The system SHALL define strict TypeScript domain models for all fiscal capabilities inferred from the legacy system, protecting the UI from fragmented legacy properties. The `ITaxRepository` port SHALL also declare two operational methods: `uploadTaxFile` and `deleteAllTransactions`.

#### Scenario: Defining Tax Transactions
- **WHEN** creating the `TaxTransactionEntity`
- **THEN** it MUST include normalized fields: `symbol`, `type` (BUY, SELL, DEPOSIT, etc.), `amount`, `total_eur`, `price_eur`, `fee_eur`, and `timestamp` as a native `Date` object

#### Scenario: Defining Portfolio Summaries
- **WHEN** creating the `PortfolioSummaryEntity`
- **THEN** it MUST contain nested metrics (`total_equity_eur`, `total_cost_basis_eur`, `total_realized_pnl_eur`, `total_unrealized_pnl_eur`, `total_pnl_eur`) and an array of `HoldingEntity`

#### Scenario: Defining Tax Reports
- **WHEN** creating the `TaxReportEntity`
- **THEN** it MUST include a summary with `capital_gains_eur`, `capital_losses_eur`, `savings_base_yields_eur`, `general_base_airdrops_eur`, `net_patrimonial_result_eur`, and `estimated_irpf_eur`
- **AND** include an `audit_trail` array of detailed calculation events

#### Scenario: ITaxRepository includes uploadTaxFile
- **WHEN** a class declares `implements ITaxRepository`
- **THEN** TypeScript SHALL require implementing `uploadTaxFile(file: File): Promise<void>` and `deleteAllTransactions(): Promise<void>` in addition to the existing six methods



## MODIFIED Requirements

### Requirement: Zod Schemas for Legacy Data Sanitization
The system SHALL implement complex Zod DTO schemas (`ExternalTaxTransactionSchema`, `ExternalTaxReportSchema`, `ExternalTokenDetailsSchema`) to normalize inconsistencies from the legacy API before they reach the domain layer. The `audit_trail` field SHALL be validated with a proper `ExternalTaxLotHistorySchema` instead of `z.array(z.unknown())`.

#### Scenario: Resolving Transaction Types and Symbols
- **WHEN** the legacy API sends a transaction with `tx_type: 'BUY'`, `asset_in: 'BTC'`, and `amount_in: 0.5`
- **THEN** the Zod schema (`preprocess`) MUST map it cleanly so the adapter can construct a `TaxTransactionEntity` with `type: 'BUY'`, `symbol: 'BTC'`, and `amount: 0.5`

#### Scenario: Resolving Numeric Strings and Aliases
- **WHEN** the legacy API sends metrics like `weighted_average_cost` or string values like `"0.50"`
- **THEN** Zod MUST cast them to numbers and map them to their standard domain equivalents (e.g., `avg_price_eur`)

#### Scenario: Audit trail entries are typed and validated
- **WHEN** the legacy API sends a tax report with an `audit_trail` array
- **THEN** each entry SHALL be validated through `ExternalTaxLotHistorySchema` producing `TaxLotHistoryEvent` domain entities with `disposalDate` as native `Date`, `gainLossEur` as `number`, and `isTaxable` as `boolean`

#### Scenario: Malformed audit trail entries use safe defaults
- **WHEN** an audit trail entry has missing optional fields (e.g., `flag`, `notes`)
- **THEN** the schema SHALL produce a valid `TaxLotHistoryEvent` with `undefined` for optional fields and `0` for missing numeric fields
