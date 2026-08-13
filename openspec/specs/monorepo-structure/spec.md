# Monorepo Structure Specification

## Purpose

Extracting the shared packages and refactoring the frontend onto them.

## Requirements

### Requirement: Shared Packages Extraction
The system SHALL organize domain logic and types into isolated workspace packages.

#### Scenario: Extracting Core Domain
- **WHEN** building the workspace
- **THEN** `@kryptofolio/core-domain` provides pure business logic like `TransactionHashService` and `TransactionNormalizer` without framework dependencies

#### Scenario: Extracting Shared Types
- **WHEN** building the workspace
- **THEN** `@kryptofolio/shared-types` provides Zod schemas and DTOs like `BaseTransactionMappedDataSchema`

### Requirement: Frontend Refactoring
The frontend SHALL consume domain logic from the shared packages rather than local files.

#### Scenario: Frontend uses new packages
- **WHEN** importing `TransactionMappedData` or `TransactionHashService` in `apps/frontend`
- **THEN** it must be imported from `@kryptofolio/shared-types` and `@kryptofolio/core-domain` respectively
