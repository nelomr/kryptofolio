## Why

Currently, when a user successfully imports CSV data, the `CsvIngestionUseCase` correctly sets the `needs_recalculation` flag to `true`. This causes the frontend to display a "Sync" or "Rebuild" button to refresh the DuckDB metrics and FIFO calculations. However, clicking the sync button calls the `POST /api/portfolio/rebuild` endpoint, which is currently a stub that just returns `{ success: true }` without actually recalculating anything. This prevents the user from seeing their newly ingested transactions in the frontend metrics and tax reports.

## What Changes

- **Implement Backend Rebuild Endpoint**: Wire the `POST /api/portfolio/rebuild` endpoint in `portfolio.ts` to actually invoke the recalculation logic.
- **Inject Materializer Service**: Expose the `FifoMaterializerService` through the dependency injection container (`container.ts`) so that the routing layer can access it.
- **Trigger Recalculation**: The rebuild endpoint will call `fifoMaterializerService.rebuildAll()` (or the equivalent synchronization method) to materialise the latest SQLite transactions into DuckDB.

## Capabilities

### New Capabilities
- `portfolio-rebuild-sync`: Capability that manages the explicit synchronization between the SQLite fiscal ledger and the DuckDB analytical engine via the frontend.

### Modified Capabilities
- `csv-data-ingestion`: Update the API to ensure the full end-to-end flow correctly materializes metrics after data ingestion is confirmed by the user.

## Impact

- **Backend Routing**: `apps/backend/src/core/infrastructure/routes/portfolio.ts`
- **Dependency Injection**: `apps/backend/src/core/infrastructure/di/container.ts`
- **Application Services**: Ensure `FifoMaterializerService` is correctly initialized with its required ports (SQLite ledger, DuckDB adapters, settings).
