# Tasks — materialize-fifo-derived-chain

Every command below runs with the pinned Node from `engines` (`>=24.16.0`). Prefix
every `pnpm`, `node`, `vitest` and `git commit` invocation with:

```
PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"
```

The shell default (v20.20.0) breaks `node:sqlite` and the Husky pre-commit hook.

TDD is strict (CLAUDE.md rules 2 and 3): every implementation task is preceded by a
failing-test task, and every behaviour carries a **confirmed break** task — apply a
deliberate break to the *production* code, confirm the named assertion goes red for the
stated reason (not a typo, not a missing import, and on a line the case under test
actually reaches), then restore. A green suite never watched go red is not evidence.

## 1. Baseline and the three measurements the design deferred

- [ ] 1.1 Record the green baseline before touching anything: `PATH=... pnpm typecheck` and `PATH=... pnpm test` at the root; write down which suites pass, so "still green" has a meaning. Confirm the frontend leg runs `vue-tsc --build --force` (a bare `--noEmit` checks zero files in this repo).
- [ ] 1.2 Reproduce the motivating measurement against the real ledger (775 tx / 639 lots): run the nine-request fan-out and record per-endpoint resolution times plus the total. Expect ~13.660 ms total with `/portfolio/summary` last at ~13.650 ms; if the numbers differ materially from `scratchpad/perf-findings.md`, stop and reconcile before implementing — the change is justified by this number.
- [ ] 1.3 **Measurement 1 (D5, Open Question 1).** Run `SELECT COUNT(*) FROM ledger.tax_lots WHERE spot_transaction_id IS NULL` against the real `kryptofolio_ledger.db` and record the count in this file. Non-zero → `v_external_tax_lots` covers live rows. Zero → it is still declared, and task 6.4 must record explicitly that the equivalence test does not cover that source. Do not start task 6.x before this is recorded.
- [ ] 1.4 **Measurement 2 (D2, Open Question 2).** Write a throwaway probe against a real DuckDB instance: begin a transaction on connection A, run `CREATE OR REPLACE TABLE m_probe AS SELECT ...`, and read the same relation from connection B before and after `COMMIT`. Record whether B observes the pre-rebuild rows before `COMMIT` and the post-rebuild rows after. This decides D2's primary shape vs. its documented `_next` + rename fallback; task 4.x must not be designed against an assumption.
- [ ] 1.5 **Measurement 3 (D7, Open Question 3).** Probe that the instance-level `ATTACH ledger` performed on the bootstrap connection is visible from a **newly created** connection on the same `DuckDBInstance`: create a second connection after `initialize()` and `SELECT COUNT(*) FROM ledger.spot_transactions`. Record the result. If it is not visible, the `ATTACH` moves into `prepareConnection()` and task 9.x is written accordingly.
- [ ] 1.6 Record the pre-existing `portfolioLocations` instability: call `getHoldingsSnapshot()` twice over the same state and confirm the arrays differ in order (measured `stable across two calls: false`). This is the observation task 10.1 turns into a failing test.

## 2. Domain: freshness union and the derived-chain port

- [ ] 2.1 Write the failing type-level test for `FifoChainState` (`apps/backend/src/core/domain/models/`): assert the union is discriminated on `kind`, that `buildId`/`builtAt` are reachable only through the `fresh` variant, and that `{ kind: 'fresh' }` without a build id and `{ kind: 'stale', buildId }` do **not** typecheck. Ensure `typecheck` is configured for the test runner — an `expectTypeOf` that compiles to nothing is one of this repo's five known vacuous-pass shapes.
- [ ] 2.2 Implement `FifoChainState`, `FreshChain` and the branded `FifoBuildId` in `core/domain/models/` exactly as D6 specifies. No Zod, no `decimal.js`, no external import (rule 3). No boolean-plus-optional-timestamp shape (rule 5).
- [ ] 2.3 Confirmed break: change the `fresh` variant to `{ kind: 'fresh'; buildId?: FifoBuildId }` and confirm the "fresh without a build id must not typecheck" assertion goes red; restore.
- [ ] 2.4 Declare `IDerivedChainPort` in `core/domain/ports/` with `rebuild(): Promise<FifoBuildId>` and `describe(): Promise<FifoChainState>`. Interface only, importing nothing external.
- [ ] 2.5 `PATH=... pnpm --filter @kryptofolio/backend typecheck` and its test leg.

