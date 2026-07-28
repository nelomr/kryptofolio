## Context

The backend uses a dual-database architecture: SQLite for the transactional ledger (`fiscal.db`) and DuckDB for fast analytical queries and FIFO tax lot calculations. When new transactions are ingested, they are stored in SQLite. For these transactions to be reflected in the frontend's portfolio charts and metrics, the DuckDB materialized views must be refreshed.

Currently, the `POST /api/portfolio/rebuild` endpoint acts as a stub, returning success without performing the synchronization, leading to stale data on the frontend even after clicking "Sync".

## Goals / Non-Goals

**Goals:**
- Connect the existing `POST /api/portfolio/rebuild` endpoint to the `FifoMaterializerService`.
- Expose `FifoMaterializerService` in the dependency injection container.
- Ensure the frontend can successfully trigger a DuckDB recalculation.

**Non-Goals:**
- Refactoring `FifoMaterializerService` itself.
- Implementing automatic background synchronization (we stick to the explicit user-triggered rebuild for now).

## Decisions

1. **Dependency Injection**: Add `FifoMaterializerService` to `DIContainer` in `apps/backend/src/core/infrastructure/di/container.ts`. It will be injected with `sqlitePort`, `metricsPort`, and `userSettingsPort` or whichever ports it requires. (Wait, let's verify its constructor: it probably takes `ILedgerPort` and `IDuckDbAdapter`, etc).
2. **Endpoint Wiring**: In `portfolio.ts`, change the `POST /rebuild` handler to invoke the newly injected `container.fifoMaterializerService.rebuildAll(true)` (or the exact method name).
3. **Response Handling**: The endpoint should await the rebuild operation and return a success response only after DuckDB has finished materializing the data.

## Risks / Trade-offs

- **Risk: Rebuild latency blocking the API** → Mitigation: If `FifoMaterializerService` takes too long to run, it could block the HTTP request. We will run it sequentially but keep it awaited. The frontend already expects this to take some time as it shows "syncing" text.
