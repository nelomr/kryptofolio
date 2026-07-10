## 0. Database Schema Migrations

- [ ] 0.1 Add to `003_currency_schema.sql` (created in Phase Parquet): `ALTER TABLE spot_transactions ADD COLUMN fiat_currency TEXT NOT NULL DEFAULT 'USD'`. Add CHECK constraint: `fiat_currency IN ('USD', 'EUR', 'GBP', 'USDT', 'USDC')` (extensible list).
- [ ] 0.2 Add to `003_currency_schema.sql`: `ALTER TABLE futures_transactions ADD COLUMN fiat_currency TEXT NOT NULL DEFAULT 'USD'`. Same CHECK constraint.
- [ ] 0.3 Verify that `tax_lots.fiat_currency` and `lot_history_events.fiat_currency` already exist (they do — confirmed in schema). No action needed.
- [ ] 0.4 **CRITICAL:** Update `SQLiteLedgerAdapter.ts` `initialize()` to execute BOTH `002_ledger_schema.sql` and `003_currency_schema.sql` in order, as it currently hardcodes only `002`.

## 0.5 Ledger Port & Ingestion (fiat_currency propagation)

- [ ] 0.5.1 Update `ILedgerPort.ts`: Add `fiat_currency?: string` to `LedgerSpotTransaction` and `LedgerFuturesTransaction` interfaces.
- [ ] 0.5.2 Update `SQLiteLedgerAdapter.ts`: In `saveSpotTransaction` and `saveFuturesTransaction`, inject `tx.fiat_currency || 'USD'` into the `INSERT` and `ON CONFLICT DO UPDATE` queries to ensure the new columns are populated.
- [ ] 0.5.3 Update `CsvIngestionUseCase.ts`: Map `fiat_currency: row.fiat_currency || 'USD'` when creating `LedgerSpotTransaction` and `LedgerFuturesTransaction`. Also remove any hardcoded `'EUR'` fallback when fetching missing fiat prices, defaulting to the transaction's `fiat_currency` instead.

## 1. DuckDB Adapter Refactor (Technical Debt Cleanup)

