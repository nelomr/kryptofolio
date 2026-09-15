# Design — materialize-fifo-derived-chain

## Context

The derived FIFO chain is today a stack of DuckDB `VIEW`s declared inline in
`DuckDbAdapter.initialize()` (`packages/database/src/adapters/DuckDbAdapter.ts`,
lines 357–1172). Because a view is a macro, **every endpoint re-executes the whole
chain**, and the process serves all of it over a **single `DuckDBConnection`**
(`DuckDbAdapter.ts:29,45`). The nine requests the dashboard fans out therefore
queue behind one another: measured **13.660 ms total**, with `/portfolio/summary`
always last at 13.650 ms — it does not compute, it waits.

All numbers below are **measured**, not inferred, against the real ledger
(775 spot transactions / 639 tax lots / 193 lot history events, Node 24.16.0);
see the proposal's *Why* section. The decisive experiment: materializing the six
derived relations as tables costs **400 ms once** (ffe 145, matches 23, calc_lots 48,
calc_events 31, balances 29, valuation 124) and takes the same nine-request fan-out
over the same single connection to **949 ms — 14x**. Both runs were serialized to
JSON and compared: kpis, performance, heatmap, risk, drawdown, allocation,
data-quality, the 544 KB `lots+events` payload and the fiscal report are **byte-identical**;
`holdings` matches once `portfolioLocations` order is normalized. **Zero numeric drift —
materialization is semantically neutral.** This design does not re-derive any of that.

Two live defects surfaced in the same investigation and are removed here rather than
worked around (rule 8): the `CREATE OR REPLACE TEMP TABLE` pinning in
`DuckDbMetricsAdapter.getKpis` (a currency-mixing race on the shared connection), and
the non-deterministic ordering of `portfolioLocations`.

**A decision is already taken by the user and is not reopened:** on a read request
finding `needs_recalculation = 'true'`, the rebuild is **synchronous**. The request
waits ~400 ms and always reads fresh data. Rejected explicitly: rebuild-only-on-ingest,
and serving materialized data marked stale. Rationale: 400 ms is cheap, and it
eliminates at the root the bug class *"the user saw a figure from before the last
import"*, which is unacceptable in an IRPF calculator.

Note on naming: the proposal calls the flag `fifo_needs_recalculation`; the key that
actually exists in `user_settings` is **`needs_recalculation`**
(`FifoMaterializerService.ts:63`, `IngestAndMaterializeUseCase.ts:85`,
`CsvIngestionUseCase.ts:465`, `OverrideMutation.ts:64`). This design uses the real key.
Note also that today's `FifoMaterializerService` materializes **DuckDB → SQLite**
(reconciling `tax_lots` / `lot_history_events` / custody entries). The DuckDB-internal
materialization introduced here is a **different, new concern** and gets its own
service rather than being bolted onto that one.

## Goals / Non-Goals

**Goals**
- The six derived relations are physical tables, rebuilt transactionally from SQLite.
- A read never observes a chain older than the last ledger mutation, and never observes
  a half-built chain.
- Nine concurrent requests are served concurrently, from a connection pool.
- Decimal typing survives materialization exactly; money never becomes a float anywhere.
- Freshness is a discriminated union, not a boolean plus an optional timestamp.
- The tax FIFO ordering is preserved *verbatim*; custody stays a separate relation set.

**Non-Goals**
- No asynchronous or background rebuild; no incremental/delta materialization.
- No HTTP-level cache; no route, request or response shape changes.
- No materialization of the custody chain (`v_custody_*`, `v_lot_*`) — it stays views.
- No change to how ingestion writes SQLite, nor to `FifoMaterializerService`'s
  DuckDB → SQLite reconciliation.

## Decisions

### D1 — Definition view + materialized table + stable public name

Each of the six relations splits in three:

| role | name | what it is |
|---|---|---|
| definition | `v_<name>__def` | the current view SQL, **relocated verbatim**, reading the *public* names of its upstream relations |
| storage | `m_<name>` | the table produced by `CREATE OR REPLACE TABLE m_<name> AS SELECT * FROM v_<name>__def` |
| public | `v_<name>` | `CREATE OR REPLACE VIEW v_<name> AS SELECT * FROM m_<name>` |

Every existing consumer keeps referring to `v_flattened_fifo_events`,
`v_fifo_matches`, `v_calculated_tax_lots`, `v_calculated_lot_history_events`,
`v_daily_running_balances`, `v_portfolio_daily_valuation` and is untouched. Because a
`__def` reads the *public* name of its upstream, each rebuild step consumes the table
built by the previous step — which is precisely where the 400 ms figure comes from
(the chain runs once, not once per level). Rebuild order is the dependency order:
`flattened_fifo_events → fifo_matches → calculated_tax_lots →
calculated_lot_history_events → daily_running_balances → portfolio_daily_valuation`.

