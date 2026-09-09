## Why

The dashboard takes >25 s to become usable. Measured against the real ledger
(`kryptofolio_ledger.db`, 775 spot transactions / 639 tax lots / 193 lot history
events, Node 24.16.0), the cause is structural, not incidental: the entire derived
FIFO chain is a stack of DuckDB `VIEW`s, so **every endpoint recomputes it from
scratch**, and the nine requests the app fans out on load serialize over a **single
shared `DuckDBConnection`**.

Measured baseline (9 parallel requests, one connection, everything a VIEW):

| endpoint | resolved at |
|---|---|
| `/metrics/allocation`, `/metrics/heatmap`, `/metrics/performance` | ~3.405 ms |
| `/tax/lots+events` | 5.555 ms |
| `/fiscal/integrity` | 8.427 ms |
| `/metrics/drawdown` | 9.010 ms |
| `/metrics/risk` | 11.496 ms |
| `/tax/report` | 12.079 ms |
| `/portfolio/summary` | 13.650 ms (always last) |
| **total** | **13.660 ms** |

Cold start is *not* the problem (`initialize()` = 493 ms, first cold FIFO chain =
125 ms); the cost is recurrent per request. `getKpis` costs 3.415 ms in isolation but
resolves at 13.7 s under fan-out — it does not compute, it *waits*. With the frontend
refetching (no `staleTime`, Pinia Colada default 5 s) the user observes >25 s.

A measured experiment settles the fix: materializing the six derived relations as
tables costs **400 ms once** (ffe 145, matches 23, calc_lots 48, calc_events 31,
balances 29, valuation 124) and takes the same nine-request fan-out over the same
single connection to **949 ms — a 14x improvement**. Equivalence was verified by
serializing both runs to JSON: kpis, performance, heatmap, risk, drawdown, allocation,
data-quality, `lots+events` (544 KB of payload) and the fiscal report are **identical**;
`holdings` is identical once `portfolioLocations` order is normalized. **Zero numeric
drift — the materialization is semantically neutral.**

The same investigation surfaced two live correctness defects that this change removes
rather than works around (see *What Changes* 2 and 6).

## What Changes

1. **The six derived relations become materialized tables instead of VIEWs** —
   `v_flattened_fifo_events`, `v_fifo_matches`, `v_calculated_tax_lots`,
   `v_calculated_lot_history_events`, `v_daily_running_balances`,
   `v_portfolio_daily_valuation` — governed by `FifoMaterializerService` and the
   **already existing** `fifo_needs_recalculation` settings flag
   (`FifoMaterializerService.ts:62-64`).
2. **Read requests rebuild synchronously when the flag is dirty.** *Decision already
   taken by the user; not reopened here.* The request waits the ~400 ms and always
   reads fresh data. 400 ms is cheap, and it eliminates at the root the bug class
   "the user saw a figure from before the last import" — unacceptable in an IRPF
   calculator. Rejected: (a) rebuild only on ingestion, (b) serve materialized data
   marked stale.
3. **The temp-table pinning in `DuckDbMetricsAdapter.getKpis` is removed.** It is a
   patch on this same performance problem — its comment (`DuckDbMetricsAdapter.ts:69-79`)
   states the correct diagnosis but the remedy lasts one call. **It is also a live
   correctness bug**: `CREATE OR REPLACE TEMP TABLE kpi_open_lots / kpi_valuation /
   kpi_events / kpi_returns_volatility` runs on the process's single shared connection
   (`DuckDbAdapter.ts:45` opens one `instance.connect()`, no pool, no mutex).
   `/portfolio/summary` and `/metrics/kpis` both call `getKpis` and the dashboard fires
   them in parallel; with differing currencies (`?currency=USD` vs base EUR) the second
   call overwrites the first's temp tables mid-way through its 12 statements, producing
   KPIs that **mix two currencies**. It does not manifest today only because the
   frontend always requests the same currency.
4. **The dual-source branch stops recomputing the FIFO unconditionally.**
   `OPEN_LOTS_WITH_QUALITY` and `REALIZED_EVENTS` currently `UNION ALL`
   `ledger.tax_lots` / `ledger.lot_history_events` against `v_calculated_*`, re-reading
   what is already materialized *and* recomputing the whole FIFO in case the
   materializer lags. This is where the bulk of `getKpis`' 3.4 s lives. Source
   selection becomes flag/version-driven instead of an unconditional UNION.
5. **Connection pool in `DuckDbAdapter`.** `DuckDBInstance` supports N connections with
   MVCC and the `ATTACH` is instance-level, so it is shared. Without a pool the backend
   is structurally unable to serve two concurrent requests.
