## ADDED Requirements

### Requirement: The Six Derived FIFO Relations Are Physical Tables

The analytical engine SHALL store the six derived FIFO relations — `flattened_fifo_events`, `fifo_matches`, `calculated_tax_lots`, `calculated_lot_history_events`, `daily_running_balances`, `portfolio_daily_valuation` — as physical DuckDB tables rather than recomputing them per query. Each relation SHALL be declared as three catalogue objects: a definition view `v_<name>__def` holding the computation, a table `m_<name>` produced by `CREATE OR REPLACE TABLE m_<name> AS SELECT * FROM v_<name>__def`, and a public view `v_<name>` selecting from `m_<name>`. Every `v_<name>__def` SHALL reference the *public* name of its upstream relations, so a rebuild step consumes the table produced by the previous step.

#### Scenario: Consumers keep their existing relation names

- **WHEN** any adapter or query references `v_flattened_fifo_events`, `v_fifo_matches`, `v_calculated_tax_lots`, `v_calculated_lot_history_events`, `v_daily_running_balances` or `v_portfolio_daily_valuation`
- **THEN** the reference MUST resolve without modification
- **AND** the resolved object MUST be a view selecting from the corresponding `m_<name>` table

#### Scenario: Materialised output equals the computed definition

- **WHEN** `SELECT * FROM v_<name>__def` and `SELECT * FROM m_<name>` are both executed over the same committed ledger state, each ordered by the relation's key and with every decimal column rendered as `CAST(col AS VARCHAR)`
- **THEN** the two result sets MUST be identical row-for-row and value-for-value
- **AND** the comparison MUST first assert a non-zero row count per relation, so an empty relation fails rather than trivially matching

#### Scenario: The chain is rebuilt in dependency order

- **WHEN** a rebuild executes
- **THEN** the relations MUST be rebuilt in the order `flattened_fifo_events → fifo_matches → calculated_tax_lots → calculated_lot_history_events → daily_running_balances → portfolio_daily_valuation`
- **AND** each definition MUST read the materialised output of its upstream relation, so the chain executes once rather than once per level

### Requirement: The Rebuild Is a Single Transaction

The rebuild SHALL execute all six `CREATE OR REPLACE TABLE` statements plus the build-stamp write inside one explicit transaction on a single connection. A reader on another connection SHALL observe either the complete previous chain or the complete new chain, never a mixture. A failure at any step SHALL roll the whole transaction back and leave the previous chain intact and queryable.

#### Scenario: A concurrent reader sees the previous chain until COMMIT

- **WHEN** a rebuild has begun on connection A after a new transaction was inserted into the ledger, and a distinguishing query runs on connection B before `COMMIT`
- **THEN** connection B MUST return the pre-rebuild values
- **AND** the same query issued after `COMMIT` MUST return the post-rebuild values

#### Scenario: A failed rebuild leaves the previous chain queryable

- **WHEN** a rebuild statement raises an error partway through the chain
- **THEN** the transaction MUST roll back
- **AND** every `m_<name>` table MUST retain its pre-rebuild contents
- **AND** the pending-work flag MUST remain `'true'`

### Requirement: Decimal Typing Is Asserted Before Commit

The rebuild SHALL NOT hand-write a second column DDL; column types SHALL come from the `CAST`s in the definition SQL. Before `COMMIT`, the rebuild SHALL compare `DESCRIBE m_<name>` against `DESCRIBE v_<name>__def` column by column and SHALL abort the transaction on any type mismatch, and on any `DOUBLE`, `FLOAT` or `REAL` appearing in a column the definition declared `DECIMAL`. This assertion is a rebuild invariant, not only a test.

#### Scenario: A degraded money column aborts the rebuild

- **WHEN** a definition's monetary column materialises as `DOUBLE`, `FLOAT` or `REAL` instead of the declared `DECIMAL`
- **THEN** the rebuild MUST throw before `COMMIT`
- **AND** the transaction MUST roll back with the previous chain intact

#### Scenario: Every money-bearing relation retains a DECIMAL column

- **WHEN** `DESCRIBE m_<name>` is run for each money-bearing relation after a successful rebuild
- **THEN** the reported column types MUST match the pinned column→type map
- **AND** at least one column MUST be `DECIMAL`

#### Scenario: No new money boundary is introduced

- **WHEN** the materialisation code is inspected
- **THEN** decimal columns MUST continue to be read out of DuckDB as `VARCHAR` and reach the backend domain as `PreciseAmount`
- **AND** no `Decimal.js` or numeric-float conversion MUST be added to `core/domain`

### Requirement: Freshness Is a Discriminated Union

The derived chain's freshness SHALL be modelled in `core/domain/models/` as a discriminated union over `fresh`, `stale` and `rebuilding`, never as a boolean with an optional timestamp. The `stale` variant SHALL distinguish `never-built` from `ledger-mutated`. The domain model SHALL import nothing external — no Zod, no arithmetic library.

#### Scenario: Meaningless freshness states are unrepresentable

- **WHEN** the freshness type is inspected
- **THEN** it MUST be a union discriminated on `kind`
- **AND** a build id and build timestamp MUST be reachable only through the `fresh` variant
- **AND** "fresh without a build id" and "stale with a build id" MUST NOT typecheck

