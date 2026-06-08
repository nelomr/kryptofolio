## Context

Following the successful establishment of the Monorepo structure in Phase 1, Phase 2 aims to lay the groundwork for our Backend For Frontend (BFF) and technical documentation. We chose Hono as our BFF because of its lightweight nature and excellent RPC capabilities, which will allow us to share types across our monorepo easily. At the same time, we need a professional documentation scaffolding so the team understands the Core Architecture, API integration points, and Extensibility guidelines.

## Goals / Non-Goals

**Goals:**
- Scaffold the `packages/api-gateway` workspace using Hono.
- Provide a `GET /api/health` endpoint to verify the service runs.
- Export `AppType` so the frontend can consume the API types in the future (E2E type safety).
- Set up a `docs/` folder with clear structure for Architecture, API & Integration, and Extensibility.
- Update root `README.md` and `README.es.md` to reflect these structural additions.

**Non-Goals:**
- Implementing actual business logic or route controllers in the BFF (this will be done in subsequent phases).
- Integrating the frontend with the BFF in this phase (we only want the types exported, not necessarily consumed yet).

## Decisions

- **Hono for BFF:** Selected due to its fast execution, ease of use in edge/node environments, and native RPC support with strict typing.
- **Exporting `AppType`:** We will explicitly expose `export type AppType = typeof routes;` to ensure strict end-to-end type safety between `api-gateway` and frontend packages.
- **Dedicated `docs/` structure:** We will use markdown files under a root or dedicated `docs/` workspace to document architecture and API rather than relying solely on scattered READMEs.

## Risks / Trade-offs

- **[Risk] Workspace resolution issues:** Sometimes `tsc` or package managers fail to resolve workspace aliases for newly added packages.
  **Mitigation:** Verify `package.json` references and `tsconfig.json` path aliases properly link the `api-gateway` into the workspace ecosystem before marking the task complete.
