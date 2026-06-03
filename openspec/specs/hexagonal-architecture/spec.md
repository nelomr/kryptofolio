# hexagonal-architecture Specification

## Purpose
TBD - created by archiving change hex-arch-zod-refactor. Update Purpose after archive.
## Requirements
### Requirement: Define abstract repository ports
The system SHALL define abstract interfaces for repositories (`ICryptoPortfolioRepository`) and HTTP clients (`IHttpClient`) inside the `domain` layer.

#### Scenario: Interface availability
- **WHEN** a developer attempts to implement a new data adapter
- **THEN** they MUST implement the `ICryptoPortfolioRepository` interface

### Requirement: Dependency Injection for adapters
The system SHALL resolve which adapter implementation to use at runtime via a Dependency Injection container in `main.ts`, based on environment variables (e.g., `VITE_USE_MOCK`).

#### Scenario: Production environment
- **WHEN** the application starts with `VITE_USE_MOCK=false`
- **THEN** the DI container provides `RestCryptoAdapter`

#### Scenario: Development environment
- **WHEN** the application starts with `VITE_USE_MOCK=true`
- **THEN** the DI container provides `MockCryptoAdapter`




## MODIFIED Requirements

### Requirement: Define abstract repository ports
The system SHALL define abstract interfaces for repositories (`ICryptoPortfolioRepository`, `ITaxRepository`) inside the `domain/repositories` layer, and infrastructure-level interfaces (`IHttpClient`) inside the `domain/ports` layer. The `IHttpClient` interface SHALL reside at `src/core/domain/ports/IHttpClient.ts`, not in `repositories/`.

#### Scenario: Interface availability
- **WHEN** a developer attempts to implement a new data adapter
- **THEN** they MUST implement the `ICryptoPortfolioRepository` interface from `domain/repositories`

#### Scenario: IHttpClient is a port
- **WHEN** an adapter needs HTTP communication
- **THEN** it SHALL import `IHttpClient` from `@/core/domain/ports/IHttpClient` (not from `repositories`)

#### Scenario: getTokenHistory is fully typed
- **WHEN** `ICryptoPortfolioRepository.getTokenHistory(symbol)` is inspected
- **THEN** it SHALL return `Promise<TokenHistoryEntity>` where `TokenHistoryEntity` is a properly defined domain entity containing `lots: TaxLotEntity[]` and `history: Record<string, TaxLotHistoryEvent[]>`

### Requirement: Dependency Injection for adapters
The system SHALL resolve which adapter implementation to use at runtime via a Dependency Injection container in `main.ts`, based on environment variables (e.g., `VITE_USE_MOCK`). The DI setup SHALL include runtime validation and Pinia type augmentation.

#### Scenario: Production environment
- **WHEN** the application starts with `VITE_USE_MOCK=false`
- **THEN** the DI container provides `RestCryptoAdapter`

#### Scenario: Development environment
- **WHEN** the application starts with `VITE_USE_MOCK=true`
- **THEN** the DI container provides `MockCryptoAdapter`

#### Scenario: Runtime injection validation
- **WHEN** any `inject()` call returns `undefined` during DI setup
- **THEN** the system SHALL throw a descriptive `Error` identifying which injection key failed

#### Scenario: Pinia DI properties are typed
- **WHEN** `$portfolioRepo` or `$taxRepo` is accessed on a Pinia store instance
- **THEN** TypeScript SHALL resolve them as `ICryptoPortfolioRepository` and `ITaxRepository` respectively, via `PiniaCustomProperties` module augmentation

## ADDED Requirements

### Requirement: Domain layer has zero external library imports
All files inside `src/core/domain/` SHALL import only from other domain files, TypeScript built-ins, or ambient declarations. No external npm package (zod, axios, lodash, etc.) SHALL be imported in the domain layer.

#### Scenario: BrandedTypes uses pure TypeScript branding
- **WHEN** `src/core/domain/models/BrandedTypes.ts` is inspected
- **THEN** it SHALL use phantom branding (`T & { readonly __brand: B }`) instead of Zod's `.brand()`
- **AND** Zod-based branded schemas SHALL reside in `src/core/infrastructure/dtos/BrandedTypeSchemas.ts`
