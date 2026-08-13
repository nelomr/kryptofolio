# Duckdb Backend Base Specification

## Purpose

Backend initialisation of the analytical engine.

## Requirements

### Requirement: Backend Initialization
The workspace SHALL include a new backend application configured with a Hexagonal Architecture structure.

#### Scenario: Backend Structure
- **WHEN** inspecting `apps/backend/src`
- **THEN** it must contain `core/domain`, `core/application`, and `core/infrastructure` directories

#### Scenario: Backend Framework
- **WHEN** starting the backend service
- **THEN** it serves a basic Hono API capable of importing `@kryptofolio/shared-types` and `@kryptofolio/core-domain`