*Alternatives rejected.* (a) Rename consumers to point at `m_*` — churns ~40 call sites
and loses the single seam where the public contract is declared. (b) Drop the view layer
and let `m_*` be the public name — then the definition SQL has no home and the
equivalence test (D9) has nothing to compare against. Keeping `__def` alive is what makes
"materialized == computed" a *runnable assertion* rather than a claim.

### D2 — Isolation: one transaction over the whole chain, not a `_next`/rename swap

The rebuild runs as a single explicit transaction on one pooled connection:

```
BEGIN;
  CREATE OR REPLACE TABLE m_flattened_fifo_events AS SELECT * FROM v_flattened_fifo_events__def;
  ... (six statements, in dependency order) ...
  CREATE OR REPLACE TABLE m_fifo_build AS SELECT ... ;   -- build stamp, see D5
COMMIT;
```

DuckDB is MVCC and DDL participates in transactions, so a reader on another connection
holds its snapshot and sees the **complete previous chain** until `COMMIT`, then the
**complete new chain** — never a mixture. Inside the transaction, each step sees its own
uncommitted writes, which is exactly what the cascading rebuild needs. A failure anywhere
rolls the whole thing back and leaves the previous chain intact and queryable.

*Alternative rejected:* build `m_<name>_next` and `ALTER TABLE ... RENAME` at the end.
That is hand-rolled MVCC on top of an engine that already provides it, and the rename
sequence itself is not atomic across six tables unless it is *also* in a transaction — so
it buys nothing and adds a failure mode (orphaned `_next` tables after a crash).

**This must be verified, not assumed** (working-method rule 5): an integration test opens
a second connection, reads a distinguishing row set mid-rebuild, and asserts pre-rebuild
values before `COMMIT` and post-rebuild values after. If DuckDB's build here turns out not
to give that guarantee for `CREATE OR REPLACE TABLE`, the fallback is the `_next` + rename
sequence *inside the same transaction* — but the test decides, not the design.

### D3 — Decimal preservation: CTAS + an asserted schema contract

`CREATE TABLE AS SELECT` adopts the logical types of the SELECT, and the definition SQL
already `CAST`s every monetary expression explicitly to `DECIMAL(38,18)` /
`DECIMAL(18,12)` / `DECIMAL(26,12)` (`DuckDbAdapter.ts:393, 466, 559, 621, 683, 200`).
So the types are already declared at the only place they should be declared: in the
definition. **We do not hand-write a second DDL** — a 1.600-line CAST chain duplicated as
column declarations is a second source of truth guaranteed to drift.

Trusting inference silently is equally unacceptable, so the rebuild **asserts** it. After
the six CTAS statements and *before* `COMMIT`, the rebuild compares `DESCRIBE m_<name>`
against `DESCRIBE v_<name>__def` column-by-column. Any type mismatch, and any
`DOUBLE`/`FLOAT`/`REAL` appearing in a column that the definition declared `DECIMAL`,
throws — the transaction rolls back and the previous chain survives. The assertion is a
rebuild invariant, not only a test.

**Rule 4 boundary, stated explicitly.** Money crosses into TypeScript exactly where it
does today and nowhere else: the adapters read decimal columns as `VARCHAR` and the
backend domain receives `PreciseAmount` (branded string); `Decimal.js` appears only inside
`DuckDbMetricsAdapter` / use-cases, never in `core/domain`. This change introduces **no new
JS↔SQL money boundary** — it moves rows from a view to a table on the SQL side of the line.
The one new risk is *within* SQL (a `DECIMAL` degrading to `DOUBLE` at materialization),
and that is what the assertion above exists to make impossible.

### D4 — Single-flight coalescence lives in a new application service

New `FifoChainFreshnessService` (`apps/backend/src/core/application/services/`):

```ts
public async ensureFresh(): Promise<FreshChain>   // resolves only to the fresh variant
```

It depends on `IUserSettingsPort` (existing) and a new
`IDerivedChainPort` (`core/domain/ports/`) with `rebuild(): Promise<FifoBuildId>` and
`describe(): Promise<FifoChainState>`, implemented by a `DuckDbDerivedChainAdapter` in
`core/infrastructure/adapters/`. Interfaces in the domain, DuckDB SQL in the adapter; the
`database` package gains no business logic (it does not know what a dirty flag means).

