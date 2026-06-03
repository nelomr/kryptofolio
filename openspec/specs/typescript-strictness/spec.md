## ADDED Requirements

### Requirement: No any types in production code
All production TypeScript files (`src/**/*.ts`, `src/**/*.vue`) SHALL have zero occurrences of the `any` type. Test files (`__tests__/**`) are exempt.

#### Scenario: Table column definitions use domain types
- **WHEN** `src/views/Portfolio/components/table/columns.ts` is inspected
- **THEN** all `cell` callback parameters SHALL use `CellContext<CryptoAssetEntity, unknown>` or equivalent TanStack Table generics (not `any`)

#### Scenario: ExpandedLotsTable uses domain types
- **WHEN** `src/views/Portfolio/components/table/ExpandedLotsTable.vue` is inspected
- **THEN** `isLotInLoss` parameter SHALL be typed as `TaxLotEntity` (not `any`)

#### Scenario: LotEventHistory uses domain types
- **WHEN** `src/views/Portfolio/components/table/LotEventHistory.vue` is inspected
- **THEN** `getEventBadge` parameter SHALL be typed as `TaxLotHistoryEvent` (not `any`)

#### Scenario: Cell components use domain types
- **WHEN** `PerformanceCell.vue` and `LocationsCell.vue` are inspected
- **THEN** the `row` prop SHALL be typed as `CryptoAssetEntity` (not `any`)

#### Scenario: usePortfolioData composable uses domain types
- **WHEN** `usePortfolioData.ts` is inspected
- **THEN** `expandedDetailsMap` SHALL use `Record<string, { lots: TaxLotEntity[], history: Record<string, TaxLotHistoryEvent[]>, isLoading: boolean }>` (not `any`)

### Requirement: Branded types enforced at adapter boundaries
Branded type Zod schemas SHALL be invoked at the DTO→Entity mapping boundary in every adapter that handles IDs. Raw API string IDs SHALL be parsed through branded schemas before entering the domain.

#### Scenario: Transaction IDs are branded on ingestion
- **WHEN** `ExternalTaxTransactionSchema` transforms a raw API response
- **THEN** the `id` field SHALL be parsed through `TransactionIdSchema` to produce a `TransactionId` branded type

#### Scenario: Invalid IDs are rejected at boundary
- **WHEN** an empty string is passed as a transaction ID through the schema
- **THEN** the Zod schema SHALL throw a validation error (not silently pass an empty branded string)

### Requirement: Explicit strict mode in tsconfig
The `tsconfig.app.json` SHALL either explicitly set `"strict": true` or inherit it from a parent config that sets it. The project SHALL verify this by running `vue-tsc --noEmit` without errors.

#### Scenario: Strict mode is active
- **WHEN** `vue-tsc --noEmit` is run
- **THEN** strict null checks, noImplicitAny, and strictFunctionTypes SHALL all be active

### Requirement: Typed audit_trail in tax DTO schema
The `ExternalTaxSchemas.ts` SHALL define an `ExternalTaxLotHistorySchema` Zod schema that maps the raw API audit trail response to `TaxLotHistoryEvent` domain entities. The `audit_trail` field in `ExternalTaxReportSchema` SHALL use this schema instead of `z.array(z.unknown())`.

#### Scenario: Audit trail entries are validated and transformed
- **WHEN** an API response with `audit_trail` entries is parsed through `ExternalTaxReportSchema`
- **THEN** each entry SHALL be validated against `ExternalTaxLotHistorySchema`
- **AND** the resulting `auditTrail` array SHALL contain `TaxLotHistoryEvent` objects with native `Date` fields and camelCase property names

#### Scenario: Malformed audit trail entries are handled
- **WHEN** an audit trail entry is missing required fields (e.g., `disposal_date`)
- **THEN** the schema SHALL either use safe defaults or skip the entry (not crash the entire parse)