## 3. Relocate the six definitions and declare the three-object shape

- [ ] 3.1 Write the failing catalogue test: after `initialize()`, assert each of the six relations exists as `v_<name>__def` (a view), `v_<name>` (a view selecting from `m_<name>`), and that any pre-existing `m_<name>` table has been dropped, leaving the chain `{ kind: 'stale', reason: 'never-built' }`.
- [ ] 3.2 Relocate each of the six view bodies from the inline `CREATE OR REPLACE VIEW` in `DuckDbAdapter.initialize()` into `v_<name>__def`, **verbatim** — a pure text move, reviewed as such. `v_fifo_matches__def` keeps `PARTITION BY asset_id ORDER BY timestamp, tx_id` byte-identical (rule 6, D8). Each `__def` reads the **public** name of its upstream relation.
- [ ] 3.3 Create the six public views `v_<name> AS SELECT * FROM m_<name>` and add the startup drop of any pre-existing `m_<name>`. No consumer call site changes: the ~40 existing references keep resolving.
- [ ] 3.4 Confirmed break: rename one `__def` and confirm the catalogue test fails on *that* relation for a missing-object reason; restore.
- [ ] 3.5 Diff review of 3.2 specifically as a relocation — confirm the FIFO ordering clause is unchanged text, not re-typed.
- [ ] 3.6 `PATH=... pnpm --filter @kryptofolio/database typecheck` and test.

## 4. The rebuild: one transaction, dependency order, decimal assertion

- [ ] 4.1 Write the failing isolation test decided by measurement 1.4: seed the ledger, rebuild, snapshot a distinguishing query; insert a new transaction; start a rebuild on connection A and run the query on connection B before `COMMIT` — assert the **old** values; after `COMMIT`, assert the **new** ones.
- [ ] 4.2 Write the failing rollback test: make one chain statement raise partway through; assert the transaction rolls back, every `m_<name>` retains its pre-rebuild contents, and `needs_recalculation` stays `'true'`.
- [ ] 4.3 Write the failing decimal-assertion test: force one definition's monetary column to `CAST(x AS DOUBLE)` and assert the rebuild throws **before** `COMMIT` with the previous chain intact.
- [ ] 4.4 Implement the rebuild as one explicit transaction executing the six `CREATE OR REPLACE TABLE m_<name> AS SELECT * FROM v_<name>__def` in dependency order (`flattened_fifo_events → fifo_matches → calculated_tax_lots → calculated_lot_history_events → daily_running_balances → portfolio_daily_valuation`) plus the `m_fifo_build` stamp. If 1.4 showed the isolation guarantee does not hold, implement D2's documented `_next` + rename fallback inside the same transaction instead — and say so here.
- [ ] 4.5 Implement the pre-`COMMIT` invariant: compare `DESCRIBE m_<name>` against `DESCRIBE v_<name>__def` column by column; throw on any type mismatch and on any `DOUBLE`/`FLOAT`/`REAL` in a column the definition declared `DECIMAL`. This is a rebuild invariant, not only a test. No second hand-written column DDL anywhere (D3).
- [ ] 4.6 Implement `DuckDbDerivedChainAdapter` in `apps/backend/src/core/infrastructure/adapters/` implementing `IDerivedChainPort`; all DuckDB SQL lives here or in `packages/database`, never in the domain. Assert by test that `packages/database` contains no reference to `needs_recalculation` semantics and takes no rebuild-triggering decision.
- [ ] 4.7 Confirmed break for 4.5: widen one declared `DECIMAL(38,18)` cast to `DOUBLE` in a definition and confirm the in-rebuild assertion (not just the test) goes red for the degraded-type reason; restore.
- [ ] 4.8 Confirmed break for 4.1: remove the `BEGIN`/`COMMIT` wrapper and confirm connection B observes a mixed chain and the isolation assertion goes red; restore.
- [ ] 4.9 `PATH=... pnpm --filter @kryptofolio/database typecheck && pnpm --filter @kryptofolio/backend typecheck`, plus both test legs.