Coalescence is a private `inFlight: Promise<FreshChain> | null` field. The first caller
finding the chain stale starts the rebuild and stores the promise; the other eight `await`
the same promise. The field is cleared in a `finally`, so a **rejected** rebuild rejects
all nine waiters and leaves no poisoned promise — the next request retries. A consecutive-
failure counter applies a short backoff so a persistently failing rebuild does not have
every request pay 400 ms; the flag stays dirty either way, because serving stale data is
not an option.

The service is a **singleton in the DI composition root** — that is what makes
"one in-flight rebuild per process" true. `IngestAndMaterializeUseCase` and the override
mutations go through the same instance, so an ingestion-triggered rebuild and an on-read
rebuild can never become two concurrent DuckDB writers.

*Alternatives rejected.* A guard inside the DI container is invisible at the call site and
untestable in isolation. A mutex inside `DuckDbAdapter` puts a business policy (what
"dirty" means) in a package whose charter forbids it. A per-route Hono middleware was
considered for the *call site* (see below) but not for the coalescence itself.

**Where `ensureFresh()` is called:** in the read use cases that consume the derived chain,
not in a route middleware. A use case must be correct when invoked outside HTTP (the
project treats use cases as directly tool-callable), and middleware would not cover that.
The cost of the choice is repetition, paid for by a test that enumerates the use cases
resolving from `IMetricsPort` / the tax ports and asserts each one awaits `ensureFresh()`
before its first port read.

### D5 — Dual-source becomes a declared source union, not a lag hedge

`OPEN_LOTS_WITH_QUALITY` and `REALIZED_EVENTS` (`DuckDbMetricsAdapter.ts:29–47`) each
`UNION ALL` a live FIFO recomputation against `ledger.*`. Two different things are tangled
in there and they are separated rather than flag-gated:

1. **The lag hedge is deleted.** `REALIZED_EVENTS`' branch
   `WHERE (SELECT COUNT(*) FROM ledger.lot_history_events) = 0` exists only to cover
   "the materializer has not caught up". With a synchronous rebuild gated by
   `ensureFresh()`, that state is unreachable: a read is served only after the chain has
   been rebuilt and committed. The guarantee the hedge gave is not lost — it is provided
   upstream, by construction, instead of by re-running the FIFO on every query. This is
   where the bulk of `getKpis`' 3.4 s lives.
2. **The genuinely-different source is kept and named.** `OPEN_LOTS_WITH_QUALITY`'s second
   branch also admits `ledger.tax_lots` rows with `spot_transaction_id IS NULL` — lots that
   are *not* derived from a spot transaction and that the FIFO chain therefore cannot
   produce. Those become an explicit relation `v_external_tax_lots`, unioned into the
   **definition** of the materialized open-lot relation, so it is computed once per rebuild
   instead of once per query.

Whether that second branch matches any row in the real ledger is an **empirical question
this design does not guess** (working-method rule 5): the implementation task begins by
counting `SELECT COUNT(*) FROM ledger.tax_lots WHERE spot_transaction_id IS NULL` against
`kryptofolio_ledger.db`. Non-zero → the relation is kept as specified. Zero → it is kept
anyway as a declared source, because "no such rows today" is not "no such rows ever", but
the equivalence test is then explicitly marked as not covering it.

No version-comparison branch is introduced. Selecting a source by comparing a build stamp
against the ledger at query time would be a flag-shaped shim reproducing the hedge; the
`m_fifo_build` stamp (build id, `built_at`, source row counts) exists for observability and
for the freshness state, **not** as a query-time predicate.

### D6 — Freshness is a discriminated union

In `core/domain/models/` (no Zod, no external import — rule 3):

```ts
export type FifoBuildId = string & { __brand: 'FifoBuildId' };

export type FifoChainState =
  | { readonly kind: 'fresh';      readonly buildId: FifoBuildId; readonly builtAt: string }
  | { readonly kind: 'stale';      readonly reason: 'ledger-mutated' | 'never-built' }
  | { readonly kind: 'rebuilding'; readonly buildId: FifoBuildId; readonly startedAt: string };

export type FreshChain = Extract<FifoChainState, { kind: 'fresh' }>;
```

`{ isFresh: boolean; builtAt?: string }` would make "fresh but no build timestamp" and
"stale but timestamped" representable-but-meaningless — the exact shape rule 5 exists to
forbid. Returning `FreshChain` (not `FifoChainState`) from `ensureFresh()` makes "query a
chain that isn't fresh" **uninhabitable by construction**: a caller has nothing else to
hold. `never-built` is distinguished from `ledger-mutated` because it is the only state
where a first read on a fresh install pays the rebuild without any ingestion having
occurred, and conflating them hides that.