- [ ] 1.1 Remove `asset_prices` table from `DuckDbAdapter.initialize()` — it will be replaced by `historical_prices` (Parquet).
- [ ] 1.2 Remove `live_prices` table from `DuckDbAdapter.initialize()` — real-time PnL moves to Node.js.
- [ ] 1.3 Refactor `v_flattened_fifo_events`: replace all `tx.fee_asset_id = 'EUR'` conditions with a check against the ledger's actual fiat currency. Replace `asset_prices` lookup for fee resolution with `ASOF JOIN` against `historical_prices`.
- [ ] 1.4 Refactor `v_calculated_tax_lots`: replace `'EUR' AS fiat_currency` with `a.fiat_currency` (read from the source transaction's `fiat_currency` column).
- [ ] 1.5 Refactor `v_calculated_lot_history_events`: replace `'EUR' AS fiat_currency` with the disposal transaction's `fiat_currency` column.
- [ ] 1.6 Refactor `v_futures_realized_pnl`: replace `settlement_asset_id = 'EUR'` and `fee_asset_id = 'EUR'` hardcodes with checks against `futures_transactions.fiat_currency`.

## 2. DuckDB Time-Series & Risk Metric Views

- [ ] 2.1 Implement `v_daily_running_balances` view:
  ```sql
  -- Uses GENERATE_SERIES from earliest tx_date to today
  -- SUM(amount) OVER (PARTITION BY asset_id ORDER BY date ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
  ```
- [ ] 2.2 Implement `v_portfolio_daily_valuation` view using `ASOF JOIN`:
  ```sql
  -- JOIN v_daily_running_balances WITH historical_prices ON (symbol, date)
  -- JOIN result WITH exchange_rates ON (date, pair) WHERE pair = 'USD/' || base_currency
  -- Computes: daily_value = running_balance * close_price * exchange_rate
  ```
  Note: `base_currency` must be injected as a parameter or read via a DuckDB scalar subquery against the SQLite settings.
- [ ] 2.3 Implement Rolling ATH and Drawdown % view:
  ```sql
  -- rolling_max = MAX(daily_value) OVER (ORDER BY date ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
  -- drawdown_pct = (daily_value - rolling_max) / rolling_max
  ```
- [ ] 2.4 Implement Daily Returns and Annualized Volatility view:
  ```sql
  -- daily_return = (daily_value - LAG(daily_value)) / LAG(daily_value)
  -- annualized_vol = STDDEV(daily_return) OVER (partition_window) * SQRT(365)
  ```
- [ ] 2.5 Implement Alpha and Beta vs BTC benchmark:
  - Beta = `COVAR_POP(portfolio_return, btc_return) / VAR_POP(btc_return)`
  - Alpha = `AVG(portfolio_return) - Beta * AVG(btc_return)`
  - Requires BTC to always be present in `historical_prices` (enforced by Phase Parquet ingestion).

## 3. Backend Application Layer — Use Cases & Ports

- [ ] 3.1 Extend `IPortfolioAnalyticsPort.ts`: add `targetCurrency: string` parameter to `getHoldingsSnapshot()`. Add `currency: string` field to `HoldingsSnapshot` interface.
- [ ] 3.2 Create `GetPortfolioSummaryUseCase.ts` in `apps/backend/src/core/application/use-cases/` (Functional Sandwich):
  1. (Impure) Fetch `tax_lots` snapshots via `ILedgerPort.getOpenLots()`.
  2. (Impure) Fetch live prices via `IMarketDataProvider`.
  3. (Impure) Fetch `base_currency` from `IUserSettingsPort.getSetting('base_currency')`.
  4. (Pure) Compute Unrealized PnL in-memory using Decimal.js.
  5. Return `HoldingsSnapshot[]` with explicit `currency` field.
- [ ] 3.3 Refactor `DuckDbPortfolioAnalyticsAdapter.getHoldingsSnapshot()`: remove all `live_prices` injection code. The adapter now reads from `tax_lots` and `historical_prices` only, parameterized by `targetCurrency`.
- [ ] 3.4 Update Zod schemas in `src/core/infrastructure/dtos/`: add `currency: z.string()` to `HoldingsSnapshotSchema`. Enforce 18-decimal exact strings for all monetary fields.

## 4. Backend Infrastructure — Hono Routes

- [ ] 4.1 Register `DuckDbPortfolioAnalyticsAdapter` and `DuckDbTaxCalculatorAdapter` in `container.ts`.
- [ ] 4.2 Implement `GET /summary` and `GET /holdings` in Hono (`routes/portfolio.ts`):
  - Read `base_currency` from `container.userSettingsPort.getSetting('base_currency')`.
  - Orchestrate `GetPortfolioSummaryUseCase` (real-time unrealized PnL in Node.js).
  - Merge with DuckDB historical snapshots for risk metrics.
- [ ] 4.3 Implement `GET /derivatives/pnl` in Hono connected to `DuckDbPortfolioAnalyticsAdapter.getDerivativesPnl()`.
- [ ] 4.4 Refactor `DuckDbTaxCalculatorAdapter.getSpanishTaxReport()`: replace `v_calculated_lot_history_events` with a direct query against `ledger.lot_history_events` (materialized table, not the heavy computed view).
- [ ] 4.5 Implement `GET /report/:year` in Hono (`routes/tax.ts`) connected to `DuckDbTaxCalculatorAdapter`.
- [ ] 4.6 Ensure all SQL in adapters uses parameterized queries (no string interpolation of user inputs) to prevent SQL injection.

## 5. Frontend Integration (Vue 3 / Pinia Colada)

- [ ] 5.1 Refactor `usePortfolioData.ts` composable: replace mock returns with `@pinia/colada` `useQuery` fetching from `GET /summary`. Configure `staleTime: Infinity`.
- [ ] 5.2 Implement cache invalidation (`queryCache.invalidateQueries({ key: ['portfolio', 'summary'] })`) whenever a new transaction is successfully recorded.
- [ ] 5.3 Refactor `useTaxQueries.ts` composable to use `@pinia/colada` for `GET /report/:year`.
- [ ] 5.4 Ensure frontend strictly parses incoming JSON via 18-decimal Zod schemas. Never coerce monetary strings to JS `number`.
- [ ] 5.5 Update `LotHierarchyTable.vue`, `CryptoKpiCards.vue`, `AssetAllocation.vue` bindings to consume real API data with explicit `currency` display.
- [ ] 5.6 Refactor the "Average R" metric in `CryptoKpiCards.vue` to display `Average Win / Average Loss Ratio` based on `lot_history_events.gain_loss_fiat`.
- [ ] 5.7 Update `TaxReportSummaryCards.vue` to consume real `GET /report/:year` data.

## 6. TDD & Validation

- [ ] 6.1 Write integration tests mocking DuckDB adapters to verify Hono route validation, parameter passing, and response schema compliance.
- [ ] 6.2 Write `risk_metrics.spec.ts` in `packages/database/src/__tests__/` to validate Drawdown against known ATH sequences (e.g. 100k→50k = -50%).
- [ ] 6.3 Write volatility test in `risk_metrics.spec.ts`: assert `STDDEV(returns) * SQRT(365)` over a known returns array matches expected precision.
- [ ] 6.4 Write ASOF JOIN correctness test: assert weekend price carry-forward from Friday → Saturday works correctly.
- [ ] 6.5 Write multi-currency conversion test: assert that a portfolio valued at $100k USD with USD/EUR rate 0.91 returns €91k in EUR mode.
- [ ] 6.6 Write Alpha/Beta test: assert Beta = 1.0 when portfolio returns are identical to BTC returns.