## 5. Equivalence and type-preservation of the materialized chain

- [ ] 5.1 Write the parameterized equivalence test over the six relations: run `v_<name>__def` and `m_<name>`, order both by the relation's key, render every decimal column as `CAST(col AS VARCHAR)` (string equality — no float comparison sneaks in), compare full result sets.
- [ ] 5.2 Add the non-vacuity guard: assert a pinned minimum row count per relation from the real fixture ledger *first*, so an empty relation fails loudly instead of trivially matching another empty relation.
- [ ] 5.3 Confirmed break: change one `CAST(... AS DECIMAL(38,18))` to `DECIMAL(38,8)` in one definition and confirm **that relation's** assertion goes red for a rounding difference — verifying the break reached the relation under test, not a neighbouring line; restore.
- [ ] 5.4 Write the type-preservation test: per relation, `DESCRIBE m_<name>` against a pinned column→type map, asserting at least one `DECIMAL` column for every money-bearing relation.
- [ ] 5.5 Write the re-derivability test: drop all `m_*`, rebuild over an unchanged ledger, assert the tables are identical to those from a rebuild without dropping; and assert deleting the analytical `.duckdb` file then restarting yields the same values.
- [ ] 5.6 Assert no new money boundary: decimal columns still read out of DuckDB as `VARCHAR` and reach the domain as `PreciseAmount`; no `Decimal.js` or float conversion added under `core/domain` (rule 4).

## 6. Declared sources: `v_external_tax_lots`, and deleting the lag hedge

*Blocked on measurement 1.3.*

- [ ] 6.1 Write the failing test for `v_external_tax_lots`: a `ledger.tax_lots` row with `spot_transaction_id IS NULL` and non-zero remaining quantity appears in the materialized open-lot relation after a rebuild, carrying the same columns and quality flags as a FIFO-derived lot.
- [ ] 6.2 Declare `v_external_tax_lots` and union it into the **definition** of the materialized open-lot relation, so it is computed once per rebuild rather than once per query.
- [ ] 6.3 Write the failing test asserting the hedge is gone: the open-lot and realized-event definitions contain no branch predicated on `(SELECT COUNT(*) FROM ledger.lot_history_events) = 0` or any equivalent emptiness test, and no per-query FIFO recomputation.
- [ ] 6.4 Delete the lag hedge from `OPEN_LOTS_WITH_QUALITY` and `REALIZED_EVENTS` in `DuckDbMetricsAdapter.ts`. No flag-shaped shim, no build-stamp predicate at query time (rule 8): `m_fifo_build` serves observability and the freshness state only. If 1.3 returned zero, record here explicitly that the external-lot source is not covered by live rows in the equivalence test.
- [ ] 6.5 Write the failing test asserting removing the hedge changes no figure: KPI, fiscal report and lot/event payloads before and after, over the same committed ledger state, identical with every decimal compared as an exact string.
- [ ] 6.6 Assert (rule 6) that unioning external lots leaves `PARTITION BY asset_id ORDER BY timestamp, tx_id` unchanged and alters no disposal-to-acquisition match.
- [ ] 6.7 Confirmed break: reintroduce the emptiness-test branch and confirm the 6.3 assertion goes red; restore.
- [ ] 6.8 `PATH=... pnpm --filter @kryptofolio/backend typecheck` and test.

## 7. `FifoChainFreshnessService` — single-flight coalescence

