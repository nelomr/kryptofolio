## Context

Following the successful migration of analytical workloads to DuckDB in Phase 2, Phase 2B connects this high-performance engine to the frontend and expands its capabilities to compute time-series risk metrics. It also addresses three critical technical debts identified during the Phase Parquet audit:

1. **EUR Hardcodes**: The current `DuckDbAdapter.ts` hardcodes `'EUR'` in 6 places across FIFO views. With the new multi-currency architecture, these must read `fiat_currency` from the transaction row.
2. **`asset_prices` Duplication**: The `asset_prices` DuckDB table (used for fee price resolution) duplicates data that will now live in `historical_prices` (Parquet). It must be retired.
3. **`live_prices` Contamination**: The `live_prices` DuckDB table pushes real-time data into an OLAP engine not designed for high-frequency writes. Real-time PnL must move entirely to Node.js memory.

**Hard Dependency**: This phase requires Phase Parquet to be fully deployed. Specifically:
- `historical_prices` Parquet view must exist and be populated.
- `exchange_rates` SQLite table (created in Phase Parquet) must be populated with ECB historical rates.
- `user_settings.base_currency` (already exists in production) provides the user's target reporting currency for all DuckDB queries.

## Goals / Non-Goals

**Goals:**
- Refactor `DuckDbAdapter.ts` to remove `live_prices`, `asset_prices`, and all EUR hardcodes.
- Implement time-series views: `v_daily_running_balances`, `v_portfolio_daily_valuation` (with ASOF JOIN + multi-currency).
- Implement risk metric views: Rolling ATH, Drawdown %, Daily Returns, Annualized Volatility, Alpha, Beta vs BTC.
- Connect Hono REST endpoints to stateless DuckDB adapters with `base_currency` parameter injection.
- Replace mock composable logic in Vue 3 with actual REST API queries managed by Pinia Colada.
- Ensure strict parsing of 18-decimal precision financial numbers via Zod DTOs.
- Add `fiat_currency` column to `spot_transactions` and `futures_transactions`.

**Non-Goals:**
- Creating new ingestion integrations (new exchange APIs).
- Implementing IRR or TTWROR (deferred to Phase 3).
- Migrating the primary transactional data store (SQLite) to another DBMS.
- Introducing a server-side caching layer (Pinia Colada handles client-side caching).

## Decisions

- **DuckDB Window Functions for Timelines**
  - *Rationale*: Generate the portfolio daily timeline using `GENERATE_SERIES(earliest_tx_date, current_date, INTERVAL 1 DAY)` and `SUM(amount) OVER (PARTITION BY asset_id ORDER BY date ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)`. This pushes the heavy lifting to the columnar engine, far outperforming JavaScript `.reduce()` loops.

- **ASOF JOIN + Late-Binding Multi-Currency Conversion**
  - *Rationale*: `ASOF JOIN` pairs a date with the "closest preceding" price timestamp, handling weekends and holidays naturally. After the join, a second join against `exchange_rates` (using the user's `base_currency` from `user_settings`) applies the FX conversion dynamically. This pattern is infinitely scalable: adding JPY, GBP, or any future currency requires only adding rows to `exchange_rates`, zero schema migrations.

- **Remove EUR Hardcodes from DuckDB Views**
  - *Rationale*: The current `v_calculated_tax_lots` and `v_calculated_lot_history_events` output `'EUR' AS fiat_currency` statically. With the new `spot_transactions.fiat_currency` and `futures_transactions.fiat_currency` columns, the views must read the actual transaction currency. This is the only way to produce correct multi-currency P&L calculations.

- **`asset_prices` Retired → `historical_prices` (Parquet)**
  - *Rationale*: The `asset_prices` DuckDB table was created as a runtime cache for fee price resolution in the FIFO engine. Now that `historical_prices` (Parquet) provides the same data with full OHLCV history, the `asset_prices` table is redundant. The FIFO views will be updated to use `ASOF JOIN` against `historical_prices` for fee resolution, unifying the data source and eliminating duplication.

- **`live_prices` Removed → `GetPortfolioSummaryUseCase` in Node.js**
  - *Rationale*: DuckDB is an OLAP engine; high-frequency writes (live price updates) are an anti-pattern. The `GetPortfolioSummaryUseCase` (Application Layer) will compute real-time Unrealized PnL entirely in Node.js memory by joining `tax_lots` snapshots from SQLite with live prices injected as function parameters.

- **`fiat_currency` Added to `spot_transactions` and `futures_transactions`**
  - *Rationale*: These are the only two tables in the schema missing this column (`tax_lots` and `lot_history_events` already have it). Without `fiat_currency`, the FIFO engine cannot determine if a `total_fiat` value is in EUR or USD, making multi-currency P&L calculations impossible.

- **Pinia Colada over Global Pinia Stores**
  - *Rationale*: Mandated by the `domain-architecture` skill. All async API fetching uses `@pinia/colada` (`useQuery` / `useMutation`) inside composables, with `staleTime: Infinity` and event-driven invalidation.

- **`base_currency` from `user_settings` — Not a URL Parameter**
  - *Rationale*: The user's preferred currency is a persistent setting, not a per-request override. Reading it from `user_settings` in the Hono route handler (via `container.userSettingsPort.getSetting('base_currency')`) keeps the API clean. If a one-time UI override is ever needed, it can be added as an optional query parameter that takes precedence.

- **`average_r` Redefined to `Average Win / Average Loss Ratio`**
  - *Rationale*: Exchanges do not provide Initial Risk / Stop Loss data. The metric is mathematically sound only when computed from `lot_history_events.gain_loss_fiat`.

- **Alpha/Beta vs BTC Benchmark**
  - *Rationale*: Beta requires portfolio daily returns and BTC daily returns to compute covariance. This mandates that the Phase Parquet ingestion ALWAYS includes BTC, even if the user holds 0 BTC.

## Risks / Trade-offs

- **[Risk] ASOF JOINs on unordered Parquet partitions** → *Mitigation*: Ensure Parquet files are written with rows sorted by `date` within each `year` partition. DuckDB can then execute ASOF JOINs in linear O(n) time instead of O(n log n).
- **[Risk] Floating-point degradation in STDDEV calculations** → *Mitigation*: Cast to `DECIMAL(38,18)` for intermediate sums; accept `DOUBLE` precision only in final `STDDEV()` output (acceptable for volatility metrics).
- **[Risk] Pinia Colada reactivity mismatches with legacy components** → *Mitigation*: Wrap query results in `computed()` inside composables; components only consume flat reactive refs, never raw Pinia Colada internals.
- **[Risk] Missing BTC benchmark data for Alpha/Beta** → *Mitigation*: `IngestDailyPricesUseCase` always includes `BTC` in its asset list regardless of user holdings.
- **[Risk] `fiat_currency` DEFAULT breaks existing `STRICT` table constraint** → *Mitigation*: SQLite `STRICT` tables support `ALTER TABLE ADD COLUMN` with a `DEFAULT` value. Adding `fiat_currency TEXT NOT NULL DEFAULT 'USD'` is safe and backward-compatible for existing rows.
