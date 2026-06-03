## ADDED Requirements

### Requirement: Zero external imports in domain layer
The `src/core/domain/` directory SHALL contain zero imports from external npm packages. Only TypeScript built-in types, other domain files, and ambient type declarations are permitted.

#### Scenario: BrandedTypes uses pure TypeScript
- **WHEN** `src/core/domain/models/BrandedTypes.ts` is inspected
- **THEN** it SHALL NOT import from `zod`, `lodash`, `date-fns`, `axios`, or any npm package
- **AND** it SHALL define branded types using pure TypeScript phantom branding (e.g., `T & { readonly __brand: B }`)

#### Scenario: Domain files pass import audit
- **WHEN** running `grep -r "from '" src/core/domain/ | grep node_modules` or equivalent
- **THEN** zero results SHALL be returned (no external package imports)

### Requirement: IHttpClient located in ports directory
The `IHttpClient` interface SHALL reside at `src/core/domain/ports/IHttpClient.ts`, not in the `repositories/` directory.

#### Scenario: IHttpClient is a port, not a repository
- **WHEN** the file `src/core/domain/ports/IHttpClient.ts` exists
- **THEN** it SHALL contain the `IHttpClient` interface with `get`, `post`, `put`, `delete`, and `postForm` methods
- **AND** `src/core/domain/repositories/IHttpClient.ts` SHALL NOT exist

#### Scenario: Adapters import from correct path
- **WHEN** any adapter or infrastructure file imports `IHttpClient`
- **THEN** the import path SHALL reference `@/core/domain/ports/IHttpClient`

### Requirement: All port methods return typed domain entities
Every method on every port/repository interface in `src/core/domain/` SHALL have a fully typed return value using domain entity types. No method SHALL return `any`, `unknown`, or `Record<string, any>`.

#### Scenario: getTokenHistory returns TokenHistoryEntity
- **WHEN** `ICryptoPortfolioRepository.getTokenHistory(symbol)` is called
- **THEN** it SHALL return `Promise<TokenHistoryEntity>` (not `Promise<Record<string, any>>`)

#### Scenario: TokenHistoryEntity is properly defined
- **WHEN** `TokenHistoryEntity` is inspected in `PortfolioEntities.ts`
- **THEN** it SHALL contain `lots: TaxLotEntity[]` and `history: Record<string, TaxLotHistoryEvent[]>` with imports from `FiscalEntities.ts`

### Requirement: Branded type Zod schemas live in infrastructure
Zod validation schemas for branded types SHALL reside in `src/core/infrastructure/dtos/BrandedTypeSchemas.ts`. The domain `BrandedTypes.ts` SHALL export only pure TypeScript types.

#### Scenario: BrandedTypeSchemas validates and brands
- **WHEN** `BrandedTypeSchemas.ts` is inspected
- **THEN** it SHALL export `AssetIdSchema`, `TransactionIdSchema`, and `LotIdSchema` as Zod schemas
- **AND** each schema SHALL parse strings and produce the corresponding branded type from `@/core/domain/models/BrandedTypes`

#### Scenario: Existing DTO schemas import Zod schemas from infrastructure
- **WHEN** `ExternalTaxSchemas.ts` or `ExternalPortfolioSchemas.ts` need branded ID validation
- **THEN** they SHALL import schemas from `@/core/infrastructure/dtos/BrandedTypeSchemas` (not from domain)