- [ ] 7.1 Write the failing deterministic coalescence test (no timing): inject an `IDerivedChainPort` double whose `rebuild()` returns a test-controlled deferred; fire nine `ensureFresh()` calls; assert `rebuild` was invoked **exactly once** while the deferred is pending; resolve it; assert all nine resolve with the same `buildId`.
- [ ] 7.2 Write the failing tests for the remaining coalescence properties: a call after settlement with the flag dirty again starts a **new** rebuild (no permanent memo); a **rejected** rebuild rejects all nine waiters with a typed failure, leaves `needs_recalculation` `'true'`, and leaves the next call able to retry.
- [ ] 7.3 Write the failing test for the no-op path: with the flag `'false'`, `ensureFresh()` invokes no rebuild and resolves with the current build id.
- [ ] 7.4 Implement `FifoChainFreshnessService` in `apps/backend/src/core/application/services/`, depending on `IUserSettingsPort` and `IDerivedChainPort`. `ensureFresh(): Promise<FreshChain>` returns only the fresh variant, so "query a chain that isn't fresh" is uninhabitable. Private `inFlight` memo cleared in a `finally`.
- [ ] 7.5 Implement the consecutive-failure backoff so a persistently failing rebuild does not have every request queue its own 400 ms attempt; the flag stays dirty either way — stale data is never served.
- [ ] 7.6 Register the service as a **singleton** in the DI composition root, and route `IngestAndMaterializeUseCase` and the override mutations through the same instance, so an ingestion-triggered rebuild and an on-read rebuild can never become two concurrent DuckDB writers. Add the test asserting exactly one rebuild transaction is open at a time.
- [ ] 7.7 Confirmed break: delete the `inFlight` memo and confirm the "exactly once" assertion in 7.1 goes red; restore.
- [ ] 7.8 `PATH=... pnpm --filter @kryptofolio/backend typecheck` and test.

## 8. Wire `ensureFresh()` into the read use cases

- [ ] 8.1 Write the failing enumeration test: enumerate the use cases resolving from `IMetricsPort` and the tax ports and assert each awaits `ensureFresh()` **before** its first port read.
- [ ] 8.2 Write the failing out-of-HTTP test: invoke a derived-chain read use case directly, with no HTTP request and no middleware in the path, and assert the staleness check and synchronous rebuild still occur.
- [ ] 8.3 Add the `await ensureFresh()` call to each enumerated read use case — in the use case, not in a route middleware (D4).
- [ ] 8.4 Write and satisfy the fan-out test: nine parallel reads against a stale chain trigger exactly one rebuild and are all answered from the same committed rebuild.
- [ ] 8.5 Confirmed break: remove the `await` from one use case and confirm the 8.1 assertion names *that* use case; restore.
- [ ] 8.6 `PATH=... pnpm --filter @kryptofolio/backend typecheck` and test.

## 9. Connection pool + temp-table removal (must land together)

*These two are inseparable (design, Migration Plan): a pool with the `kpi_*` temp
tables still present converts a latent currency race into an active nondeterministic
one. Do not split this group across commits.*

