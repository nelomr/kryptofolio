# Application Layer Use Cases

## Purpose
Establishes the rules and guidelines for implementing pure Application Layer Use Cases to handle business orchestration, completely decoupled from the UI framework (Vue).

## Requirements

### Requirement: Application layer use cases
The system SHALL define pure TypeScript Use Case classes in `src/core/application/use-cases/` to orchestrate business logic and external port calls.

#### Scenario: Use Case implementation
- **WHEN** a new business orchestration flow is created
- **THEN** it SHALL be implemented as a class named `[Verb][Entity]UseCase` (e.g., `GetPortfolioSummaryUseCase`)
- **AND** it SHALL NOT contain any Vue framework imports (e.g., `ref`, `computed`, `inject`)

#### Scenario: Vue components consuming Use Cases
- **WHEN** a Vue component or composable needs to execute business logic
- **THEN** it SHALL instantiate or inject the appropriate Use Case and call its execution method (e.g., `execute()`)
