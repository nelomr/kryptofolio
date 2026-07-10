## Why

We need to transition the system from static mocked data to real, live metrics. This change connects our high-performance DuckDB OLAP engine to the frontend via the Hono REST API. It also introduces advanced time-series analysis directly in DuckDB—calculating historical running balances, daily portfolio valuation (using ASOF JOINs with Late-Binding multi-currency conversion), drawdown curves, and annualized volatility.

This phase **depends entirely on Phase Parquet** having completed successfully:
- The `historical_prices` Parquet view must exist and be populated.
- The `exchange_rates` SQLite table (created and seeded in Phase Parquet) must be available for dynamic currency conversion.

The user's preferred reporting currency is already stored in `user_settings.base_currency` (key: `"base_currency"`) and defaults to `'USD'`. All DuckDB analytics queries MUST read this setting and apply the appropriate exchange rate conversion via `ASOF JOIN` against the `exchange_rates` table.

## What Changes

- **Schema Migration (`003_currency_schema.sql`)**: Add `fiat_currency TEXT NOT NULL` column to `spot_transactions` and `futures_transactions` to preserve the exact native currency of each transaction. These are the only two tables currently missing this column (`tax_lots` and `lot_history_events` already have it).
- **DuckDB Views Refactor**: Remove all `'EUR'` hardcodes from `DuckDbAdapter.ts`. The FIFO views (`v_flattened_fifo_events`, `v_calculated_tax_lots`, `v_calculated_lot_history_events`) currently hardcode `'EUR'` in 6 places. They must be updated to read `fiat_currency` from the transaction row.
- **`asset_prices` → `historical_prices` Migration**: The existing `asset_prices` DuckDB table (used for fee resolution in FIFO) will be retired. The FIFO views will be refactored to query `historical_prices` (Parquet) instead, eliminating data duplication.
- **`live_prices` Table Removal**: The `live_prices` DuckDB table (used for real-time unrealized PnL injection into DuckDB) will be removed. Real-time PnL will be computed in-memory by `GetPortfolioSummaryUseCase` in Node.js, completely isolating DuckDB from high-frequency writes.
- **REST API Routing**: Register analytics adapters in the DI container and connect `IPortfolioAnalyticsPort` & `ITaxCalculatorPort` to Hono routes (`GET /summary`, `GET /derivatives/pnl`, `GET /report/:year`).
- **Vue 3 Integration**: Update Pinia Colada composables (`usePortfolioData.ts`, `useTaxQueries.ts`) to fetch from live REST endpoints instead of mocks.
- **Zod Data Validation**: Align DTO schemas to validate 18-decimal precision string payloads safely and include `currency` fields.
- **UI Data Binding**: Feed real REST responses into `LotHierarchyTable.vue`, `CryptoKpiCards.vue`, `AssetAllocation.vue`, and `TaxReportSummaryCards.vue`. Refactor `average_r` to `Average Win/Loss Ratio`.
- **Event-Driven Cache Invalidation**: Risk queries via Pinia Colada will be fetched with `staleTime: Infinity` and invalidated only when new transactions are processed or a daily OHLCV cron completes.
- **Historical Timeline Generation**: Use DuckDB `GENERATE_SERIES` and window functions (`SUM() OVER`) to compute continuous daily vector running balances.
- **Historical Revaluation & Multi-Currency Engine**: Join running balances with `historical_prices` via DuckDB `ASOF JOIN`. Cross-join with `exchange_rates` to convert to the user's `base_currency` dynamically. BTC historical prices are mandated as benchmark input.
- **Risk Engine Views**: Compute Rolling ATH, Drawdown %, daily returns, Annualized Volatility, Alpha, and Beta directly via DuckDB SQL views.
- **TDD Validation**: Comprehensive tests for Drawdown, Volatility, ASOF JOIN accuracy, and multi-currency conversion correctness.

## Capabilities

### New Capabilities
- `duckdb-time-series-generation`: Generates continuous daily timelines and running balances via DuckDB Window functions. Includes historical fiat valuation via `ASOF JOIN` + `exchange_rates` Late-Binding conversion.
- `duckdb-risk-metrics`: Implements Rolling ATH, Drawdown %, Annualized Volatility, Alpha, and Beta directly in SQL.
- `hono-duckdb-integration`: Wires stateless DuckDB adapters to Hono REST routes, reading `base_currency` from `user_settings` to parameterize all currency conversions.
- `vue-backend-integration`: Refactors `usePortfolioData` and `useTaxQueries` composables to consume live endpoints with strict Zod parsing, replacing static mocks.

### Modified Capabilities
- `DuckDbAdapter`: Removes `live_prices` and `asset_prices` tables. Adds `historical_prices` Parquet federation. Refactors all FIFO views to remove EUR hardcodes.
- `IPortfolioAnalyticsPort`: Adds `targetCurrency` parameter and explicit `currency` field to return types.

## Impact

- **Database Schema (`packages/database/migrations/sqlite/`)**: Adds `fiat_currency` to `spot_transactions` and `futures_transactions`.
- **DuckDB Engine (`packages/database/src/adapters/`)**: Major refactor of `DuckDbAdapter.ts` — removal of `live_prices`, `asset_prices`, and EUR hardcodes. Addition of time-series and risk metric views.
- **Backend API (`apps/backend/src/core/`)**: New Use Case (`GetPortfolioSummaryUseCase`), new Hono routes, updated DI container.
- **Frontend App (`apps/frontend/`)**: Composables migrate from mocks to live endpoints; UI components render real database-backed metrics.
