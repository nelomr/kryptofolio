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