### D7 — Connection pool shape

`DuckDbAdapter` gains a fixed-size pool over the single `DuckDBInstance`
(default 4, `DUCKDB_POOL_SIZE`). Connections are created lazily up to the maximum;
`acquire()` returns an idle connection or queues the caller FIFO; every path releases in a
`finally`. `bulkInsert` holds one connection for the whole appender lifetime. Pool size is
tuned together with `DUCKDB_THREADS` (already honoured, `DuckDbAdapter.ts:52-58`), because
4 connections × one-thread-per-core oversubscribes exactly as the test runner already does.

**Connection-scoped state, item by item:**
- `INSTALL/LOAD sqlite` and `ATTACH ledger` are catalogue/instance level and are done once
  on the bootstrap connection in `initialize()`. The design *asserts* this rather than
  assuming it: a test opens a second pooled connection and selects from
  `ledger.spot_transactions`. If the assertion fails, `prepareConnection()` (below) is where
  the `ATTACH` moves.
- `ensureCustodyRelations` (`DuckDbAdapter.ts:1980`) creates **views**, which are catalogue
  objects shared by every connection; only the memoizing promise is per-adapter, and the
  adapter is a singleton. It therefore stays exactly as it is — one lazy bootstrap for the
  whole pool, not one per connection.
- `getKpis`' four `CREATE OR REPLACE TEMP TABLE`s are **deleted** (proposal item 3). This
  is the precondition that makes a pool safe, which is why the pool and the temp-table
  removal must land in the same change: leaving them in and adding a pool would turn a
  currency-mixing race into a nondeterministic one. With them gone, **no connection-scoped
  session state remains**, and `prepareConnection(conn)` exists as an explicitly empty,
  single declared home for any that is ever added.

### D8 — Rule 6: the tax FIFO ordering is relocated, never edited

`v_fifo_matches` keeps `PARTITION BY asset_id ORDER BY timestamp, tx_id` **verbatim** —
the definition SQL moves from an inline `CREATE OR REPLACE VIEW` into `v_<name>__def` as
an unchanged block of text, and the implementation task is a pure relocation whose diff is
reviewed as such. Nothing here partitions the tax queue by account.

Custody stays separate and stays views: `v_custody_*` / `v_lot_*` are not materialized, and
the new deterministic `ORDER BY` for `portfolioLocations` (proposal item 6) is applied in
the **presentation** query in the adapter that builds the holdings snapshot — it never
enters a FIFO relation and cannot reorder the tax queue. The synthetic
`ownwallet-<ASSET>` counterparty semantics are untouched; a wallet-to-wallet transfer
still generates no disposal.

One consequence of materializing that must be handled: **a table is an unordered heap**,
whereas a view could incidentally emit rows in a convenient order. Every consumer that
depends on order must carry its own `ORDER BY`. The measured equivalence run found exactly
one such consumer (`portfolioLocations`); the implementation audits the rest, and the
order-sensitive equivalence test (D9) is what catches any that were missed.

### D9 — Test strategy, with a stated way for each test to fail

*Equivalence (materialized == computed).* Parameterized over the six relations: run
`v_<name>__def` and `m_<name>`, order both by the relation's key, render every decimal
column as `CAST(col AS VARCHAR)` (string equality, so no float comparison sneaks in), and
compare full result sets. **Non-vacuity:** the test first asserts a per-relation row count
against pinned expected minimums from the real fixture ledger — an empty relation fails
loudly instead of trivially matching an empty relation. **Confirmed break:** change one
`CAST(... AS DECIMAL(38,18))` to `DECIMAL(38,8)` in one definition and confirm *that
relation's* assertion goes red for a rounding difference — verifying the break actually
reached the relation under test, not a neighbouring line.

*Type preservation.* Per relation, `DESCRIBE m_<name>` against a pinned column→type map,
asserted to contain at least one `DECIMAL` column for every money-bearing relation.
**Break:** force `CAST(x AS DOUBLE)` in one definition; confirm both the test and the
in-rebuild assertion (D3) go red.

*Coalescence — deterministic, not timing-based.* Inject an `IDerivedChainPort` double whose
`rebuild()` returns a deferred the test controls. Fire nine `ensureFresh()` calls, assert
`rebuild` was invoked **exactly once** while the deferred is still pending, resolve it,
assert all nine resolve with the same `buildId`. Then assert a *subsequent* call after
settlement does start a new rebuild (no permanent memo), and that a **rejected** rebuild
rejects all nine and leaves the next call able to retry. **Break:** delete the `inFlight`
memo and confirm the "exactly once" assertion goes red.

