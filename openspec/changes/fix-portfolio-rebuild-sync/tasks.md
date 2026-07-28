## 1. Backend Dependency Injection

- [x] 1.1 Import `FifoMaterializerService` in `apps/backend/src/core/infrastructure/di/container.ts`.
- [x] 1.2 Instantiate `FifoMaterializerService` in the `DIContainer` constructor and expose it as a public property.
- [x] 1.3 Ensure `FifoMaterializerService` receives the correct dependencies (e.g., `sqlitePort`, `taxCalculatorPort`, `metricsPort`, `userSettingsPort`).

## 2. Rebuild Endpoint Implementation

- [x] 2.1 Update the `POST /api/portfolio/rebuild` route in `apps/backend/src/core/infrastructure/routes/portfolio.ts` to call `container.fifoMaterializerService.rebuildAll(true)`.
- [x] 2.2 Handle any potential errors gracefully, returning appropriate HTTP status codes.

## 3. Testing and Verification

- [x] 3.1 Run backend tests to ensure dependency injection changes don't break existing setup.
- [x] 3.2 Verify through a manual or integration test that invoking the endpoint successfully resets `needs_recalculation` and executes DuckDB views refresh.
