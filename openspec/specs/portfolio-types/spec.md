# Portfolio Types Specification

## Purpose

The portfolio type surface: metrics, holdings, tax lots and lot history events.

## Requirements

### Requirement: PortfolioMetrics interface
The system SHALL define a `PortfolioMetrics` TypeScript interface in `src/types/portfolio.ts` with fields: `total_equity_eur: number`, `total_realized_pnl_eur: number`, `total_unrealized_pnl_eur: number`.

#### Scenario: Interface is importable
- **WHEN** a Vue component or Pinia store imports `PortfolioMetrics` from `src/types/portfolio.ts`
- **THEN** TypeScript resolves the type without error and all three numeric fields are available

#### Scenario: Missing field causes compile error
- **WHEN** an object is assigned to `PortfolioMetrics` without one of its required fields
- **THEN** the TypeScript compiler reports a type error

---

### Requirement: HoldingItem interface
The system SHALL define a `HoldingItem` TypeScript interface with fields: `symbol: string`, `amount: number`, `avg_price_eur: number`, `weighted_average_cost: number`, `current_value_eur: number`, `cost_basis_eur: number`, `unrealized_pnl_eur: number`, `pnl_eur: number`, `portfolio_locations: string[]`.

#### Scenario: portfolio_locations is typed as string array
- **WHEN** a component accesses `holdingItem.portfolio_locations`
- **THEN** TypeScript infers it as `string[]`, enabling array methods without casting

#### Scenario: Interface covers all required fields
- **WHEN** a mock or API response object satisfies `HoldingItem`
- **THEN** all 9 fields are present and correctly typed

---

### Requirement: TaxLot interface
The system SHALL define a `TaxLot` TypeScript interface with fields: `id: string`, `symbol: string`, `date: number` (UNIX timestamp seconds), `exchange: string`, `original_qty: number`, `remaining_qty: number`, `unit_cost: number`, `total_cost: number`.

#### Scenario: date field accepts UNIX timestamp integer
- **WHEN** `date` is assigned an integer (e.g., `1672531200`)
- **THEN** TypeScript accepts it as `number` without casting

#### Scenario: remaining_qty can equal zero
- **WHEN** a fully-consumed lot has `remaining_qty: 0`
- **THEN** TypeScript accepts it (number type permits zero)

---

### Requirement: LotHistoryEvent interface
The system SHALL define a `LotHistoryEvent` TypeScript interface with fields: `id: string`, `disposal_date: number`, `amount_from_lot: number`, `sale_price_eur: number`, `gain_loss_eur: number`, `is_taxable: boolean`, `flag?: 'WALLET_ACTIVATION' | null`, `notes?: string`.

#### Scenario: flag is optional with restricted union type
- **WHEN** `flag` is omitted from a `LotHistoryEvent` object
- **THEN** TypeScript accepts the omission (optional field)

#### Scenario: flag rejects invalid values
- **WHEN** `flag` is assigned any string other than `'WALLET_ACTIVATION'` or `null`
- **THEN** TypeScript reports a type error

---

### Requirement: PortfolioData root interface
The system SHALL define a `PortfolioData` root interface that wraps all domain types:
- `summary.metrics: PortfolioMetrics`
- `summary.holdings: HoldingItem[]`
- `lots: Record<string, TaxLot[]>` (keyed by symbol)
- `history: Record<string, Record<string, { status: 'FULL' | 'PARTIAL' | 'EMPTY'; history: LotHistoryEvent[] }>>` (keyed by symbol then lot ID)

#### Scenario: Root type accepted by Pinia store
- **WHEN** a Pinia store state is typed as `PortfolioData` and assigned a conforming object
- **THEN** TypeScript resolves all nested field accesses without errors

#### Scenario: Non-conforming root object is rejected
- **WHEN** an object missing `summary.metrics` is assigned to `PortfolioData`
- **THEN** TypeScript reports a type error on the missing nested field



### Requirement: PortfolioMetrics interface
**Reason**: The `PortfolioMetrics` interface in `src/types/portfolio.ts` uses legacy snake_case field names (`total_equity_eur`) that duplicate the proper `PortfolioMetricsEntity` domain model in `src/core/domain/models/PortfolioEntities.ts` which uses camelCase (`totalEquityEur`).
**Migration**: All imports from `@/types/portfolio` SHALL be replaced with imports from `@/core/domain/models/PortfolioEntities`. The Zod DTO schemas in `ExternalPortfolioSchemas.ts` handle the snake_case→camelCase mapping.

### Requirement: HoldingItem interface
**Reason**: The `HoldingItem` interface in `src/types/portfolio.ts` uses legacy snake_case field names and duplicates the `CryptoAssetEntity` / `HoldingEntity` in `src/core/domain/models/PortfolioEntities.ts`.
**Migration**: All imports from `@/types/portfolio` for `HoldingItem` SHALL be replaced with `CryptoAssetEntity` or `HoldingEntity` from `@/core/domain/models/PortfolioEntities`.

### Requirement: TaxLot interface
**Reason**: The `TaxLot` interface in `src/types/portfolio.ts` uses UNIX timestamps as `number` and snake_case names, duplicating `TaxLotEntity` in `src/core/domain/models/FiscalEntities.ts` which uses `Date` objects and camelCase.
**Migration**: All imports from `@/types/portfolio` for `TaxLot` SHALL be replaced with `TaxLotEntity` from `@/core/domain/models/FiscalEntities`.

### Requirement: LotHistoryEvent interface
**Reason**: The `LotHistoryEvent` interface in `src/types/portfolio.ts` uses `disposal_date: number` (UNIX) and snake_case names, duplicating `TaxLotHistoryEvent` in `src/core/domain/models/FiscalEntities.ts` which uses `disposalDate: Date` and camelCase.
**Migration**: All imports from `@/types/portfolio` for `LotHistoryEvent` SHALL be replaced with `TaxLotHistoryEvent` from `@/core/domain/models/FiscalEntities`.

### Requirement: PortfolioData root interface
**Reason**: The `PortfolioData` root interface wraps the above legacy types and is no longer needed. Portfolio data flows through `PortfolioSummaryEntity` (from domain) and individual entity queries.
**Migration**: Consumers using `PortfolioData` SHALL migrate to using `PortfolioSummaryEntity` for summary data and `TokenHistoryEntity` for lot/history data, both from domain models.