- [ ] 9.1 Write the failing structural test for `getKpis`: a spying analytical port asserts it emits **no** `CREATE ... TEMP TABLE` / `CREATE OR REPLACE TEMP TABLE` statement at all. (Structural, so it cannot flake the way the behavioural currency-race test would.)
- [ ] 9.2 Delete the four `CREATE OR REPLACE TEMP TABLE kpi_open_lots / kpi_valuation / kpi_events / kpi_returns_volatility` pins from `DuckDbMetricsAdapter.getKpis` and its stale explanatory comment. Rewrite those queries to read the public materialized relations directly — no replacement pinning, no shim (rule 8).
- [ ] 9.3 Add the behavioural companion: concurrent `?currency=USD` and base-EUR `getKpis`, each response internally consistent in exactly one currency, with no figure denominated in the other's.
- [ ] 9.4 Write the failing pool tests: at most `DUCKDB_POOL_SIZE` connections exist (default 4 when unset); waiters are granted connections in arrival order (FIFO); a throwing query returns its connection so a subsequent acquire succeeds; `bulkInsert` holds exactly one connection for the appender's whole lifetime and releases it on failure too.
- [ ] 9.5 Implement the fixed-size lazy pool in `DuckDbAdapter` over the single `DuckDBInstance`, with `acquire()`/release-in-`finally` on every path, `DUCKDB_POOL_SIZE` (default 4) tuned alongside the already-honoured `DUCKDB_THREADS`. Remove the single process-wide shared connection; assert by test that no module holds a long-lived reference to one.
- [ ] 9.6 Apply measurement 1.5: keep `INSTALL/LOAD sqlite` and `ATTACH ledger` on the bootstrap connection at instance level if it proved visible to new connections; otherwise move the `ATTACH` into `prepareConnection()`. Add the test that a connection created after `initialize()` queries `ledger.spot_transactions` successfully without re-running `ATTACH`.
- [ ] 9.7 Add `prepareConnection(conn)` as an explicitly empty, single declared home for per-connection setup, and the test asserting no connection-scoped session state remains — no `CREATE ... TEMP TABLE` across a full dashboard fan-out, and no query result depending on which pooled connection served it.
- [ ] 9.8 Keep `ensureCustodyRelations` exactly as it is: it creates catalogue views shared by every connection, memoized once per adapter singleton — one bootstrap for the whole pool, not one per connection. Add the test asserting the resulting views are visible from every pooled connection.
- [ ] 9.9 Confirmed break for 9.1: reintroduce one pinned temp table and confirm the structural assertion goes red; restore.
- [ ] 9.10 Confirmed break for 9.4: remove the `finally` release on the throwing path and confirm the pool-exhaustion assertion goes red; restore.
- [ ] 9.11 `PATH=... pnpm --filter @kryptofolio/database typecheck && pnpm --filter @kryptofolio/backend typecheck`, plus both test legs.

## 10. Ordering: heaps have no incidental order

- [ ] 10.1 Turn observation 1.6 into the failing test: `getHoldingsSnapshot()` called twice over the same materialized state, no ledger mutation between, must return each holding's `portfolioLocations` in an identical order.
- [ ] 10.2 Add an explicit `ORDER BY` over a total, non-null key in the **holdings-snapshot presentation query** in the adapter. Assert it appears only there — it must never enter a FIFO relation, and the taxation FIFO stays `PARTITION BY asset_id ORDER BY timestamp, tx_id`, unpartitioned by account and byte-identical to its prior definition (rule 6, D8).
- [ ] 10.3 Assert the custody relations stay **views**: after a rebuild, no `m_` table exists for any custody relation (`v_custody_*` / `v_lot_*`).
- [ ] 10.4 Audit every consumer of the six derived relations for reliance on a view's incidental emission order; add an explicit `ORDER BY` wherever the response order is observable — daily time series in risk/drawdown/performance included. The order-sensitive comparison in 5.1 is what catches any missed.
- [ ] 10.5 Assert the risk/drawdown/volatility/performance SQL reads the public materialized relations and does **not** re-execute the FIFO matching window computation, and that two consecutive calls return each sequence in identical order.
- [ ] 10.6 Confirmed break for 10.1: remove the new `ORDER BY` and confirm the stability assertion goes red for a differing array order; restore.
- [ ] 10.7 `PATH=... pnpm --filter @kryptofolio/backend typecheck` and test.

## 11. Frontend: `staleTime` and currency in the query keys

- [ ] 11.1 Write the failing test enumerating the `useQuery` calls in `useCryptoMetricsQueries.ts` and `usePortfolioQueries.ts`: each must pass an explicit `staleTime`, none may inherit Pinia Colada's 5 s default.
- [ ] 11.2 Write the failing test enumerating query keys: every query whose request carries a currency parameter includes that currency as its own key segment — at minimum `crypto-metrics-kpis`, `portfolio-summary`, `crypto-asset-allocation`, `crypto-risk-metrics`.
- [ ] 11.3 Write the failing behavioural tests: switching EUR → USD resolves to a different key and issues a request for the new currency (the rendered figures are not the EUR payload); switching back leaves the EUR entry still addressable under its own key, neither having overwritten the other.
- [ ] 11.4 Add the explicit `staleTime` (60 s) to every `useQuery` in both composables, and add the currency segment to each currency-dependent key.
- [ ] 11.5 Ensure the ledger-dirtying mutations (ingestion, override edits, rebuild) invalidate the portfolio and metrics keys on success, so freshness comes from explicit invalidation rather than a short default re-firing the nine-request fan-out on navigation.
- [ ] 11.6 Confirmed break: drop the currency segment from one key and confirm the 11.3 "figures must not be the EUR payload" assertion goes red for a stale-payload reason; restore.
- [ ] 11.7 `PATH=... pnpm --filter @kryptofolio/frontend typecheck` — confirm it invokes `vue-tsc --build --force`; a bare `--noEmit` checks zero files here. Plus the frontend test leg.

