# Api Gateway Specification

## Purpose

The Hono BFF scaffold and the `AppType` export that gives the frontend end-to-end type safety over RPC.

## Requirements

### Requirement: Scaffold Hono BFF
The system SHALL have a new package `packages/api-gateway` initialized with Hono and a health-check endpoint.

#### Scenario: Running the BFF
- **WHEN** the `api-gateway` package is executed locally via `pnpm run dev` (or similar script)
- **THEN** it starts a server successfully and the `GET /api/health` endpoint returns a 200 OK status.

### Requirement: Export AppType
The system SHALL export the Hono `AppType` from the `api-gateway` package.

#### Scenario: Type consumption
- **WHEN** the frontend or another package attempts to import types from `api-gateway`
- **THEN** it can successfully consume the `AppType` via TypeScript path aliases or workspace linking.
