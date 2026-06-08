## Why

With the Monorepo foundation established in Phase 1, we now need to scaffold the Hono API Gateway (Backend For Frontend - BFF) and establish a robust, professional Technical Documentation structure. This is Phase 2 of 4 correlative proposals to scale the application and ensure End-to-End (E2E) type safety and proper integration guidelines for future modules.

## What Changes

- Initialize a new workspace package for the BFF at `packages/api-gateway` with its own `package.json` and `tsconfig.json`.
- Install Hono and configure a basic entry point (`src/index.ts`).
- Create a health-check endpoint (`GET /api/health`).
- Export the `AppType` (`export type AppType = typeof routes`) from Hono to guarantee E2E type safety when consumed by the frontend.
- Establish a `docs/` workspace (or a dedicated folder) to document:
  - **Core Architecture:** Deep dive into Monorepo structure, Hexagonal Architecture, and the Hono BFF layer.
  - **API & Integration:** Detailed guides on how the BFF's RPC works and how third-party developers can connect custom backends.
  - **Extensibility:** Guidelines on how to scale the application and add new modules.
- Update `README.md` and `README.es.md` to reflect the new `api-gateway` package and the new documentation structure.

## Capabilities

### New Capabilities
- `api-gateway`: Scaffolding of the Hono-based Backend For Frontend (BFF), including health-check endpoint and RPC type definitions for the frontend.
- `technical-docs`: Scaffolding of the professional documentation structure covering Core Architecture, API & Integration, and Extensibility.

### Modified Capabilities
- (None)

## Impact

- Adds a new `api-gateway` package to the monorepo workspace.
- Adds a new `docs/` folder or package to the repository.
- Establishes the E2E type safety mechanism to be used by the frontend in upcoming phases.
- Updates existing `README.md` and `README.es.md` with the new architecture links.