## 12. Docs

- [ ] 12.1 Correct `docs/fifo-tax-engine.md` where it describes the six derived relations as views: they are `v_<name>__def` definitions, `m_<name>` tables and `v_<name>` public views, rebuilt in one transaction.
- [ ] 12.2 Correct `docs/architecture/duckdb-*.md` and `docs/database-architecture.md`: the view graph, the pool replacing the single shared connection, the synchronous on-read rebuild, and the fact that the custody relations stay views.
- [ ] 12.3 State in the docs that DuckDB remains fully re-derivable from SQLite — the `m_*` tables hold nothing SQLite does not already hold, and deleting the analytical `.duckdb` file is a valid recovery.

## 13. Final validation

- [ ] 13.1 Reproduce the motivating measurement post-change with the same method as 1.2, against the same real ledger: the nine-request fan-out must drop from the measured **13.660 ms** to **~949 ms**, and `/portfolio/summary` must no longer resolve last at ~13.650 ms. Record the actual numbers next to the baseline.
- [ ] 13.2 Verify numeric equivalence materialized-vs-view end to end, as the experiment already demonstrated byte-for-byte: kpis, performance, heatmap, risk, drawdown, allocation, data-quality, `lots+events` (~544 KB payload) and the fiscal report identical, with every decimal compared as an exact string; `holdings` identical, now including `portfolioLocations` order without normalization.
- [ ] 13.3 Confirm the one-off rebuild cost is in the expected envelope (~400 ms: ffe ~145, matches ~23, calc_lots ~48, calc_events ~31, balances ~29, valuation ~124); investigate any relation materially off before declaring done.
- [ ] 13.4 Grep the diff for `any` in production code — `: any|as any|<any>` **and** `, any>`, which the first pattern misses (`Record<string, any>`). Zero hits, `as never` included.
- [ ] 13.5 Run the full root suite with the pinned Node: `PATH=... pnpm typecheck && PATH=... pnpm test`. Every package touched — `packages/database`, `apps/backend`, `apps/frontend` — must be typechecked, not just tested; `vitest` has stayed green here while `tsc`/`vue-tsc` caught real errors.
- [ ] 13.6 Re-read the change's own guardrails against the diff: hexagonal layering intact (`IDerivedChainPort` in the domain, SQL in the adapter, no business logic in `packages/database`), the domain importing nothing external, money never a float, freshness a discriminated union, the tax FIFO ordering byte-identical, and no compatibility shim or feature flag anywhere.
- [ ] 13.7 Record the resolved answers to the three measurements (1.3, 1.4, 1.5) in `design.md`'s Open Questions section, so the archived design states what was measured rather than what was deferred.

## 14. Archive notes (for `/opsx:archive`, not for implementation)

- [ ] 14.1 `openspec/specs/portfolio-colada/spec.md` has no parseable requirements today, so this change's delta is entirely `ADDED`. When archiving, **replace** that file's loose `## Requirements` (numbered list) and `## Scenarios` sections with the new requirement blocks — do not leave the old sections coexisting alongside them.
- [ ] 14.2 The `fifo-materialization-reconciliation` delta is entirely `ADDED` because the dual-source lag hedge never existed as a named requirement. It is therefore prohibited by a new requirement rather than expressed as `REMOVED`; do not look for a matching requirement to delete when merging.