*Isolation under concurrency (real DuckDB).* Seed the ledger, rebuild, snapshot a
distinguishing query; insert a new transaction; start a rebuild on connection A and, before
`COMMIT`, run the query on connection B — assert the **old** values; after `COMMIT`, assert
the **new** ones. This is the test that decides D2 empirically.

*Currency race.* The behavioural version (concurrent EUR and USD `getKpis`, each response
internally single-currency) is timing-sensitive. It is paired with a **structural**
assertion that cannot flake: a spying analytical port asserts `getKpis` emits **no**
`CREATE ... TEMP TABLE` statement at all. **Break:** reintroduce one pinned temp table and
confirm the structural assertion goes red.

*Ordering.* `getHoldingsSnapshot()` called twice over the same materialized state must
return `portfolioLocations` in an identical order — the measured `stable across two calls:
false` becomes the failing test written first.

### D10 — Frontend

`staleTime` is set explicitly on every `useQuery` in `useCryptoMetricsQueries.ts` and
`usePortfolioQueries.ts` (60 s), with mutations that dirty the ledger (ingest, overrides)
invalidating those keys — so freshness comes from explicit invalidation, not from a 5 s
default silently re-firing the nine-request fan-out on every navigation. The display
currency joins the query key as its own segment for `crypto-metrics-kpis`,
`portfolio-summary`, `crypto-asset-allocation` and `crypto-risk-metrics`; omitting it is a
cache bug today (switching currency serves the previous currency's cached payload).

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| Every first read after an import pays ~400 ms. | Accepted by the user; single-flight means the dashboard's nine requests pay it **once**, not nine times. |
| A persistently failing rebuild makes *every* request pay 400 ms and then fail. | Typed failure surfaced to the caller; the flag stays dirty (never serve stale); consecutive-failure backoff so requests are not each queueing a rebuild. |
| `CREATE OR REPLACE TABLE` isolation may not behave as D2 assumes. | Decided by the D9 isolation test, not by assumption; documented fallback is `_next` + rename inside the same transaction. |
| CTAS silently widens a `DECIMAL` to `DOUBLE`. | Pre-`COMMIT` `DESCRIBE` assertion (D3) aborts the rebuild; plus a pinned type test. |
| A consumer silently relied on a view's incidental row order. | Materialized tables are heaps by contract; consumer audit plus order-sensitive equivalence comparison. |
| Deleting the dual-source hedge removes a safety net. | The net is replaced by a stronger upstream guarantee (synchronous rebuild before any read); the non-derived-lot branch is preserved as a *declared* source, after counting it in the real ledger. |
| Pool size × DuckDB threads oversubscribes CPU. | `DUCKDB_POOL_SIZE` and `DUCKDB_THREADS` tuned together; default pool 4. |
| The analytical `.duckdb` file grows by the materialized chain. | Trivially small at measured scale (9.187-row valuation); fully re-derivable, safe to delete. |
| The tax FIFO ordering is edited while relocating it. | Relocation is a verbatim text move, reviewed as such; the byte-identical fiscal report and 544 KB `lots+events` equivalence is the standing regression check. |

## Migration Plan

No data migration: DuckDB holds nothing SQLite does not already hold. On startup,
`initialize()` drops any pre-existing `m_*` tables and creates the `__def` + public views;
the chain is then in state `{ kind: 'stale', reason: 'never-built' }`, and the first read
builds it. Deleting the analytical `.duckdb` file at any time remains a valid recovery,
and no business logic may depend on `m_*` surviving a restart.

Ordering constraint: the temp-table removal (proposal item 3) and the pool (item 5) **must
land together** — a pool with the temp tables still present converts a latent currency race
into an active nondeterministic one.

Rollback: revert the code and delete the analytical database file. There is no persisted
state to unwind and no API surface change to coordinate with the frontend.

## Open Questions

None blocking implementation. Three items are deliberately deferred to measurement inside
the implementation tasks rather than guessed here:

1. Row count of `ledger.tax_lots WHERE spot_transaction_id IS NULL` in the real ledger —
   determines whether `v_external_tax_lots` covers live rows or is purely defensive (D5).
2. Empirical confirmation of `CREATE OR REPLACE TABLE` snapshot isolation across
   connections, which selects between D2's primary shape and its documented fallback.
3. Empirical confirmation that the instance-level `ATTACH` is visible to a
   newly-created pooled connection; if not, it moves into `prepareConnection()` (D7).

---

Ready for `/opsx:tasks` once specs are also done.