#### Scenario: A never-built chain is distinguishable from a mutated one

- **WHEN** the analytical database has just been created and no rebuild has run
- **THEN** the state MUST be `{ kind: 'stale', reason: 'never-built' }`
- **AND** after a successful rebuild followed by a ledger mutation, the state MUST be `{ kind: 'stale', reason: 'ledger-mutated' }`

### Requirement: Synchronous Rebuild Before Any Read of the Derived Chain, Coalesced Single-Flight

A read use case consuming the derived chain SHALL await `FifoChainFreshnessService.ensureFresh()` before its first analytical port read. When `needs_recalculation` is `'true'`, `ensureFresh()` SHALL rebuild the chain synchronously and resolve only after the rebuild commits; stale data SHALL NEVER be served. `ensureFresh()` SHALL return only the `fresh` variant. The service SHALL coalesce concurrent callers onto one in-flight rebuild, SHALL be a singleton in the composition root, and SHALL clear its in-flight memo in a `finally` so a rejected rebuild rejects all waiters and leaves no poisoned promise.

#### Scenario: Nine concurrent readers trigger exactly one rebuild

- **WHEN** the flag is `'true'` and nine callers invoke `ensureFresh()` while the rebuild is still pending
- **THEN** the underlying `rebuild()` MUST have been invoked exactly once
- **AND** all nine calls MUST resolve with the same build id once the rebuild settles

#### Scenario: Coalescence is not a permanent memo

- **WHEN** a rebuild has settled and the flag becomes `'true'` again
- **THEN** the next `ensureFresh()` MUST start a new rebuild

#### Scenario: A failed rebuild rejects every waiter and stays retryable

- **WHEN** the in-flight rebuild rejects
- **THEN** all pending `ensureFresh()` callers MUST reject with a typed failure
- **AND** `needs_recalculation` MUST remain `'true'`
- **AND** a subsequent call MUST be able to start a fresh rebuild, subject to the consecutive-failure backoff

#### Scenario: A fresh chain is not rebuilt

- **WHEN** the flag is `'false'` and a read use case calls `ensureFresh()`
- **THEN** no rebuild MUST be invoked
- **AND** the call MUST resolve with the current build id

#### Scenario: Every derived-chain read use case awaits freshness

- **WHEN** the use cases resolving from the analytical metrics port and the tax ports are enumerated
- **THEN** each MUST await `ensureFresh()` before its first port read
- **AND** the guarantee MUST hold when the use case is invoked outside HTTP

#### Scenario: Ingestion and on-read rebuilds cannot run concurrently

- **WHEN** an ingestion-triggered rebuild is in flight and a read request finds the chain stale
- **THEN** both MUST resolve through the same singleton service instance
- **AND** exactly one DuckDB rebuild transaction MUST be open at a time

### Requirement: Layering of the Derived-Chain Port

The freshness policy SHALL live in the application layer and the DuckDB SQL in an adapter. `IDerivedChainPort` SHALL be declared in `core/domain/ports/` exposing `rebuild()` and `describe()`, and SHALL be implemented by a `DuckDbDerivedChainAdapter` under `core/infrastructure/adapters/`. The `packages/database` layer SHALL gain no knowledge of what the pending-work flag means.

#### Scenario: The database package holds no freshness policy

- **WHEN** `packages/database` is inspected
- **THEN** it MUST contain no reference to `needs_recalculation` semantics and no rebuild-triggering decision
- **AND** the freshness service MUST reach DuckDB only through `IDerivedChainPort`

#### Scenario: The port is a domain interface

- **WHEN** `IDerivedChainPort` is inspected
- **THEN** it MUST be an interface under `core/domain/ports/` importing nothing external
- **AND** its only implementation MUST be named `DuckDbDerivedChainAdapter`

### Requirement: The Materialised Chain Is Fully Re-Derivable

The `m_*` tables SHALL hold nothing SQLite does not already hold. No business logic SHALL depend on them surviving a restart or persisting between rebuilds. Startup SHALL drop any pre-existing `m_*` tables and recreate the `__def` and public views, leaving the chain in `{ kind: 'stale', reason: 'never-built' }`.

#### Scenario: Deleting the analytical database is a valid recovery

- **WHEN** the analytical `.duckdb` file is deleted and the backend restarts
- **THEN** initialisation MUST succeed
- **AND** the first read MUST rebuild the chain and return the same values as before the deletion

#### Scenario: A rebuild from empty equals an incremental rebuild

- **WHEN** all `m_*` tables are dropped and the chain is rebuilt over an unchanged ledger
- **THEN** the resulting tables MUST be identical to those produced by a rebuild over the same ledger without dropping them

### Requirement: Materialised Tables Are Unordered Heaps

A materialised relation SHALL be treated as an unordered heap. Any consumer whose output depends on row order SHALL carry its own explicit `ORDER BY` rather than relying on a relation's incidental emission order.

#### Scenario: Order-dependent consumers are identified and made explicit

- **WHEN** consumers of the six derived relations are audited
- **THEN** every consumer whose response order is observable MUST carry an explicit `ORDER BY`
- **AND** the order-sensitive equivalence comparison MUST pass for all six relations