6. **Deterministic `ORDER BY` for `portfolioLocations`** (pre-existing bug, not caused
   by this change): two consecutive `getHoldingsSnapshot()` calls over the *same*
   materialized state return the array in different order (measured: `stable across two
   calls: false`). Causes pointless re-renders and flaky tests.
7. **Frontend:** explicit `staleTime` on every `useQuery` in
   `useCryptoMetricsQueries.ts` and `usePortfolioQueries.ts`, and **currency in the
   query keys** — `["crypto-metrics-kpis"]`, `["portfolio-summary"]`,
   `["crypto-asset-allocation"]`, `["crypto-risk-metrics"]` omit it today, which is a
   cache bug when the display currency changes.

Not breaking at the API surface: no route, request or response shape changes.

## Capabilities

### New Capabilities
- `duckdb-derived-materialization`: the six derived FIFO relations exist as
  materialized tables rebuilt from SQLite by `FifoMaterializerService`; freshness is
  governed by `fifo_needs_recalculation`; a dirty flag on a read request triggers a
  synchronous rebuild before the request is served; the materialized state is fully
  re-derivable and holds nothing SQLite does not already have.
- `duckdb-connection-pool`: `DuckDbAdapter` serves concurrent requests from a pool of
  connections over one `DuckDBInstance`, with the instance-level `ATTACH` shared and no
  per-request session state leaking between connections.

### Modified Capabilities
- `duckdb-engine-setup`: engine initialization must create/refresh the derived chain as
  tables rather than declaring it as views, and must expose a pooled connection rather
  than a single shared one.
- `automatic-portfolio-rebuild`: adds synchronous on-read rebuild when
  `fifo_needs_recalculation` is set, alongside the existing once-per-ingestion-batch
  rebuild.
- `crypto-metrics-kpi`: KPI computation no longer pins intermediate results into
  session temp tables; a KPI response is required to reflect exactly one currency
  regardless of concurrent requests for other currencies.
- `duckdb-risk-metrics`: risk/drawdown/performance queries read the materialized chain
  instead of recomputing it.
- `fifo-materialization-reconciliation`: the dual-source (`OPEN_LOTS_WITH_QUALITY` /
  `REALIZED_EVENTS`) selection becomes flag-driven instead of an unconditional
  `UNION ALL` with a live FIFO recomputation.
- `lot-custody-traceability`: *Current Custody Location View* gains a deterministic
  ordering requirement for `portfolioLocations`.
- `portfolio-colada`: query keys must include the display currency, and every server-data
  query must declare an explicit `staleTime`.

## Impact

**Backend** — `apps/backend/src/core/infrastructure/adapters/DuckDbAdapter.ts`
(pool), `DuckDbMetricsAdapter.ts` (temp-table removal, dual-source branch), the
`FifoMaterializerService`, and the DuckDB view/table DDL for the six derived relations.
**Frontend** — `useCryptoMetricsQueries.ts`, `usePortfolioQueries.ts`.
**Docs** — `docs/fifo-tax-engine.md` and `docs/architecture/duckdb-*.md` describe the
chain as views and must be corrected in the same change.

Non-negotiable rules this change brushes against:
- **Rule 6 (global per-asset FIFO for tax; separate custody ledger).** This is the
  central risk: the change touches the FIFO materializer and every derived FIFO view.
  The tax ordering (`PARTITION BY asset_id ORDER BY timestamp, tx_id`) must be
  preserved verbatim by materialization, and the custody path (item 6, deterministic
  `portfolioLocations` ordering) must stay a **presentation** ordering — it must not be
  allowed to leak into or reorder the tax FIFO queue. The two orderings stay separate
  relations; nothing here merges them. Empirical support: the equivalence check found
  zero numeric drift across the fiscal report and the 544 KB `lots+events` payload.
- **DuckDB stays re-derivable from SQLite.** The materialized tables persist nothing
  SQLite does not already hold; they must survive being dropped and rebuilt from
  scratch, and no business logic may depend on their persisting across a rebuild.
- **Rule 8 (no patches, no workarounds).** Item 3 deletes an existing workaround rather
  than extending it; item 4 removes a defensive recomputation rather than gating it
  behind a flag-shaped shim.
- **Rule 5 (discriminated unions).** The materialization freshness state (fresh /
  dirty / rebuilding) must be modelled as a union, not a boolean plus optional
  timestamp.
- **Rule 4 (money is never a raw float).** Materializing to tables fixes column types;
  decimal columns must retain their exact `DECIMAL` typing, never landing as `DOUBLE`.

Explicitly deferred: no asynchronous/background rebuild strategy, no incremental
(delta) materialization, no caching layer in front of the HTTP routes, no change to
route or DTO shapes.
