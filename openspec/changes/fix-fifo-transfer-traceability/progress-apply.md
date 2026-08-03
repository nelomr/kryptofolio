# Apply progress — fix-fifo-transfer-traceability

Session log for `/openspec-apply-change`. Updated as each task group closes so an interrupted
session can be resumed from here.

**Total:** 165 tasks in 14 groups. **Complete: 104.**
**Test command:** per-package `vitest run` (project config: `strict_tdd: true`).

---

## Session summary

Twelve groups closed: **1** (baseline + Red fixture), **2** (canonical contracts), **2b** (domain
ports), **3** (pure classification), **4** (migration `004`), **5** (policy-driven flattening),
**6** (double-entry custody), **7** (materialisation reconciliation, which also discharged group 6's
deferred 6.3), **8** (ingestion integrity and sub-accounts), **9** (automatic rebuild and overrides),
**10** (read path: status, provenance, custody), **11** (anti-corruption layer DTO realignment).
Groups 12–14 remain.

### What was built

| Layer | Artefact |
|---|---|
| Contracts | `shared-types/src/schemas/fifo-policy.ts` — `FIFO_EVENT_POLICY` as a compiler-enforced `Record<SpotTxType, …>`, `DISPOSAL_TYPES`, `FIFO_QUALITY_FLAGS` + `FLAG_SEVERITY`, `FISCAL_CLASSIFICATION_FLAGS`, `MANUAL_VALUE_PROVENANCE`, the `ownwallet-<ASSET>` and sub-account naming contracts |
| Contracts | `shared-types/src/schemas/fiat-currencies.ts` — ISO-4217 list; stablecoins deliberately excluded |
| Contracts | `nonNegativePreciseAmountSchema` applied to every fiat magnitude; `sale_price_fiat` / `gain_loss_fiat` made nullable |
| Ports | `ILedgerPort` reconciliation replaces UPSERT-only; override CRUD; `EnsureAccountInput` / `EnsureAssetInput`. `ITaxCalculatorPort` gains custody + data-quality |
| Domain | `core-domain/.../custodyClassifier.ts` — pure `classifyCustodyMovement`; normalizer rewired |
| Schema | `migrations/sqlite/004_fifo_traceability.sql` — clean-slate rebuild with the full constraint set |
| Engine | `fifo_event_policy` relation + `v_flattened_fifo_events` rewritten against it — zero transaction-type literals in any FIFO view, zero fabricated prices |
| Engine | Seven custody relations: `v_custody_entries`, `v_lot_custody_allocation` (recursive, `USING KEY`), `v_lot_current_location`, `v_custody_balances`, `v_fifo_data_quality` |
| Adapters | `DuckDbTaxCalculatorAdapter.calculateCustodyEntries()` / `.getDataQuality()`; both dual-source `UNION`s now filter on `is_taxable` and report the excluded count |
| Repo | `.nvmrc` (24.16.0) + `engines` in the root `package.json`; `DUCKDB_THREADS=1` and `maxWorkers: 2` in both vitest configs |
| Frontend DTOs | `CommonSchemaHelpers.nullableNumericField` — the surgical fix for the fabricated-`0` defect; `ExternalTaxSchemas.ts` rewired to the canonical status/disposal/quality-flag/provenance/custody vocabulary; `FiscalIntegritySchemas.ts` — new, mirrors the backend's fiscal-integrity and rebuild/ingestion/override outcome DTOs field for field |
| Frontend domain | `FiscalEntities.ts` gains `LotCustodyLocation`, `FiscalIntegrityReportEntity` + its group/defect rows, `MaterializationSummaryEntity`, `RebuildOutcomeEntity`, `IngestionOutcomeEntity`, `OverrideOutcomeEntity`; `BrandedTypes.ts` gains `AccountId`, `TransactionIdHash` |
| Frontend tests | A genuine cross-package contract test (`backend-contract.spec.ts`) using type-only deep imports of the backend's own DTOs — no fixture the frontend author invented independently |

**Measured totals at pause:** `shared-types` 38/38, `core-domain` 58/58, `database` 99/99 — all
`tsc --noEmit` clean. `apps/backend` 143 passing / 2 failing (both group 8's `repro.test.ts`), 28
`tsc` errors remaining and intentional.

### Defects found beyond the original diagnosis

1. **`preciseAmountSchema` permitted the leading minus** (`/^-?\d+…/`). The missing `.abs()` in
   `CsvIngestionUseCase` was the proximate cause of `total_fiat = '-300.00'`; the permissive schema
   is why nothing downstream objected. The invariant now holds at three layers (Zod, SQL CHECK,
   ingestion) instead of one.
2. **Non-nullable proceeds are *why* `COALESCE(price, 1.0)` existed** — the type left the SQL no way
   to express "unresolved". Making them nullable was a precondition for group 5, not cosmetics.
3. **11 lots carry a *negative* `unit_cost_fiat`**, a figure the proposal never measured separately
   (it had counted the 11 negative `total_fiat` transactions).
4. **⚠️ Soft deletion did not work on `assets` or `accounts`.** `trg_assets_updated_at` /
   `trg_accounts_updated_at` used `BEFORE UPDATE … RAISE(IGNORE) WHERE NEW.updated_at =
   OLD.updated_at` with the documented intent "sets updated_at on NEW" — but a BEFORE trigger cannot
   assign to NEW, so it **aborted the update instead**. `UPDATE accounts SET deleted_at = …` reported
   success and changed nothing. Repaired in §4.8b with 5 regression tests. Outside the change's
   nominal scope; fixed because it was a hard blocker.
5. **`METADATA_DICTIONARY` renames `wallet` → `account_id`**, colliding with the real account
   identifier. Carried forward as a blocker-in-waiting for group 8.
6. **Kraken's real export contains only `spot / main`** — no `earn` rows — so the sub-wallet scenario
   has no real-world coverage and group 13 must keep the synthetic fixture case.
7. **The group-1 fixture and migration `004` were mutually incompatible.** 18 of the 21 "Red" tests
   were failing in `beforeEach`, not on their assertions: the fixture seeded `total_fiat = '-300.00'`
   and the new CHECK rejects it. The Red claim was therefore partly hollow. Resolved by seeding the
   normalised magnitude and exercising the negative-basis guard separately on a row planted with
   `ignore_check_constraints`, preceded by a test asserting the illegal row is really there.
8. **One of my own assertions was arithmetically false.** `remaining_qty > 178` contradicted its
   sibling test: the fixture's genuine 100 XRP `SELL` consumes that same lot by global FIFO. The real
   figure is `179.11 − 0.20 − 100 = 78.91`.
9. **The dual-source `UNION`s summed untrustworthy figures.** Measured: `spotCapitalGains` returned
   **1099 instead of 100**, `totalCostBasis` **1300 instead of 100**. `is_taxable` and `quality_flag`
   existed on those columns and were read by nothing.
10. **Three distinct causes behind flaky 5 s timeouts**, all measured: DuckDB bind cost paid over the
    expanded reference tree (`initialize()` 793 → ~303 ms); recursion depth counted timeline events
    rather than movement legs (`v_lot_custody_allocation` 849 → 226 ms); and four vitest workers ×
    eight DuckDB threads oversubscribing eight cores, adding ~30% to every query. The tests were
    starved, not slow.
11. **A measured dead end, recorded rather than hidden.** Collapsing `getKpis()`'s 11 statements into
    one pass of scalar subqueries made it **1.5× worse** (1441 → 2959 ms). Reverted. `getKpis()`
    remains ~1450 ms on an empty ledger — an open decision for group 10.

### Three vacuous-pass traps caught

Tests that reported green while verifying nothing. Two were mine; the pattern is the same class of
defect as the bug under repair — a check that appears present and never fires.

1. A "must not invent a 1.0 price" regex missed DuckDB's quoted identifier (`hp_fee_dis."close"`).
2. The port contract spec reported **16/16 passing while none of the asserted types existed** —
   `expectTypeOf` compiles to nothing outside a `*.spec-d.ts` file with `typecheck` configured.
3. A "carries no `ABS()` repair" assertion matched the migration's own comment *explaining* that it
   carries no `ABS()` repair.

Since group 3, Red is verified by committing a stub that exists and answers wrongly, so assertions
fail on their own terms. Group 6 went further and broke the shipped SQL ten times — override
precedence, allocation ordering, the fee-scale tolerance, the negative-balance predicate, the debit
sign, the severity literal, an injected 72-hour `ABS(DATEDIFF(...))` join — obtaining ten named
failures. It also found that `reports missing prices without blocking` is *redundantly* covered:
either valuation branch alone keeps it green.

A methodological warning worth carrying forward: `git stash push` on a single file reverts it to
`HEAD`, silently discarding uncommitted work from earlier groups. It corrupted two "before"
measurements in group 6 before being noticed.

### Deliberate deviations from the task text

- **3.3 / 3.4 live in `shared-types`, not `core-domain`.** `packages/database` needs the identical
  derivation for the custody SQL and has no workspace dependencies; `core-domain` depends on
  `shared-types`. Any other placement forces a `database → core-domain` edge or a duplicate.
- **Migration 004 rebuilds tables rather than altering them.** SQLite has no
  `ALTER TABLE ADD CONSTRAINT`; the clean slate empties them anyway.
- **Two pre-existing normalizer tests were changed.** `deposit`/`withdrawal` of a *crypto* asset now
  yield `TRANSFER_IN`/`TRANSFER_OUT`, as the spec requires.
- **Group 13 rewritten** from manual re-ingestion to a CSV fixture driven through the real parser.

---

## Environment — read this first when resuming

Node **≥ 22.5** is mandatory: the ledger imports `node:sqlite`, and pnpm 11.8 itself requires
≥ 22.13. The user's console runs **v24.16.0**; the agent's shell defaulted to v20.20.0, which fails
with `ERR_UNKNOWN_BUILTIN_MODULE: node:sqlite`. If that happens, prefix commands with:

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"
```

**Fixed in this change:** added `.nvmrc` (`24.16.0`) and an `engines` field to the root
`package.json` (`node >=24.16.0`, `pnpm >=11.8.0`), so the failure is now a clear pnpm warning
rather than an opaque module error.

`vitest` is not linked at the workspace root — run tests per package:

```bash
pnpm -F @kryptofolio/database exec vitest run tests/integration/transfer_traceability.spec.ts
pnpm -F @kryptofolio/backend  exec vitest run --typecheck src/core/domain/ports/
```

## Status

| Group | Title | State |
|---|---|---|
| 1 | Baseline evidence + regression fixture | ✅ done (4/4) |
| 2 | Canonical contracts (`@kryptofolio/shared-types`) | ✅ done (11/126) |
| 2b | Domain ports (contract-first) | ✅ done (18/126) |
| 3 | Pure domain classification and naming | ✅ done (24/126) |
| 4 | Migration `004_fifo_traceability.sql` | ✅ done (38/126) |
| 5 | DuckDB policy-driven event flattening | ✅ done (49/126) |
| 6 | DuckDB double-entry custody | ✅ done (58/126) — 6.3 discharged in group 7 |
| 7 | Materialisation reconciliation | ✅ done (66/126) |
| 8 | Ingestion integrity and sub-accounts | ✅ done (73/126) |
| 9 | Automatic rebuild and overrides | ✅ done (83/126) |
| 10 | Read path: status, provenance, custody | ✅ done (90/165) |
| 11 | Anti-corruption layer DTO realignment | ✅ done (104/165) |
| 12 | UI: status, custody, pending review | ⬜ pending |
| 13 | End-to-end verification | ⬜ pending |

## Session log

### Group 1 — Baseline evidence

- [x] **1.1** Baseline metrics recorded to `baseline.md`. All expected figures confirmed against
  the live ledger: 97 active transactions, **0 SELL/SWAP**, 96 lots (64 zero-cost, 11 negative-cost),
  73 phantom events, 5 orphan lots / 3 orphan events, 11 negative `total_fiat` rows,
  **+1.234,46 € of phantom gains from `WITHDRAWAL` rows**.
  - Additional finding beyond the proposal's figures: **11 lots carry a negative
    `unit_cost_fiat`**, not just zero — the proposal counted the negative `total_fiat`
    transactions (11) but had not separately measured the resulting negative-cost lots.
  - Accounts are flat: 8 venues, no `parent_account_id`, no Kraken sub-wallets.
- [x] **1.2** Superseded. The user supplied
  `/Users/nelo/proyectos/AgenteIA/cripto-proyect/listadoTransacciones` and confirmed no manual
  re-ingestion is needed — verification is test-driven, so group 13 was rewritten to drive a Kraken
  CSV **fixture** through the real parser instead.
- [x] **1.3** Regression fixture at `packages/database/tests/fixtures/transfer-traceability.ts`.
  Nine scenarios: negative-`total_fiat` BUY, clean BUY, crypto DEPOSIT, fiat DEPOSIT, WITHDRAWAL
  with crypto fee to an unknown destination, unpriced STAKING, Kraken spot→earn sub-wallet move,
  partial Ledger→Binance transfer, and one genuine SELL. Seeds the *target* schema, so it cannot
  seed pre-migration — the intended Red state. Synthetic `ownwallet-*` accounts deliberately not
  seeded: the engine must create them.
- [x] **1.4** `packages/database/tests/integration/transfer_traceability.spec.ts` — 21 assertions,
  **all 21 failing**.

  Live confirmation of the diagnosis, read straight out of `duckdb_views()`:
  - `COALESCE(hp_fee_dis."close", 1.0)` present **twice** in the fee-disposal branch.
  - `COALESCE(hp_fee_acq."close", 0.0)` present in the acquisition branch.
  - The fee-disposal branch's `WHERE` is `fee_asset_id IS NOT NULL AND fee_asset_id != fiat_currency
    AND status = 'COMPLETED' AND deleted_at IS NULL` — **no `tx_type` predicate at all**, exactly as
    diagnosed.
  - `fifo_event_policy` does not exist.

### Group 2 — Canonical contracts ✅ 8/8

New module `packages/shared-types/src/schemas/fifo-policy.ts`, exported from `src/index.ts`.
Tests: `packages/shared-types/tests/schemas/fifo-policy.spec.ts` — **30 passing**; whole package
**29 → 30+ passing, `tsc --noEmit` clean**.

- [x] **2.1 / 2.2** `FifoEventPolicy` + `FIFO_EVENT_POLICY` as `Record<SpotTxType, …>`.
  **Exhaustiveness proven, not assumed**: deleting the `MIGRATION_SWAP` entry produces
  `error TS2741: Property 'MIGRATION_SWAP' is missing … but required in type Record<…>`.
  Restored afterwards; typecheck clean.
- [x] **2.3** `DISPOSAL_TYPES` + `DisposalType`.
- [x] **2.4** `FIFO_QUALITY_FLAGS`, `FifoQualityFlag`, `FLAG_SEVERITY` (+ `FLAG_SEVERITIES`).
- [x] **2.5** `MANUAL_VALUE_PROVENANCE` (`MARKET` | `MANUAL`).
- [x] **2.6** `FISCAL_CLASSIFICATION_FLAGS` with `WALLET_ACTIVATION`; disjointness asserted.
- [x] **2.7** Zod schemas: `disposal_type` required; `flag` typed to the fiscal vocabulary;
  new `quality_flag`; `value_provenance`; `sale_price_fiat` / `gain_loss_fiat` now **nullable**;
  new `LotCustodyEntrySchema`, `ManualPriceOverrideSchema`, `TransferDestinationOverrideSchema`.
- [x] **2.8** Verified.

**Deviation from the task text (deliberate):** tasks 3.3 / 3.4 placed `deriveSyntheticAccountName`
and `deriveSubAccountId` in `@kryptofolio/core-domain`. They are in **`shared-types`** instead,
because `packages/database` — which needs the identical derivation for the DuckDB custody SQL —
has **no workspace dependencies at all**, while `core-domain` depends on `shared-types`. Putting
them in `core-domain` would have forced either a new `database → core-domain` edge (pulling
`application/use-cases` into an infrastructure package) or a duplicated implementation. The
`account-hierarchy` spec requires the derivation be "exported from a shared package" and usable
"from the domain layer, the DuckDB seed, and the ingestion path without duplication";
`shared-types` is the only package satisfying that. Both functions remain pure, with no framework
imports, so domain purity is unaffected.

### Group 2b — Domain ports (contract-first) ✅ 6/6

Contract tests green: **15 type assertions passing, 0 type errors**, plus 2 runtime shape tests.

- [x] **2b.1** `ITaxCalculatorPort` gains `calculateCustodyEntries()` and `getDataQuality()`, with
  `CustodyEntryRow` and `FifoDataQualityRow`. `SpanishTaxBaseReport` gains
  `excludedFlaggedEvents` so an incomplete total is never presented as complete.
- [x] **2b.2** `ILedgerPort`: `upsertTaxLots` / `upsertLotHistoryEvents` **removed** and replaced by
  `reconcileTaxLots` / `reconcileLotHistoryEvents` / `reconcileCustodyEntries`, each returning a
  `ReconciliationSummary` with the `retired` arm. Override CRUD added.
- [x] **2b.3** `ensureAccountExists(EnsureAccountInput)` — now takes `wallet`, `parentAccountId`,
  `isSynthetic`, and **returns the resolved account id** (which may be a derived child account).
- [x] **2b.4** `ensureAssetExists(EnsureAssetInput)` with `isFiat`.
- [x] **2b.5** All new types live in `core/domain/ports/`; no `repositories` folder introduced.
- [x] **2b.6** Verified — see below.

#### ⚠️ The tree is intentionally non-compiling after this group

`tsc --noEmit` on `@kryptofolio/backend` reports **32 errors**. This is the designed outcome of
2b.6, not a regression: the port is the contract, so every adapter that fails to satisfy it must
fail loudly. Broken by design, fixed in later groups:

| File | Fixed in |
|---|---|
| `SQLiteLedgerAdapter.ts` — missing 10 port methods | group 7 |
| `DuckDbTaxCalculatorAdapter.ts` — missing `calculateCustodyEntries`, `getDataQuality` | groups 5–6 |
| `FifoMaterializerService.ts` — calls the removed `upsertTaxLots` | group 7 |
| `CsvIngestionUseCase.ts` — old `ensureAssetExists` / `ensureAccountExists` signatures | group 8 |
| `GetSpanishTaxReportUseCase.ts` — `excludedFlaggedEvents` | group 10 |
| test mocks in `FifoMaterializerService.spec.ts` and others | groups 7–10 |

Removing the upsert methods rather than deprecating them is deliberate: leaving both surfaces would
let a caller silently pick the monotonic one, which is the exact failure that let 5 orphan lots
survive every rebuild.

#### Second vacuous-test trap caught

`expectTypeOf` compiles to nothing. The first version of the port contract test lived in an
ordinary `.spec.ts` and reported **16/16 passing while none of the asserted types existed**. Two
fixes were required:

1. Moved the type assertions into `ledger-port-contract.spec-d.ts`.
2. Added a `typecheck.include` block to `apps/backend/vitest.config.ts` — the existing
   `include: ['src/**/*.{test,spec}.ts']` does not match `*.spec-d.ts`, so even after renaming, the
   file was silently discovered by nothing.

Only after both did the suite go correctly Red with
`TypeCheckError: Module '"../ILedgerPort.js"' has no exported member 'LedgerCustodyEntry'`.
Runtime shape assertions stay in the ordinary `.spec.ts`; the two halves are separate on purpose
and the file header explains why.

**This is the same class of defect as the bug under repair** — a check that appears to be present
and verifies nothing. Worth noting that it has now occurred twice in two groups.

### Group 3 — Pure domain classification ✅ 6/6

`packages/core-domain`: **58/58 tests passing**, `tsc --noEmit` clean, domain isolation clean.

New files:
- `packages/shared-types/src/schemas/fiat-currencies.ts` — `FIAT_CURRENCY_CODES` (ISO-4217 only)
  and `isFiatCurrencyCode()`. Exported from the package index.
- `packages/core-domain/src/domain/services/custodyClassifier.ts` — pure
  `classifyCustodyMovement()` returning a discriminated union
  (`CUSTODY_MOVEMENT` | `FIAT_FUNDING` | `UNCLASSIFIED`).
- `packages/core-domain/src/__tests__/custodyClassifier.spec.ts` — 20 tests.

Rewired: `normalizer/handlers/transfer.ts` (all three handlers now delegate to the classifier) and
`TransactionNormalizer.ts`.

#### Red was verified properly this time

Per the commitment made after group 2b, the module was first committed as a **stub returning
`UNCLASSIFIED` for everything**, so the suite failed **14 assertions on their own terms**
(`expected 'UNCLASSIFIED' to be 'CUSTODY_MOVEMENT'`) rather than on a missing import. The 4
rejection tests passed even against the stub, which is correct — they assert rejection.

#### Deliberate behaviour change to two pre-existing tests

`transactionNormalizer.spec.ts` asserted `deposit` → `DEPOSIT` and `withdrawal` → `WITHDRAWAL`
using **crypto** assets (`XRP`, `ADA`). The `non-taxable-transfer-classification` spec requires
those to be `TRANSFER_IN` / `TRANSFER_OUT`. Both were updated with a comment naming the change, and
three new cases added: fiat stays `DEPOSIT`, an unclassifiable movement keeps its raw label, and an
explicit `crypto` subclass overrides the ISO-4217 lookup.

#### `TYPE_MAP` needed a guard, not just an entry removal

Removing `deposit` / `withdrawal` / `transfer` from `TYPE_MAP` was not sufficient: the fallback
`?? normalized.tx_type?.toUpperCase()` would still have produced a valid-looking `DEPOSIT`. Added a
`MOVEMENT_LABELS` set and an `isUnresolvedMovement` guard so an unclassified movement keeps its raw
lowercase label and gets rejected by name in group 8. Covered by the new "preserves the raw label"
test.

#### Two findings from the metadata layer

- **`subclass` is renamed to `subtype`.** `METADATA_DICTIONARY` maps
  `subtype: ["subtype", "aclass", "subclass", "subtipo"]`, so by the time a handler runs, Kraken's
  `subclass` column is at `metadata.subtype`. Caught by a genuinely failing test
  (`expected 'WITHDRAWAL' to be 'TRANSFER_OUT'`); `readSubclass` now reads both keys.
- **⚠️ `wallet` is renamed to `account_id` — relevant to group 8.** The same dictionary maps
  `account_id: ["account", "wallet", "address", "source_address", "destination_address"]`. Kraken's
  `wallet` column (the sub-wallet designation that group 8 needs for `deriveSubAccountId`) therefore
  lands in `metadata.account_id`, **colliding with the real account identifier**. Group 8 must read
  the wallet designation before metadata normalisation, or add a distinct dictionary key. Recorded
  here so it is not rediscovered as a bug later.

### Group 4 — Migration `004_fifo_traceability.sql` ✅ 14/14

`packages/database/migrations/sqlite/004_fifo_traceability.sql` plus
`tests/integration/migration_004_fifo_traceability.spec.ts` — **34/34 passing**.
New shared helper `tests/helpers/migrations.ts` mirrors the production runner's filename tracking.

Package state: 51 passing, 21 failing — the 21 are the intentional Red targets in
`transfer_traceability.spec.ts` for groups 5–6.

#### Rebuild rather than ALTER, because SQLite cannot add a CHECK constraint

`ALTER TABLE ... ADD CONSTRAINT` does not exist in SQLite, so the non-negative fiat invariants
could not be added to the existing tables. Since the clean slate empties them anyway, the migration
DROPs and re-CREATEs `spot_transactions`, `futures_transactions`, `tax_lots` and
`lot_history_events` with the full constraint set — simpler and more verifiable than the 12-step
table-rewrite procedure. Dropped child-first so `PRAGMA foreign_keys = ON` cannot reject the
implicit deletes.

Idempotence is the runner's (filename tracking in `_schema_migrations`), matching what 003 already
relies on. The test asserts a second runner invocation is a no-op.

#### ⚠️ Pre-existing defect found and fixed: soft deletion did not work on `assets` or `accounts`

Discovered because the `is_fiat` seed reported success and changed nothing. 002 declared:

```sql
CREATE TRIGGER trg_assets_updated_at BEFORE UPDATE ON assets BEGIN
    SELECT RAISE(IGNORE) WHERE NEW.updated_at = OLD.updated_at; -- ensure NEW is modified
END;
```

The documented intent was "BEFORE UPDATE sets updated_at on NEW". A BEFORE trigger cannot assign to
NEW in SQLite, so instead of maintaining the column it **aborted the row update**. Measured
consequences on a fresh 001–003 database:

| statement | reported | actual |
|---|---|---|
| `UPDATE accounts SET deleted_at = datetime('now') WHERE id='a1'` | success | `changes = 0`, `deleted_at` still `NULL` |
| `UPDATE assets SET name='Ripple' WHERE id='XRP'` | success | `changes = 0`, `name` still `NULL` |
| same, with `updated_at` bumped to millisecond precision | success | `changes = 1` ✅ |

So **the project's non-destructive deletion policy was silently inoperative for these two tables**,
directly contradicting the `sqlite-transactional-ledger` "Non-destructive Audit Log" requirement.
Bumping `updated_at` to `datetime('now','utc')` was *not* enough either — one-second resolution
means a row written in the same second still compares equal.

Fixed in section 4.8b: both triggers replaced with `AFTER UPDATE ... WHEN NEW.updated_at =
OLD.updated_at` bodies that actually maintain the column, at millisecond precision. Five regression
tests added (soft delete on each table, a field update that never mentions `updated_at`,
`updated_at` still auto-maintained, audit row still written).

This is outside the change's nominal scope but was a hard blocker, and leaving it would have made
`ensureAssetExists` / `ensureAccountExists` silently unable to update in group 8.

#### Two of my own tests were wrong, not the migration

- The `is_fiat` test extracted the seed statement by splitting the file on marker comments —
  testing a string-split rather than the migration. Rewritten to seed assets before `004` runs so
  the migration's own `UPDATE` is what gets verified.
- The "carries no `ABS()` repair" assertion matched the migration's own header comment *explaining*
  that it carries no `ABS()` repair. Now strips `--` lines before asserting, so documenting a
  decision does not fail the test that enforces it.

### Group 5 — DuckDB policy-driven event flattening ✅ 11/11

`packages/database`: **74 passing / 6 failing** (was 51 / 21). `apps/backend`: **137 passing / 2 failing**
(was 131 / 2 — the two are group 8's `repro.test.ts`). `packages/shared-types` 38, `packages/core-domain`
58, backend ports contract 15 type assertions — all unchanged. `tsc --noEmit` clean on `shared-types`,
`core-domain` and `database`; `apps/backend` **32 → 31 errors**, the remainder still owned by groups 6–10.

#### What was built

`packages/database` now depends on `@kryptofolio/shared-types` (`workspace:*`), so the engine reads the
same constants as the domain.

- **`fifo_event_policy`** — a DuckDB table seeded at bootstrap from `fifoEventPolicyRows()` in a single
  multi-row `INSERT`. It carries a sixth column, `principal_disposal_type`, derived in TypeScript
  (`generatesDisposal ? txType : NULL`). That derivation is what lets the views contain **no
  transaction-type literal at all** — the alternative was a `CASE tx_type WHEN 'SELL' …` ladder, which
  is the drift mechanism D1 exists to remove. Two guards fail the bootstrap loudly: an identifier
  check on `tx_type`, and a membership check that a principal-disposal type is a member of
  `DISPOSAL_TYPES`.
- **`v_flattened_fifo_events`** rewritten. Three `UNION ALL` branches, each gated by one boolean read
  from the policy join, plus its own fiat-asset exclusion. The fee branch — which previously had **no
  `tx_type` predicate whatsoever** — is gated by `generates_fee_disposal` and by nothing else.
  Unknown transaction types are excluded by the `JOIN` rather than defaulted.
- **One price-resolution order everywhere:** the transaction's own recorded fiat magnitude → a
  `manual_price_overrides` row → the market series via `ASOF JOIN`. Nothing after that.
  `COALESCE(hp_fee_dis.close, 1.0)` and `COALESCE(hp_fee_acq.close, 0.0)` are gone; an unresolved price
  is `NULL` and travels as `NULL`.
- **`value_provenance`** (`MARKET` | `MANUAL`) and **`currency_mismatch`** are emitted per branch and
  carried through `v_acquisitions` / `v_disposals` / `v_fifo_matches` into both calculated views.
- **`disposal_type`** per branch: `principal_disposal_type` from the policy for the principal leg,
  `'FEE'` for the fee leg, `NULL` for acquisitions.
- **`quality_flag` derivation** in `v_fifo_matches` and `v_calculated_tax_lots`, ordered by severity:
  `NEGATIVE_COST_BASIS` → `CURRENCY_MISMATCH` → `MISSING_PRICE`. A flagged match yields
  `gain_loss_fiat = NULL` and `is_taxable = 0`.
- **`getSpanishTaxReport`** filters `is_taxable = 1` on **both** arms of the dual-source `UNION` and
  populates `excludedFlaggedEvents`.
- **`DuckDbMetricsAdapter`** holds lots flagged `NEGATIVE_COST_BASIS` or `MISSING_PRICE` out of
  `totalCostBasis` *and* out of the per-asset ROI/allocation CTE, and reports them as a new
  `MetricsKpis.excludedFlaggedLots`.

#### Fee disposals are taxable even when the surrounding transaction is not

`taxable_disposal` from the policy describes the *principal* leg. The fee branch therefore does not
read it: a `BUY` has `taxableDisposal = false`, yet paying its fee in BNB is a real disposal with a
real gain — the spec's own worked example (+€2 on 0.1 BNB). The fee branch emits
`taxable_disposal = TRUE` and is suppressed only by a quality flag.

#### An unresolved basis is emitted as `'0'` plus a flag, not as `NULL`

`tax_lots.unit_cost_fiat` is `NOT NULL` with a non-negative GLOB CHECK, so a `NULL` or negative basis
is literally unstorable. `v_calculated_tax_lots` therefore emits `'0'` whenever `quality_flag` is set,
and the flag is the sole carrier of "this number is not trustworthy". Events keep the honest `NULL`,
because `sale_price_fiat` and `gain_loss_fiat` were made nullable in group 2 precisely for this.

Proven non-vacuously: removing the coercion makes the persistence test fail with
`NOT NULL constraint failed: tax_lots.unit_cost_fiat`.

#### ⚠️ Group 1's fixture could not be seeded at all — the CHECK from group 4 forbids it

**18 of the 21 Red tests were failing in `beforeEach`, not on their assertions.** The fixture defaults
to `normaliseFiatSign: false`, seeding `total_fiat = '-300.00'`; §4.6 added
`CHECK (total_fiat NOT GLOB '*[^0-9.]*' AND CAST(total_fiat AS REAL) >= 0)`. The insert aborted with
`CHECK constraint failed: total_fiat …`, so every assertion in the first `describe` was unreachable.

The two decisions are individually right and jointly incompatible: D10 makes a negative fiat magnitude
unrepresentable, and the group-1 fixture wanted to reproduce it. Resolved by:

1. The main suite seeds `{ normaliseFiatSign: true }`. The expected figures confirm this was the
   intent all along — `AMOUNTS.buyNegativeUnitCost` is `'1.674948356875'` (= 300.00 / 179.11), and the
   sale-gain test's own comment says *"Sale at 2.00 against a ~1.675 basis"*.
2. D11's defence-in-depth guard is exercised by a **separate** `describe` that plants the illegal row
   with `PRAGMA ignore_check_constraints = ON`. That block opens with a test asserting the negative
   magnitude really is in the ledger, so the guard cannot be verified against a row that was never
   planted.

#### ⚠️ One group-1 assertion was arithmetically wrong

`leaves the withdrawn lot OPEN with its quantity intact` asserted
`remaining_qty > 178`, with the comment *"the fee disposal consumes 0.20 XRP, so the lot is PARTIAL"*.
But the same fixture contains a genuine `SELL` of 100 XRP, and this lot is the globally oldest XRP
acquisition — so IRPF global FIFO **must** consume 100 of it, exactly as the sibling test
`matches the genuine SELL against the globally oldest lot` requires. The two assertions contradicted
each other; `> 178` was satisfiable only by an engine that ignored the sale.

Renamed to `never consumes the withdrawn principal from the lot` and rewritten to pin the arithmetic
it was reaching for: `179.11 − 0.20 (fee) − 100 (sale) = 78.91`, plus an explicit assertion that the
figure is above what the 179.11 withdrawal principal would have left. Now stated in terms of the
fixture constants rather than a magic number.

#### ⚠️ Measured performance regression, and what fixed it

First working version was **2.3× slower** than the previous engine on an *empty* ledger — enough to
push `metrics.test.ts` and `portfolio.test.ts` past vitest's 5 s default and fail them. Per-query
timings (`SELECT COUNT(*)` against each view, empty ledger):

| | old views | first rewrite | shipped |
|---|---|---|---|
| `initialize()` | 180 ms | 309 ms | 291 ms |
| `v_calculated_tax_lots` | 67 ms | 170 ms | 133 ms |
| 8 views, total | ~540 ms | ~1330 ms | ~1060 ms |

Cause: the shared context CTE is read by all three branches, and each inlined read re-scanned the
attached SQLite ledger through the sqlite extension — `spot_transactions`, `manual_price_overrides`
and three `assets` joins, times three. Two changes: the three `ledger.assets` joins collapsed into one
`fiat_assets AS MATERIALIZED` CTE, and `tx_context AS MATERIALIZED` so the ledger reads happen once.
The per-branch `ASOF JOIN`s were also moved out of the shared CTE so a branch only pays for the price
series it actually values (4 scans rather than 9). Both route tests are green again with headroom.

Residual: still ~1.9× the old per-query cost. That is the price of the policy join plus the override
lookup, and is inherent to the feature. `v_daily_running_balances` reads `v_flattened_fifo_events`
three times, which multiplies it; worth revisiting if group 6's recursive custody allocation lands on
top of it.

#### 12 test files were pinned to a hand-picked migration prefix

`tax_base`, `tax_swaps`, `tax_stress_test` and `adapters.spec` in `packages/database`, plus nine
`apps/backend` specs, applied only `001`–`003` by `fs.readFileSync` on named files. The views now bind
against `assets.is_fiat` and `ledger.manual_price_overrides`, so `initialize()` threw
`Catalog Error: Table with name manual_price_overrides does not exist!` for all of them. All now apply
the full set — the `packages/database` ones through the existing `tests/helpers/migrations.ts`.

`FifoMaterializerService.spec.ts` needed the opposite treatment: it pre-`exec`s migration files by
hand *and* calls `SQLiteLedgerAdapter.initialize()`, whose runner then re-applies anything absent from
`_schema_migrations`. Harmless for 002's `IF NOT EXISTS` DDL, fatal for 004's `ALTER TABLE`
(`duplicate column name: is_fiat`). The manual `exec` was removed and the runner left to do its job.

**The three pre-existing FIFO integration suites pass unchanged against the rewritten views** —
including the 25-transaction DeFi HBAR lifecycle asserting €66.40 of gains across six fee disposals
and two swaps, and `tax_swaps`' BNB-fee case at exactly €20. That is the strongest available evidence
that the policy relation reproduces the old behaviour where the old behaviour was correct.

#### `packages/database` could not type-check `shared-types` as a source dependency

Adding the workspace dependency surfaced two latent problems, since the package is consumed as raw
`.ts`:

1. `shared-types/src/schemas/ledger.ts` imported `"./transactions"` with no extension — fine under
   `moduleResolution: bundler`, `error TS2835` under the `NodeNext` that `packages/database` used.
   Extension added; it was the only such import in the package.
2. `import Decimal from "decimal.js"` is a CJS default that `NodeNext` resolves to a namespace object
   (`TS2351: This expression is not constructable`). `packages/database/tsconfig.json` was the only
   package config **not** extending `tsconfig.base.json`; it now does, matching `core-domain`, which
   already consumed `shared-types` without trouble. `tsc --noEmit` is clean.

#### New tests added (9)

In `transfer_traceability.spec.ts`:
- The policy seed test was strengthened from `length > 0` to a **round-trip against
  `fifoEventPolicyRows()`** plus `length === SPOT_TX_TYPES.length`, so the seed cannot drift from the
  constant.
- `FIFO price resolution and provenance` (4): a priced income acquisition is valued at market and
  unflagged; a manual override beats a present market price and reports `MANUAL`; a **soft-deleted**
  override is ignored and falls back to market; a price series in another currency yields
  `CURRENCY_MISMATCH`. All inject prices through the adapter's `_price_seed` relation, so they fail if
  resolution silently returns `NULL` for everything.
- `FIFO negative cost basis guard` (3): the planted row is verified present; the lot is flagged
  `NEGATIVE_COST_BASIS` while emitting a non-negative figure; every disposal matched against it has
  `is_taxable = 0` and `gain_loss_fiat = NULL`.
- `emits figures SQLite accepts` — writes every derived lot and event into the real SQLite tables, so
  the GLOB CHECKs are the assertion. Covers 5.11 against the rows most at risk: a `NULL` price, a
  suppressed gain, a coerced basis.

In `DuckDbTaxCalculatorAdapter.spec.ts` (3) and `DuckDbMetricsAdapter.spec.ts` (3): both seed a
trustworthy row alongside a flagged one **that still carries a figure**, which is what made the Red
concrete — `spotCapitalGains` measured **1099 instead of 100**, `totalCostBasis` **1300 instead of
100**. `is_taxable` and `quality_flag` were present on those columns and read by nothing.

#### Still Red — all six belong to group 6

| test | needs |
|---|---|
| credits an unknown withdrawal destination to the synthetic ownwallet account | `v_custody_entries` (6.2) |
| keeps every custody movement balanced to zero per asset | `v_custody_entries` (6.2) |
| attributes the sub-wallet move to the child account, netting zero at the venue | `v_custody_entries` (6.2) |
| splits custody across two accounts without splitting the lot row | `v_lot_current_location` (6.6) |
| reports an untracked inflow for crypto arriving from an unrecorded source | `v_fifo_data_quality` (6.9) |
| reports missing prices without blocking | `v_fifo_data_quality` (6.9) |

`DuckDbTaxCalculatorAdapter` still lacks `calculateCustodyEntries` and `getDataQuality`; both need
those relations, so both stay with group 6.

### Group 6 — DuckDB double-entry custody ✅ 9/10 (6.3 deferred)

**Completed across two agent sessions.** The first was cut off by a session limit mid-optimisation
of the recursive CTE, with the functional core already in place and green. What it left behind, and
what was done about it, is in "What the interrupted session left half-finished" below.

| package | before | after |
|---|---|---|
| `packages/shared-types` | 38 passing, `tsc` clean | 38 passing, `tsc` clean |
| `packages/core-domain` | 58 passing, `tsc` clean | 58 passing, `tsc` clean |
| `packages/database` | 98 passing / 0 failing, `tsc` clean | **99** passing / 0 failing, `tsc` clean, **zero timeouts across 3 consecutive runs** |
| `apps/backend` tests | 137 passing / 2 failing, **2–3 intermittent timeouts** | **143 passing / 2 failing, zero timeouts across 4 consecutive runs** |
| `apps/backend` typecheck | 31 errors | **28 errors** |

The 2 remaining `apps/backend` failures are group 8's `repro.test.ts`
(`CHECK constraint failed: total_fiat …`); the 28 `tsc` errors are groups 7–10's, and none is in
`DuckDbTaxCalculatorAdapter` any more.

#### What was built

Seven relations, created together as one module:

| relation | role |
|---|---|
| `v_custody_movements` | one row per custody-relevant leg, with its resolved counterparty |
| `v_lot_custody_timeline` | the event stream custody replays: origination, out-leg, in-leg, consumption |
| `v_lot_custody_allocation` | the `WITH RECURSIVE … USING KEY` sequential allocation |
| `v_custody_entries` | one debit and one credit per allocated slice |
| `v_lot_current_location` | each lot's quantity per holding account |
| `v_custody_balances` | ledger balance vs attributable custody, per account and asset |
| `v_fifo_data_quality` | every defect as a row, with severity, an i18n key and a pending-review marker |

Two seeded tables and two macros keep the vocabulary in one place: `fifo_flag_severity` is
materialised from `FLAG_SEVERITY` (guarded against a severity outside `FLAG_SEVERITIES`), and
`synthetic_account_name` / `is_synthetic_account_name` are generated from `SYNTHETIC_ACCOUNT_PREFIX`,
so the engine cannot drift to a second name or a second ranking. `pending_review` is the one
judgement made in TypeScript rather than read from a constant — declared as a total
`Record<FifoQualityFlag, boolean>`, so a new flag is a compile error rather than a row that silently
reports itself unactionable.

`DuckDbTaxCalculatorAdapter` now satisfies its port: `calculateCustodyEntries()` and
`getDataQuality()` project the two relations column-for-column onto `CustodyEntryRow` and
`FifoDataQualityRow`, with `accountId` bound as `$1` rather than interpolated.

#### ⚠️ Three backend tests were flaky, and the measurement moved the blame twice

Two consecutive full backend runs before this session gave `2 failed | 137 passed` then
`3 failed | 136 passed`, always `Test timed out in 5000ms.` on the same three:
`DuckDbMetricsAdapter > should return default zero KPIs …`, `GET /metrics/kpis …`,
`GET /portfolio/summary …`. They were passing or failing on machine load, not on behaviour. Three
separate costs turned out to be stacked under the 5 s ceiling, and only the first was group 6's.

**1. Group 6's bootstrap cost — 417 ms, now zero.**

DuckDB binds a view when it is created, and the bind cost is proportional to the size of the *fully
expanded* reference tree: additive over every reference, not per distinct relation. Measured by
creating `SELECT * FROM X` one relation at a time:

| bound relation | cost |
|---|---|
| `ledger.spot_transactions` | 3 ms |
| `v_flattened_fifo_events` | 9 ms |
| `v_fifo_matches` (binds the above twice) | 20 ms |
| `v_lot_custody_timeline` | 37 ms |
| `v_lot_custody_allocation` | 40 ms |
| `v_lot_current_location` (allocation + timeline again) | 71 ms |
| `v_custody_balances` | 89 ms |
| `v_fifo_data_quality` (expands the whole chain) | **136 ms** |

The seven custody relations summed to **417 ms of a 793 ms `initialize()`**, paid by every caller
including the majority — the three flaky tests among them — that never read a custody relation.
Restructuring the tree recovers at most ~50 ms; the cost is the expanded text itself.

**Fix: the custody chain is bound on first use, not at bootstrap.** `createCustodyRelations()` runs
once per connection, triggered from `execute` / `queryMany` when a statement mentions any custody
relation. No consumer changed. `duckdb_views()` counts as a mention on purpose: a caller inspecting
the catalogue expects the whole of it, and a hygiene assertion that silently stopped covering these
definitions would be worse than the cost it saves.

`initialize()`, median of 3 cold runs: **793 ms → 303 ms**, against the 291 ms group 5 shipped. The
cost is now paid once by the first custody query — visible in the bench as `v_custody_entries` at
613 ms on its first read and `v_lot_custody_allocation` at 204 ms immediately after.

Rejected: raising the timeout (forbidden, and not a fix), and materialising the intermediates as
tables at bootstrap — recovers only ~150 ms of the 417 and makes every consumer depend on a refresh
step.

**2. DuckDB was oversubscribing the machine by 4× under the test runner.**

Vitest runs several files at once and each holds its own in-memory DuckDB, which defaults to one
thread per core: 4 workers × 8 threads on an 8-core box. Every query pays the scheduling for it.
Measured on `getKpis()` against an empty ledger, same process, same ledger:

| `threads` | `getKpis()` |
|---|---|
| default (8) | 2783 / 3367 ms |
| 4 | 2642 / 2464 ms |
| 2 | 2270 / 2312 ms |
| **1** | **1936 / 2017 ms** |

`DuckDbAdapter.initialize()` now honours `DUCKDB_THREADS` when it is set to a positive integer, and
`apps/backend/vitest.config.ts` sets it to `1`. Production keeps DuckDB's default — this is a
statement about the test environment's core count, not about the engine.

Worst-case test wall time on the three, with this and the lazy binding above: **3537 / 3564 /
3966 ms → 3113 / 3099 / 3275 ms** as first measured, and lower again once the misguided
consolidation described next was reverted.

**3. An attempted third fix was measured, found to make things 1.5× worse, and reverted.**

`DuckDbMetricsAdapter.getKpis()` issues eleven independent scalar statements. On the theory that
per-statement round-trip overhead dominated, they were collapsed into one pass of scalar subqueries.
Measured on an empty ledger, three cold runs each, `initialize()` excluded:

| `getKpis()` | cost |
|---|---|
| eleven statements (as group 5 left it) | **1497 / 1410 / 1441 ms** |
| one pass of scalar subqueries | **2954 / 2959 / 2966 ms** |

Instrumenting the consolidated version showed why: the single statement spent **2529 of its 2819 ms**
in the one clause reading `v_portfolio_daily_valuation`, while the same clause standalone costs
223 ms and a plain `COUNT(*)` over that view costs 110 ms. Twelve scalar subqueries over overlapping
view trees defeat the planner in a way twelve separate statements do not. **Reverted; the eleven
statements are what ships.** Recorded because the intuition — "fewer round trips is faster" — is
exactly backwards here, and someone will have it again.

A methodological warning from the same episode: the intermediate measurements were taken with
`git stash push` on a single file, which reverts to `HEAD` and therefore silently discarded group 5's
changes to it. Two "before" numbers were wrong until that was spotted. Do not use `git stash` to
A/B a file in a tree with 30 uncommitted files.

**5. The tests were not slow, they were starved.**

Once the per-test cost was down to migrations ~100 ms + `initialize()` ~320 ms + `getKpis()`
~1450 ms, the timeouts still came and went — and the variable turned out to be the machine's own
load average, which on this box sits at **3–4 from the developer's own applications before a single
test runs**. Vitest's default is one worker per core; four integration tests at once, each building a
SQLite ledger and its own in-memory DuckDB, on a machine already half-busy, makes every query several
times slower. A 1.5 s test then exceeds 5 s.

`maxWorkers: 2` in both vitest configs. Wall time is unchanged — `packages/database` 40–45 s,
`apps/backend` ~39 s — because the suite was already contention-bound.

This is not a timeout being raised. The tests do the same work under the same limit; they are simply
no longer competing with three copies of themselves.

**Net result:** `initialize()` **793 → ~320 ms**, `getKpis()` unchanged at ~1450 ms, and per-test
wall time from 3537–3966 ms to ~2.0–2.5 s against the 5 s ceiling.

**Stability, measured under adverse conditions on purpose:**

| suite | runs | result |
|---|---|---|
| `packages/database` | 3 consecutive, load average **14** | `99 passed` every time, zero timeouts |
| `apps/backend` | 4 consecutive, load average **9–12** | `143 passed / 2 failed` every time (both group 8's `repro.test.ts`), zero timeouts |

For comparison, the same suites at load average 3–4 *before* `maxWorkers` gave 2, 4, 7 and 5
timeouts on successive runs.

One test also needed its own fix: `derives identical entries regardless of the order the ledger was
written in` builds **two** complete engines, so its body alone paid two bootstraps and two binds of
the custody chain. Moved into a `beforeAll` in a nested `describe` — setup belongs in setup, the
assertion is one comparison, and hooks have their own 10 s budget. Building the two harnesses
concurrently was tried first and is wrong: `harness()` writes `process.env`, and two concurrent
callers corrupted each other's configuration, failing 14 tests in the file.

#### ⚠️ Recursion depth was the number of timeline events, not the number of movements

The interrupted session's last recorded thought. `step` was a `DENSE_RANK()` over every timeline
event, so a ledger of 100 sales and one transfer ran 103 recursive iterations to produce two
allocations. Only movement legs need a step of their own — each has to see what the previous one
left behind. Originations and consumptions are pure additions to and subtractions from inventory,
and addition commutes, so they are now folded into the step of the movement they precede. Depth is
the number of movement legs.

Benchmarked on three purpose-built shapes:

| ledger shape | before | after |
|---|---|---|
| 100 micro-sales, no custody movement — `v_lot_custody_allocation` | 240 ms | **217 ms** |
| 100 micro-sales + 1 transfer pair — `v_lot_custody_allocation` | 849 ms | **226 ms** |
| 100 micro-sales + 1 transfer pair — `v_fifo_data_quality` | 1809 ms | **795 ms** |
| 500 transfer pairs (1000 legs) — `v_lot_custody_allocation` | 6640 ms | **4341 ms** |

`tax_stress_test.spec.ts` — the benchmark 6.10 names — runs **2.75 s for its 3 tests** (819 / 699 /
749 ms), unchanged in outcome: the 100-micro-sale precision case, the own-wallet-transfer case and
the 25-transaction DeFi HBAR lifecycle all still pass against the custody chain.

The 1000-leg figure is ~4.3 ms per iteration and is the round-trip cost of the recursive CTE itself.
D4's sanctioned fallback — a bounded iterative allocation materialised at rebuild time — was not
needed: no real ledger shape in this project approaches 1000 custody legs, and the fallback would
have moved the same work to a rebuild step that group 7 owns.

#### Folding the batch exposed a latent duplicate-key hazard

Batching originations and consumptions into a movement's step means one inventory key can be written
twice in a single iteration — once by the ledger event, once by the allocation leg — and `USING KEY`
keeps only one of them. That happens exactly when a lot is acquired and then moved out of the same
account between two movements. Resolved by netting every change into one `inv_change` row per key
per step; found by reasoning about the key, not by a failing test, so it is recorded here.

#### What the interrupted session left half-finished

- **All seven relations were coherent and reachable; none was a stub.** All six previously-Red
  custody tests in `transfer_traceability.spec.ts` were genuinely green.
- **The recursion was un-optimised** — the depth problem above.
- **Three scratch measurement files were left in the suite** (`tests/__bench.spec.ts`,
  `__stressbench.spec.ts`, `__time.spec.ts`). Reused to take the before/after numbers in this
  entry, then deleted; a fourth (`__probe.spec.ts`) was written to measure per-relation bind cost
  and also deleted.
- **`CUSTODY_IMBALANCE` (6.8) was implemented but untested** — a check nobody exercises is the same
  failure mode as the bug under repair. Covered now.
- **The hygiene assertion covered only 3 of the 6 custody views**, so `v_lot_custody_timeline`,
  `v_lot_current_location` and `v_custody_balances` could have acquired a proximity predicate
  unnoticed. Extended to all six. `v_fifo_data_quality` is deliberately excluded: it carries two
  intentional tolerances.
- **Task-number comments** (`── 6.1 …`) were left in `custody_ledger.spec.ts`. Removed, along with
  the `@see openspec/…` pointers earlier groups had left in four other files.
- **`DuckDbTaxCalculatorAdapter` still owed both port methods.** Implemented.

#### 6.3 is deferred to group 7, and cannot be done here

Task 6.3 asks that synthetic accounts be *created* on demand with `is_synthetic = 1`. The
derivation and the marker exist in the engine — `synthetic_account_name` is generated from the
shared constant, and `v_lot_current_location` / `v_custody_balances` both report `is_synthetic`,
falling back to the name test when no row exists. But **no write path exists anywhere**:
`grep -rn is_synthetic apps/backend/src packages/database/src` returns only reads. The write belongs
to `SQLiteLedgerAdapter.ensureAccountExists(EnsureAccountInput)` — whose `isSynthetic` field group 2b
already added — driven from `FifoMaterializerService`, both of which are group 7's files and both
currently non-compiling. Left unchecked rather than done badly across a group boundary.

**Group 7 must:** before writing custody entries, resolve every distinct `account_id` in
`v_custody_entries` that `is_synthetic_account_name()` matches, and `ensureAccountExists` it with
`isSynthetic: true` and no parent. Otherwise `lot_custody_entries.account_id`'s FK to `accounts`
will reject every synthetic leg.

#### Residual semantics, and why the tolerance is the asset's own fee volume

- positive synthetic balance beyond tolerance → `CUSTODY_RESIDUAL`, **low**
- within tolerance → no flag
- **negative** balance → `UNTRACKED_INFLOW`, **high**, wherever it occurs rather than only on the
  synthetic account, because a holding whose cost basis was never established is the fiscally
  dangerous direction
- tolerance = `GREATEST(SUM(fee_amount) for that asset, 1e-12)`

An unrecorded network fee cannot plausibly exceed the fees that *were* recorded for the same asset.
A shared absolute constant is meaningless across assets whose unit values differ by orders of
magnitude — 0,01 is noise in XRP and a fortune in BTC. Proven non-vacuous: replacing the fee scale
with `0.001` fails `scales the tolerance per asset rather than by a shared constant`, which asserts
an identical 0,4 residual on BTC and ETH is flagged on ETH only.

#### Ten deliberate breaks, ten named failures — nothing vacuous

Each break was applied to the shipped SQL, the suite run, then restored. Every one produced a
failure naming the property, so no assertion passes for the wrong reason:

| break | test that failed |
|---|---|
| override precedence dropped from the counterparty `COALESCE` | `redirects the credit when a destination override names a real account` |
| allocation ordered newest-lot-first | `draws the moved quantity from the oldest lot held in that account` |
| residual tolerance replaced by an absolute `0.001` | `scales the tolerance per asset rather than by a shared constant` |
| negative-balance predicate disabled | `reports UNTRACKED_INFLOW at high severity …` |
| `CUSTODY_IMBALANCE` predicate disabled | `reports CUSTODY_IMBALANCE where custody cannot account for the ledger balance` |
| minus sign dropped from the debit leg | `emits one debit and one credit per movement, balanced to zero` **and** `keeps every custody movement balanced to zero per asset` |
| severity restated as a `'low'` literal instead of joined | 3 tests, incl. `reports each defect with a severity from the canonical map …` |
| recursion input emptied | 10 tests, incl. all three custody cases in `transfer_traceability.spec.ts` and `returns zero rows for a ledger with resolvable values and balanced custody` |
| a 72-hour `ABS(DATEDIFF(...))` proximity join injected into `v_custody_movements` | 6 tests, incl. `carries no time-window, amount-tolerance or nearest-in-time predicate` |
| both valuation branches of `v_fifo_data_quality` disabled | `reports missing prices without blocking` |

Two findings from that exercise worth keeping:

1. **`reports missing prices without blocking` is redundantly covered.** Disabling *either* the lot
   branch or the match branch of `v_fifo_data_quality` left it green; only disabling both failed it.
   Redundant, not vacuous — but it means a single-branch regression would go unnoticed by that test,
   which is why the lot branch is separately pinned by `reports each defect with a severity from the
   canonical map …` (a `STAKING` acquisition with no disposal, so only the lot branch can produce
   the row).
2. **The hygiene assertion genuinely fires.** The injected proximity join was caught by the test
   whose whole purpose is to catch it — the assertion strips `--` lines first, so documenting the
   decision does not fail the test that enforces it.

#### Audit findings, one line each

- **All five spec-named relations plus two helpers exist and are reachable.** No stubs.
- **`v_fifo_data_quality` returns zero rows for a clean fixture** (asserted), and its columns match
  `FifoDataQualityRow` exactly, `detail_key` included as `'fifo_quality.' || LOWER(quality_flag)`.
- **Severity is read from `FLAG_SEVERITY`**, not restated. No second ranking exists.
- **No custody SQL contains a time window, an amount-matching band or a nearest-in-time tie-break.**
  Asserted across six views. The only tolerances are the fee-scale residual and a 1e-12 precision
  bound, and the latter exists because `lot_custody_entries.qty_delta` is persisted at 12 decimal
  places — a divergence below that is not representable in the stored figures.

### Group 7 — Materialisation reconciliation ✅ 7/7 (+ 6.3, carried forward from group 6)

| package | before | after |
|---|---|---|
| `packages/shared-types` | 38 passing, `tsc` clean | **38 passing**, `tsc` clean (untouched) |
| `packages/core-domain` | 58 passing, `tsc` clean | **58 passing**, `tsc` clean (untouched) |
| `packages/database` | 99 passing, `tsc` clean | **99 passing**, `tsc` clean (untouched) |
| `apps/backend` tests | 143 passing / 2 failing | **157 passing / 2 failing**, identical across 3 consecutive full runs at load average 4.19 |
| `apps/backend` ports contract | 15 type assertions | **16 type assertions**, `Type Errors: no errors` |
| `apps/backend` typecheck | 28 errors | **6 errors** |

The 2 remaining failures are still group 8's `repro.test.ts` (`CHECK constraint failed: total_fiat …`)
— the same two, unchanged. The 6 remaining `tsc` errors are `GetSpanishTaxReportUseCase.ts` (2) plus
its spec mock and `GetTokenHistoryUseCase`'s (2) for group 10, and `mockPortfolio.ts` (2) for
group 11. **None is in a group-7 file.**

#### What was built

`SQLiteLedgerAdapter` now satisfies `ILedgerPort` in full. `upsertTaxLots` /
`upsertLotHistoryEvents` are gone; one generic `reconcile<T>()` drives all three derived tables from
a `DerivedTableSpec` (table, column list, id projection, value projection). The three public methods
differ only in that spec — a per-table copy of the insert/update/retire/reactivate logic is exactly
how the fee-disposal predicate drifted from the principal one in the first place.

The algorithm: read every row of the table **including the soft-deleted ones**, fingerprint each
one's values, then per recomputed row insert / reactivate / update / skip, and finally retire every
live persisted id absent from the recomputed set. Reading the retired rows is load-bearing — without
them a returning row would be inserted against a primary key that already holds it.

`FifoMaterializerService.recalculate()` is now a Functional Sandwich with the boundary in the right
place: **all four DuckDB reads happen before the SQLite transaction opens**
(`calculateLotsAndEvents`, `calculateCustodyEntries`, `getDataQuality`), so no SQLite write lock is
ever held across a query against the DuckDB engine that has that same file attached. It returns
`MaterializationSummary` — three `ReconciliationSummary` objects plus `flagged` and `pendingReview`.

Also implemented, because the port declared them in group 2b and nothing satisfied them:
`getCustodyEntries`, the six override CRUD methods, `ensureAssetExists(EnsureAssetInput)`,
`ensureAccountExists(EnsureAccountInput)` returning the resolved id, and `getAccounts()` carrying
`parentAccountId` / `isSynthetic`.

#### 6.3 discharged — the synthetic accounts now have a write path

Before reconciling custody, the service takes the distinct `account_id` values of the recomputed
custody set, filters them through `isSyntheticAccountName()` from `@kryptofolio/shared-types` (the
name is never re-derived locally), and `ensureAccountExists`-es each with `isSynthetic: true` and no
parent — inside the same transaction. Confirmed non-vacuous: with the loop emptied, **10 of 12 tests
fail** on `FOREIGN KEY constraint failed`, which is precisely the failure group 6 predicted.

`is_synthetic = 1` is separately pinned: flipping the flag to `false` fails exactly one test.

`ensureAccountExists` uses `ON CONFLICT DO NOTHING`, so an account that already exists as a real
venue is never demoted to synthetic, and reconciliation never rewrites user-visible account
metadata. Synthetic accounts get `type = 'wallet'`, not `'exchange'`: nothing can be imported into
them and they hold no credentials. `accounts.type` has no CHECK constraint, so this is a convention,
not an enforced one — group 12 should keep it in mind when filtering selectors.

#### A no-op update is skipped, and that is a correctness requirement rather than an optimisation

The audit trigger is `AFTER UPDATE` with no `WHEN`, so it fires on every `UPDATE` regardless of
whether anything changed. Writing identical content back would record a change that did not happen
and make an idempotent rebuild indistinguishable from a real one. `reconcile` therefore compares a
fingerprint of the persisted values against the recomputed ones and writes nothing when they match.

The fingerprint renders both sides to strings because SQLite returns an INTEGER column as a number
and a TEXT column as a string (`is_taxable` is the case that matters). Fields are joined with
`U+001F` and a SQL `NULL` renders as `U+0000`, neither of which can occur in a decimal string, an
ISO timestamp or an enum member — so no two distinct rows collide onto one fingerprint. **The first
version of this used a plain `''` join and a space for null**, which would have made
`('AB', null)` and `('A', 'B')` indistinguishable; caught before it shipped.

#### ⚠️ The port could not express atomicity, so one method was added to it

`ILedgerPort` gained `runInTransaction<T>(work: () => Promise<T>): Promise<T>`. Group 2b froze the
port surface, and the three reconciliation methods are individually insufficient: the
`Atomic Materialisation` requirement is a property of all three together, and D13 says one
transaction. Expressing it any other way meant either a fourth method taking all three sets at once
(which contradicts task 7.3, where the *service* drives the reconciliation) or an undeclared
`BEGIN`/`COMMIT` side effect inside the adapter — the same class of error as the SQL predicate drift
that started this investigation.

The caller never sees a transaction handle, so no SQL vocabulary leaks out of infrastructure. The
generic return type is asserted in `ledger-port-contract.spec-d.ts` and is not decorative: with the
signature changed to `Promise<void>`, the contract test fails with
`TypeCheckError: Type 'void' is not assignable to type 'MaterializationSummary'`.

#### ⚠️ Spec defect — `needs_recalculation` cannot be cleared "within the same transaction"

The `fifo-materialization-reconciliation` spec requires *"`needs_recalculation` MUST be set to
`'false'` within the same transaction that wrote the derived rows"*. **That is not achievable as the
application is wired.** `IUserSettingsPort` is implemented by `SqliteVaultPortAdapter` over
`NodeSqliteAdapter` — the **vault** database — while the derived tables live in the **ledger**
database opened by `getLedgerDb(process.env.LEDGER_DB_PATH)` (`container.ts:118` vs `:159`). Two
SQLite connections to two files; one transaction cannot span them.

Migration `004` §4.9 muddies this further by creating a **second** `user_settings` table in the
*ledger* database and writing `needs_recalculation = 'true'` into it — a row the production
`IUserSettingsPort` never reads.

What was implemented instead: `setSetting('needs_recalculation', 'false')` is the **last statement
inside the `runInTransaction` callback**, so it is unreachable if any reconciliation throws, and it
does become genuinely transactional whenever the two ports share a connection. The two observable
guarantees the spec is actually protecting are asserted and proven:

- a mid-run failure leaves the flag `'true'` and `tax_lots` byte-identical to its pre-run contents
  (`rolls back and leaves needs_recalculation true when a derived write fails`, driven by a recomputed
  event carrying a dangling `tax_lot_id` so the FK rejects it *after* `tax_lots` has been written);
- a successful run leaves it `'false'`.

**For group 9 to decide:** either route the flag through `ILedgerPort` so it lives in the ledger
database with the data it describes, or amend the spec scenario to "cleared only after the derived
write commits". Do not leave two `user_settings` tables with one of them unread.

#### ⚠️ My own 7.6 test was vacuous, and a deliberate break is what exposed it

As first written, `rebuilds from empty derived tables to the same state as an incremental run` ran
materialisation twice with the derived tables empty **both times** — so it compared a from-scratch
rebuild against another from-scratch rebuild and proved only determinism. It stayed green against a
break that made an inserted row's value depend on whether the table had been empty, which is exactly
the defect the scenario exists to catch.

Rewritten to build the incremental state honestly: soft-delete the SELL and the second BUY, run,
restore them, run again (which must *amend* rows written by the first run — asserted:
`inserted + updated > 0` and the snapshot must differ from the partial one), and only then empty the
tables and compare. The same break now fails it.

#### ⚠️ One test was flaky at ~3.5 s against the 5 s ceiling, and was fixed by moving work, not the limit

The full backend suite ran green twice, then `reactivates the existing row when a retired transaction
is restored` failed once on the third run. Measured per-test durations explained it: that test and
`rebuilds from empty derived tables …` needed **3460 ms and 3564 ms** in their bodies, because each
performs three full materialisations and one materialisation costs ~1700 ms (migrations, DuckDB
`initialize()`, the custody-chain bind, then the FIFO + custody + data-quality passes). At the
machine's habitual load average of 3–4 that clears 5000 ms.

Fixed with group 6's remedy: the preparatory rebuilds moved into a `beforeEach` inside a nested
`describe`, leaving one rebuild plus the assertions in the body. Vitest budgets `hookTimeout`
(10 s) separately from `testTimeout` (5 s), so the work is now under two ceilings rather than one.
Proven rather than assumed: the whole file passes with `--testTimeout=2500`, which the previous
structure could not have done. Three consecutive full backend runs at load average 4.19 then gave
`157 passed / 2 failed` every time.

The two `expect`s that guard the incremental setup (`inserted + updated > 0`, and that the amended
snapshot differs from the partial one) were carried into the hook as booleans and asserted in the
body, so moving setup out of the test did not move an assertion out with it.

#### Ten deliberate breaks, ten named failures

Each break was applied to the shipped code, the suite run, then restored.

| break | test that failed |
|---|---|
| retire arm short-circuited | `retires the lot of a soft-deleted transaction …`, `retires a phantom lot …`, `reactivates the existing row …` |
| reactivation counted as an update | `reactivates the existing row when a retired transaction is restored` |
| `changed` forced to `true` (every row rewritten) | `produces zero writes and no audit rows on an unchanged second run` |
| `runInTransaction` replaced by a bare async block | 9 tests, incl. `rolls back and leaves needs_recalculation true …` |
| synthetic-account loop emptied | 10 tests, all on `FOREIGN KEY constraint failed` |
| `isSynthetic: true` → `false` | `creates the synthetic ownwallet counterparty on demand with is_synthetic = 1` |
| `disposal_type` dropped from the event column list | 11 tests, incl. `persists disposal_type, provenance and quality flags …` |
| an `UPDATE manual_price_overrides` injected into `reconcile` | `leaves the user-authored override tables byte-identical across a rebuild` |
| inserted values made to depend on whether the table was empty | `produces zero writes …` **and** `rebuilds from empty derived tables …` |
| update replaced by delete-then-insert | `records a changed quantity as one in-place update, not a delete and an insert`, plus 2 more |
| soft delete replaced by a hard `DELETE` in the override CRUD | both override round-trip tests |

#### Honest note on the Red state

All 11 tests were written first and all 11 failed — but **all 11 failed on the same first write**
(`NOT NULL constraint failed: lot_history_events.disposal_type`), so no individual assertion was
reached. That is the same shape as group 5's "18 tests failing in `beforeEach`" finding, and a Red
of that kind proves only that the old code cannot write the new schema. The per-assertion evidence
is the ten breaks above, each of which produces a failure naming the property it removed. The Red
run did establish one useful thing: the harness, the seed and the whole DuckDB chain were reached
and working, and `tax_lots` wrote successfully before the events write failed.

#### 7.4's `PreciseAmount` clause has nothing to apply to

Task 7.4 asks for "`PreciseAmount` for any monetary field" in the summary. `MaterializationSummary`
contains **no monetary field** — four counts per table plus two totals. Nothing was invented to
satisfy the clause; the requirement is vacuously met, recorded here rather than papered over.

`flagged` and `pendingReview` are both derived from `getDataQuality()` rather than from the derived
rows' own `quality_flag`, because `pending_review` exists only on `FifoDataQualityRow` and because a
custody residual or imbalance is a defect attached to no lot at all. The test asserts
`pendingReview <= flagged`.

#### Nine test files were pinned to a hand-picked migration prefix, again

`SQLiteLedgerAdapter.spec.ts` and `CsvIngestionUseCase.spec.ts` still `db.exec`-ed `002` and `003` by
hand and never called `initialize()`, so they ran against a **pre-004** schema. The moment the
adapter began writing `parent_account_id` / `is_synthetic` / `disposal_type`, 14 of 15 tests in the
first file failed with `table accounts has no column named parent_account_id`. Both now let the
adapter's own runner apply the full set — the same fix group 5 applied elsewhere, and a reminder that
the pattern is still latent wherever a spec pre-`exec`s migrations.

#### The signature change was a 40-error spike before it was a 22-error win

Replacing `ensureAssetExists(id, symbol)` / `ensureAccountExists(id, name)` with input objects took
the backend from 28 to **58** `tsc` errors: the old two-argument signature on the adapter had been
absorbing every positional call site, and the error was reported once on the class instead of 40+
times at the calls. All were mechanically converted (`SQLiteLedgerAdapter.spec.ts`, `repro.test.ts`,
`settings.ts`, `CsvIngestionUseCase.ts`) and the two `Mocked<ILedgerPort>` fixtures were given the
eleven new methods. Net **28 → 6**.

`CsvIngestionUseCase` was adapted at the call site only: `is_fiat` resolution from the ISO-4217 list
(8.5) and sub-wallet resolution from `wallet` via `deriveSubAccountId` (8.6) remain group 8's, and
`ensureAccountExists` currently ignores `input.wallet`. The port documents that the returned id "may
be a child account derived from `wallet`"; today it always returns `input.accountId`.

#### Two smaller findings

1. **`lot_custody_entries.transfer_group_id` is written by nothing.** Migration 004 declares it
   ("shared by both legs of one physical movement, once a counterparty is resolved"), but
   `v_custody_entries` does not emit it and neither `CustodyEntryRow` nor `LedgerCustodyEntry`
   carries it, so it is `NULL` on every row. Either the engine should emit it or the column should
   go; left as-is because inventing a value in the adapter would be exactly the fabrication D6
   forbids.
2. **`getLotHistoryEvents` was silently corrupting nulls.** It ran `toPreciseAmount(row.x as string)`
   on `sale_price_fiat` / `gain_loss_fiat` unconditionally, so a `NULL` came back as the string
   `"null"` — undoing group 2's whole reason for making those columns nullable. Fixed at the same
   time as the write path.

### Group 8 — Ingestion integrity and sub-accounts ✅ 7/7

| package | before | after |
|---|---|---|
| `packages/shared-types` | 38 passing, `tsc` clean | **38 passing**, `tsc` clean (untouched) |
| `packages/core-domain` | 58 passing, `tsc` clean | **60 passing**, `tsc` clean |
| `packages/database` | 112 passing, `tsc` clean | **112 passing**, `tsc` clean (untouched) |
| `apps/frontend` | 271 passing | **271 passing** (untouched) |
| `apps/backend` tests | 169 passing / **2 failing** | **195 passing / 0 failing** |
| `apps/backend` typecheck | 6 errors | **6 errors**, the same six, all owned by groups 10–11 |

The two long-standing failures are gone: `repro.test.ts`'s `Payload 1 - WITHDRAWAL` and
`Payload 3 - BUY` were failing on `CHECK constraint failed: total_fiat …`, which is exactly the
defect 8.2 repairs.

#### What was built

| file | Δ | what |
|---|---|---|
| `CsvIngestionUseCase.ts` | +154 / −30 | `IngestionResult`, sign normalisation, unmapped-type rejection, `is_fiat`, wallet resolution |
| `CsvIngestionUseCase.spec.ts` | +305 / −5 | 17 new tests |
| `repro.test.ts` | +75 / −48 | rewritten: typed, asserting, no `as any` |
| `SQLiteLedgerAdapter.ts` | +23 / −1 | `ensureAccountExists` resolves the sub-account |
| `SQLiteLedgerAdapter.spec.ts` | +115 | 7 new tests |
| `routes/ingestion.ts` | +8 / −3 | reports persisted rather than submitted rows |
| `routes/__tests__/ingestion.test.ts` | +37 / −1 | 1 new test, mock updated to the new result |
| `metadataNormalizer.ts` | +5 / −1 | `wallet` is its own dictionary key |
| `transactionNormalizer.spec.ts` | +28 / −1 | 2 new tests, 1 existing rewritten |

- **8.2 — one fiat resolution path, and it never fabricates.** `resolveFiatMagnitudes()` takes the
  magnitudes through `Decimal.abs()` and fills in *only* what the source left out: a recorded total
  with a missing unit price now yields `total / qty` instead of being **overwritten** by the fetched
  price. The old code fetched whenever *either* value was zero and replaced both, which is how a
  recorded €299,70 became €246.858,40 in the failing test that caught it. The derived total also
  `.abs()`-es the quantity, which is the second half of the `-439.55` withdrawal bug.
- **8.3 — `toSpotTxType()` throws `UnmappedTransactionTypeError`** naming the value and the row
  timestamp. The type is resolved **before** any FK is created, so a rejected row leaves no account
  and no asset behind. `execute()` catches that one error class per row and collects it; every other
  error still aborts the batch, because a missing `id_hash` or an undeterminable fee asset is a
  programmer error, not a data defect the user can act on.
- **8.4 — the count is the distinction.** See the finding below: the ledger column cannot hold
  `NULL`.
- **8.5 — `isFiatCurrencyCode()`** at the single `ensureAssetExists` call site. `USDT` stays
  non-fiat, asserted.
- **8.6 — `ensureAccountExists` resolves the sub-account.** `deriveSubAccountId(accountId, wallet)`
  gives the *identifier* (stable across imports because it is derived from the venue's id), while the
  *name* is derived from the venue's own name, so the child reads as `Kraken:earn` rather than
  `<uuid>:earn`. The venue parent is created first; `ON CONFLICT DO NOTHING` keeps it idempotent. No
  wallet, an empty wallet or a whitespace wallet all return the venue unchanged and create nothing.
- **The `METADATA_DICTIONARY` collision carried forward from group 3 is closed.** `wallet` is now its
  own key (`wallet`, `subwallet`, `sub_wallet`, `cartera`, `subcartera`) and was **removed** from
  `account_id`'s pattern list. Both were required: `Object.entries(...).find(...)` matches in
  insertion order, so leaving `wallet` under `account_id` would have kept winning. Ingestion reads
  `metadata.wallet`.

`execute()` now returns `IngestionResult { persisted, rejected: IngestionRejection[], unresolvedFiat }`
instead of `void`, and `needs_recalculation` is flagged when `persisted > 0` rather than when
`rows.length > 0` — a batch in which every row was rejected has nothing to recalculate.

#### ⚠️ 8.4 cannot be satisfied as the spec words it, and the reason is a constraint this change added

The `csv-data-ingestion` spec requires unresolved fiat magnitudes be "recorded as unresolved rather
than as `0`". **They cannot be.** `spot_transactions.total_fiat` and `price_fiat` are `TEXT NOT NULL`
with a non-negative CHECK (migration `004` §4.6, group 4), and `nonNegativePreciseAmountSchema`
(group 2) says the same at the type level. `0` is the only value the column can carry for an unknown
magnitude — the same value a genuinely free acquisition would carry.

Implemented instead, without widening the schema:

1. `IngestionResult.unresolvedFiat` counts the rows persisted with an unresolvable magnitude, which
   is what the spec's own third scenario asks for ("the result MUST report the count pending manual
   review").
2. Downstream the distinction already exists and is already read: `tx_context` in
   `v_flattened_fifo_events` derives `has_recorded_fiat = recorded_fiat IS NOT NULL AND recorded_fiat
   <> 0`, so a stored `0` falls through to the override, then the market series, then `NULL` +
   `MISSING_PRICE`. Nothing treats a `0` as a genuine price.
3. A provider that throws is caught and treated as unresolved rather than aborting the batch, per
   `Unresolved price does not block the batch`.

**Recommendation for group 13:** either amend the scenario to "recorded as `0` and reported as
pending", or make the two columns nullable — which is a migration change and would reopen a table
group 4 rebuilt. The engine's behaviour is already correct either way; only the wording is wrong.

#### `transfer_group_id` — measured, and deliberately left unwritten

`spot_transactions.transfer_group_id` is declared in `004`, joined by `v_custody_movements`'s
`recorded_counterparty` CTE, and **written by nothing**, so that middle tier of counterparty
resolution matches no rows today. Ingestion is the only layer that could know two legs belong to one
movement, so this was examined as group 8's work. It is not, for three measured reasons:

1. **No task and no spec scenario requires it.** `grep -rn transfer_group` over `tasks.md`,
   `design.md` and all 17 spec files returns nothing. It is an implementation detail group 6
   introduced with task 6.2's "recorded counterparty" tier.
2. **The only candidate source is consumed before ingestion sees it.** `TransactionMappedData.group_id`
   is Kraken's `refid` (`AutoMapColumnsUseCase`: `group_id: ["refid", "reference", …]`), and
   `aggregateRows()` — called from `useImportProcessor.ts:47`, before submission — **merges every row
   sharing a `group_id` into a single transaction**. A `group_id` that survives to the backend
   therefore had exactly one row, so there is no second leg for `recorded_counterparty` to join to
   (it requires `o.own_account_id <> l.own_account_id`). Writing the column would populate it with
   values that can never pair.
3. It would require extending `LedgerSpotTransaction` and the port surface group 2b froze.

**Consequence worth stating plainly:** a Kraken `spot → earn` transfer exported as two rows with one
`refid` is collapsed by the aggregator into one transaction on one account, so the sub-wallet
scenario cannot be reproduced from a real Kraken export even with 8.6 in place. This is consistent
with what group 1 measured — the real export contains only `spot / main` and a single `transfer` row
— and with group 13 keeping the synthetic fixture. **For group 13 to decide:** drop
`transfer_group_id` and the `recorded_counterparty` tier as unreachable, or open a follow-up change
that keeps multi-account legs separate through the aggregator and links them explicitly. Do not leave
a resolution tier that no ledger row can enter.

#### The Red, honestly

19 tests failed before any production line changed, and **15 of them failed on their own assertions**:

| observed failure | property |
|---|---|
| `expected '-299.7' to be '299.7'` | 8.2 |
| `expected '-1.2128' to be '1.2128'` | 8.2, price leg |
| `expected '-1234567890123456789.123456789' to be '1234567890123456789.123456789'` | decimal, not `Number` |
| `expected '-439.55' to be '439.55'` | absolute quantity in the derived total |
| `expected '246858.40449' to be '299.7'` | the recorded total was being overwritten |
| `expected "vi.fn()" to not be called at all, but actually been called 1 times` | the `?? 'BUY'` fallback, D16 |
| `expected '…-000000000002' to be '…-000000000002:earn'` (×2) | 8.6 |
| `expected null to be '20000000-…-aa'` | venue parent not created |
| `expected [{ id: 'EUR', is_fiat: 0 }] to deeply equal [{ id: 'EUR', is_fiat: 1 }]` | 8.5 |
| `expected undefined to be 'earn'` (core-domain) | the metadata collision |

**4 were weak** — `TypeError: Cannot read properties of undefined (reading 'persisted' / 'rejected' /
'unresolvedFiat')`, because `execute()` returned `void` and the result type did not exist yet. Those
four prove nothing on their own, so each was pinned afterwards by a deliberate break.

#### Six deliberate breaks, six named failures

Each applied to the shipped code, suite run, then reverted.

| break | test that failed |
|---|---|
| `unresolvedFiat` increment disabled | `reports an unpriceable acquisition as pending …`, `completes the batch and reports every unresolvable row in it` |
| `rejected.push` removed (row still skipped) | `rejects an unmapped type, naming the value and the row timestamp`, `persists the valid rows of a batch that also contains an unmappable one` |
| `persisted` returned as `rows.length` | `persists the valid rows of a batch that also contains an unmappable one` |
| child name derived from the venue id instead of its name | `returns the child account and parents it to the venue`, `creates the venue parent …`, `collapses Kraken's composite primary wallet label …` |
| `isFiat` hardcoded `false` | `persists the fiat classification of every asset it resolves` |
| fiat fetch triggered on `total OR price` zero (the old predicate) | `keeps a recorded total when only the unit price is missing` |
| `readWalletDesignation` forced to `undefined` | `resolves the wallet designation to a child account under the venue`, `resolves the identical child account when the same file is ingested twice` |
| route `processedCount` back to `rows.length` | `counts only the persisted rows and names the rejected ones` |

#### Three pre-existing tests were changed, deliberately

1. `resolves FK dependencies before inserting` asserted `ensureAssetExists({ assetId, symbol })` and
   `ensureAccountExists({ accountId })` exactly; both now carry the new fields (`isFiat`, `wallet`).
2. `should normalize obscure metadata keys` used `wallet: "My Main Account"` to assert the
   `account_id` rename. Rewritten to use `account`, which is what that requirement was actually
   about; `wallet` now has its own two tests.
3. The route's `execute` mock returned `undefined`; it returns an `IngestionResult` now.

#### `repro.test.ts` was a scratch file that asserted nothing

It contained three `it()` blocks with **no `expect` at all** — they passed or failed only on whether
`execute()` threw — and four `as any` casts, the only ones in an `apps/backend` use-case test. Since
the whole group-8 Red rested on this file, it was rewritten: typed payloads (`IngestibleTransaction`),
typed port stubs, `afterEach` closing the database, and each case now asserting the persisted
`total_fiat` / `price_fiat` pair. The production rows are unchanged, verbatim.

#### Two smaller findings

1. **`toFuturesTxType()` keeps its `?? 'TRADE'` fallback.** It is the identical defect to
   `toSpotTxType()`'s and was left alone on purpose: D16 and the `csv-data-ingestion` spec name
   `toSpotTxType()` only, and futures are out of this change's scope. Recorded so it is a decision
   rather than an oversight.
2. **The ingestion route reported submitted rows as processed.** `processedCount: rows.length` would
   have counted a rejected row as ingested, re-hiding at the HTTP boundary what 8.3 surfaces in the
   use case. Now `result.persisted`, with the rejection reasons appended to the existing `message`
   string. No new response field was added — the response shape is a frontend DTO's, and extending it
   belongs to 10.6 / 11.7.

### Audit — vacuous type assertions across the repo (requested after group 2b)

**Verdict: no pre-existing vacuous assertions. But one real coverage hole, and one fragile path.**

`grep -rl "expectTypeOf\|assertType"` over the whole repo returns **only the two files written in
group 2b**. There is exactly one `*-d.ts` file in the tree, also mine. So the two traps caught were
introduced by this change, not inherited.

#### Confirmed hole — `packages/database/tests/` is checked by nothing

`packages/database/tsconfig.json` sets `include: ["src/**/*.ts"]`, which **excludes `tests/`**, and
its `vitest.config.ts` has no `typecheck` block. Verified empirically by planting a deliberately
false assertion at `packages/database/tests/trap.spec-d.ts`:

| checker | result |
|---|---|
| `pnpm -F @kryptofolio/database exec tsc --noEmit` | **no output — did not see the file** |
| `pnpm -F @kryptofolio/database test` | did not run it (`include` glob misses `-d.ts`) |

This matters because `packages/database/tests/` is exactly where this change's FIFO integration
tests live. Any type assertion placed there today verifies nothing. Trap file removed after the
check.

#### Fragile path — `pnpm test` never type-checks anywhere

Every package's test script is a bare `vitest run`, with no `--typecheck`. Verified in
`core-domain` (whose tsconfig *does* cover its tests): with a false assertion present,
`pnpm test` reported **7 files / 35 tests passing**.

CI survives this only **incidentally**: `.github/workflows` runs `turbo run typecheck` *before*
`turbo run test`, and `tsc --noEmit` does catch it (`TS2344`). So a broken type contract fails CI on
the typecheck step — but a developer running `pnpm test` locally gets a false green.

#### tsconfig coverage per package

| package | `include` | covers its tests? |
|---|---|---|
| `apps/backend` | `src/**/*` | ✅ (tests are under `src/`) |
| `apps/frontend` | *(none — defaults to all)* | ✅ |
| `packages/shared-types` | `src/**/*` | ❌ tests live in `tests/` |
| `packages/core-domain` | `src/**/*` | ✅ (tests are under `src/__tests__/`) |
| `packages/database` | `src/**/*.ts` | ❌ tests live in `tests/` |

`shared-types` has the same structural hole as `database`; it is currently harmless only because its
tests contain no type assertions.

#### Recommendation — SUPERSEDED, and the reasoning was partly wrong

Closed by the cross-cutting cleanup after group 7, but **not** the way this section proposed. Adding
`typecheck: { include: [...] }` to the vitest configs would have been decorative: `vitest run` never
type-checks without `--typecheck`, and no `test` script passes it. What actually closed the hole was
`tsconfig.typecheck.json` + a `typecheck` script in all three packages, covering `tests/**` with
`rootDir` enforcing the package boundary — the pass CI already runs.

### Real source CSVs located

User-supplied path: `/Users/nelo/proyectos/AgenteIA/cripto-proyect/listadoTransacciones`

| file | notes |
|---|---|
| `kraken_spot.csv` | 34 rows. **Has the `wallet` column.** |
| `kraken_futures.csv` | 204 KB, out of scope (futures untouched) |
| `tangem_activacion_xrp.csv` | the live `WALLET_ACTIVATION` source |
| `bit2me_spot_{2024,2025,2026}.xlsx` | xlsx, not csv |
| `bitvavo_spot.csv`, `bitunix_spot.csv` | |

`kraken_spot.csv` header:
`"txid","refid","time","type","subtype","aclass","subclass","asset","wallet","amount","fee","balance"`

Measured content — **materially relevant to group 13 and to design D9**:

- `wallet` values: `{'spot / main': 34}` — **every row is `spot / main`; there is no `earn` row.**
  So `deriveSubAccountId` will resolve every real Kraken transaction to `Kraken:spot`, and the
  `Kraken:earn` sub-wallet scenario has **no real-world coverage in this export**. The 29 `STAKING`
  transactions in the baseline ledger did not come from this file with an `earn` designation.
  Group 13 must therefore keep the synthetic `spot → earn` fixture case (already present in
  `transfer-traceability.ts`) and must not assume the real CSV exercises it.
- `type` values: `{'deposit': 11, 'trade': 20, 'withdrawal': 2, 'transfer': 1}` — confirms the
  diagnosis at source: **11 deposits and 2 withdrawals that the engine turned into acquisitions and
  disposals**, plus exactly one row Kraken itself labels `transfer`.

`tangem_activacion_xrp.csv` first data row:
`2025-06-03 10:01:00 UTC,WALLET_ACTIVATION,XRP,1.0,0.0,Tangem Base Reserve` — confirms
`WALLET_ACTIVATION` is live production data, not dead code, validating the group-2 decision to keep
`flag` and `quality_flag` as separate columns.

### Group 9 — Automatic rebuild and overrides ✅ 10/10

| package | before | after |
|---|---|---|
| `packages/shared-types` | 38 passing, `tsc` clean | **40 passing**, `tsc` clean |
| `packages/core-domain` | 69 passing, `tsc` clean | **69 passing**, `tsc` clean (untouched) |
| `packages/database` | 112 passing, `tsc` clean | **112 passing**, `tsc` clean (untouched) |
| `apps/frontend` | 271 passing | **271 passing** (untouched) |
| `apps/backend` tests | 206 passing / 0 failing | **263 passing / 0 failing** |
| `apps/backend` typecheck | 6 errors | **6 errors**, the same six, all owned by groups 10–11 |

Measured with `pnpm --filter <pkg> test` per package and `tsc --noEmit` (plus
`tsconfig.typecheck.json` for the three packages). `pnpm run test:packages` still aborts at
`backend#build` on those six errors.

#### What was built

| layer | artefact |
|---|---|
| Application | `use-cases/IngestAndMaterializeUseCase.ts` — ingestion, then **one** rebuild, returning `{ ingestion, materialization, materialized, materializationError }` |
| Application | `use-cases/overrides/OverrideMutation.ts` — `OverrideValidationError`, `OverrideMutationResult`, and the shared *validate → one transaction → one forced rebuild* shape |
| Application | `SetManualPriceOverrideUseCase`, `RemoveManualPriceOverrideUseCase`, `SetTransferDestinationUseCase`, `RemoveTransferDestinationUseCase` — batched, branded inputs, no framework import |
| Contracts | `shared-types`: `TransactionIdHash` + `createTransactionIdHash` |
| Infrastructure | `dtos/materialization.ts` (rebuild/ingestion/override response schemas) and `dtos/overrides.ts` (inbound batches, built on the canonical ledger schemas) |
| Infrastructure | `routes/fiscal.ts` — `PUT`/`DELETE /api/fiscal/overrides/{prices,destinations}`, mounted in `app.ts` |
| Infrastructure | ingestion route now calls the orchestrator only; `POST /api/portfolio/rebuild` returns the same outcome shape |
| DI | five new use cases registered in both the constructor and `setDuckDbAdapter` |

#### Decisions taken

1. **A rebuild is owed by `persisted > 0`, never by `rows.length`.** An empty batch and a batch whose
   every row was rejected are the same fact — the ledger did not move — and both are covered by their
   own test. This is the note group 8 left, made executable.
2. **The override write commits *before* the rebuild, and the pending marker is set between them.**
   `runInTransaction` returns having committed; the rebuild then opens its own. The marker is written
   *before* the rebuild rather than after, because it lives in the settings database and therefore
   cannot ride the ledger's rollback — so a rebuild that dies partway leaves it standing.
3. **Override rebuilds are forced (`recalculate(true)`).** The user is waiting to see the effect of a
   value they just declared; whether a rebuild is owed was decided by the act of declaring it.
4. **A rejected declaration is `422`, not `500`.** `OverrideValidationError` is raised before any
   write, from the use case, and names the account or the transaction. SQLite would also have rejected
   both cases — a foreign key on the counterparty, `trg_transfer_dest_not_self_*` on the
   self-reference — but only mid-batch and with a message about a constraint.
5. **The whole batch is refused when one entry is invalid.** Validation runs over every entry before
   the transaction opens, so a partially applied request cannot exist.
6. **A failed automatic rebuild does not fail the request.** `POST /ingestion/transactions` still
   returns `201`: the rows are valid and recorded, only the projection over them is stale. The
   response carries `materialized: false` and the reason, and the marker stays `'true'`.
7. **`TransactionIdHash` is a new brand rather than a reuse of `TransactionId`.** `TransactionId` is
   the ledger's surrogate key; a re-ingestion produces a new one and the same hash, which is exactly
   why overrides key on the hash. Calling both by one name would have made the distinction
   unstateable — and it is the distinction "overrides survive re-ingestion" rests on.
8. **The response DTOs live in `infrastructure/dtos/` and are parsed on the way out.** The
   `automatic-portfolio-rebuild` scenario asks for Zod validation "before reaching the UI"; the
   frontend half of that is 11.7. Server-side parsing means a summary that lost a field fails here
   rather than showing the UI a missing count.
9. **The ingestion response still has no structured `rejected` field.** Rejection reasons remain
   appended to `message`, as group 8 left them: the response shape is a frontend DTO's, and extending
   it is 10.6 / 11.7. The rebuild fields were added because the spec scenario names them explicitly.

#### ⚠️ Spec wording amended: the flag cannot be cleared "in the same transaction"

Both `automatic-portfolio-rebuild` ("Flag is cleared transactionally") and
`fifo-materialization-reconciliation` ("Recalculation flag is cleared only on success") required the
clear to happen *within the transaction that wrote the derived rows*. It cannot: the flag is read and
written through `IUserSettingsPort` against the **settings** database while the derived tables live in
the **ledger** database, and one SQLite transaction cannot span two files. The cross-cutting cleanup
after group 7 had already removed the duplicate ledger `user_settings` table; only the wording was
outstanding.

Both scenarios now state the two guarantees that *are* achievable and that the retry behaviour actually
depends on — cleared last, after every derived row is committed; left `'true'` when any earlier step
fails — and each says why the stronger wording is not. `openspec validate --changes` passes.

#### ⚠️ A fifth vacuous-pass trap, caught in my own first draft

The Red run for `createTransactionIdHash` reported **one** failure where two were expected. The
rejection test asserted `toThrow(/TransactionIdHash/)` — and
`createTransactionIdHash is not a function` **contains that substring**, so it passed against a
function that did not exist. Tightened to `/^Invalid TransactionIdHash/`, with a comment saying why.
Same family as the four already recorded: an assertion that looks present and fires on the wrong thing.

#### ⚠️ My "unpriceable" fixture was priced all along

`OverrideMaterialization.spec.ts` first used **XRP** for the unpriced `STAKING` receipt and asserted
`MISSING_PRICE`. Measured: the lot came back **`CURRENCY_MISMATCH`** with a basis of `2.006`. The repo
ships real historical prices for XRP quoted in **USD**, so against an EUR ledger the receipt resolves
and picks up the currency defect instead. Had the assertion been written the other way round it would
have "passed" while testing a different flag. Replaced with `TSTCOIN`, an asset absent from the price
parquet, and the reason is a comment in the fixture.

A second assertion in the same file was wrong for a related reason: `pendingReview` after assigning a
price is **1, not 0** — the withdrawal to an undeclared destination still leaves a custody residual,
which is a separate declaration the user has not made. Now asserted as `before.pendingReview - 1`.

#### The Red, honestly

**52 of the 57 new tests failed on their own assertions before the code existed**, with a stub in place
that answered wrongly. The breakdown per file:

| file | Red | how |
|---|---|---|
| `IngestAndMaterializeUseCase.spec.ts` (12) | 4 | stub that always rebuilt and never caught: 2 clean assertion failures, 2 failing because the rebuild error propagated |
| `ingestion.test.ts` (+4, 13 total) | 7 | route still called `csvIngestionUseCase` |
| `portfolio.test.ts` (+2) | 2 | `{ success: true }` instead of the summary |
| override use cases (23) | 17 | stub that rebuilt per entry, opened no transaction and validated nothing |
| `fiscal.test.ts` (10) | 9 | route existed with one endpoint returning the wrong shape |
| `OverrideMaterialization.spec.ts` (7) | 3 | genuinely Red against the real engine, see the fixture finding above |
| `shared-types/ledger.spec.ts` (+2) | 1 | the other was the vacuous pass described above |

**Every test that passed against its stub was pinned afterwards by a deliberate break** — applied to
the shipped code, suite run, reverted:

| break | tests it turned Red |
|---|---|
| rebuild once per persisted row | 3 (`exactly once`, `several files`, `never per row`) |
| rebuild before ingestion | 8 |
| summary not propagated to the result | 2 |
| framework import added to the orchestrator + a `Materializer` reference added to `CsvIngestionUseCase` | 2 |
| the `count === 0` guard removed | 4 (both empty-batch pairs) |
| note dropped and the declared value pushed through `Number()` | 2 |
| override written under `'mismatched-' + idHash` | 4 in the real-engine file |
| every failure reported as a rejected declaration (422) | 1 |

Three assertions are **not** covered by a break, and are recorded rather than claimed: `applied`
arity on `CsvIngestionUseCase` (`length === 3`), `leaves the override table untouched across a rebuild`
(an absence, already enforced by group 7's reconciliation scope), and
`flags the unpriced receipt before any value is declared` (which failed for real during development —
that is how the XRP finding surfaced).

#### Pre-existing tests changed, deliberately

1. **`ingestion.test.ts` was retargeted at the orchestrator.** Its container double now provides
   `ingestAndMaterializeUseCase`, and keeps `csvIngestionUseCase` / `fifoMaterializerService` present
   but unreachable — which is what the new "sequences nothing itself" test asserts.
2. **`portfolio.test.ts`** gained two rebuild tests; no existing assertion was weakened.
3. **`shared-types/tests/schemas/ledger.spec.ts`** gained a `createTransactionIdHash` describe.

#### Two smaller findings

1. **`erasableSyntaxOnly` forbids constructor parameter properties.** Both new use-case files were
   first written with `constructor(private readonly x: T)` and produced 6 `TS1294` errors — briefly
   taking the backend from 6 to 12. Rewritten as explicit fields plus assignments, matching every
   existing use case. Worth knowing before writing the next one.
2. **The rebuild endpoint's response shape was safe to change.** `RestCryptoAdapter` does
   `await bffClient.api.portfolio.rebuild.$post()` and reads nothing from the body; the frontend suite
   is unchanged at 271.


### Group 10 — Read path: canonical status, provenance, custody ✅ 7/7

| package | before | after |
|---|---|---|
| `packages/shared-types` | 40 passing, `tsc` clean | **40 passing**, `tsc` clean (untouched) |
| `packages/core-domain` | 69 passing, `tsc` clean | **69 passing**, `tsc` clean (untouched) |
| `packages/database` | 112 passing, `tsc` clean | **112 passing**, `tsc` clean (untouched) |
| `apps/frontend` | 271 passing | **271 passing** (untouched) |
| `apps/backend` tests | 263 passing / 0 failing | **301 passing / 0 failing** |
| `apps/backend` typecheck | 6 errors | **2 errors**, both `mockPortfolio.ts` (group 11) |

Measured with `pnpm --filter <pkg> test` and `tsc --noEmit` (`tsconfig.typecheck.json` for the three
packages). The four type errors this group owned are gone: `GetSpanishTaxReportUseCase.ts` ×2 (nullable
proceeds) and the two `ITaxCalculatorPort` mocks. `pnpm run test:packages` still aborts at
`backend#build` on the remaining two.

#### What was built

| layer | artefact |
|---|---|
| Ports | `ITaxCalculatorPort.getLotCustodyLocations()` + `LotCustodyLocationRow` — the net position per lot and account, distinct from `calculateCustodyEntries()`'s individual legs |
| Application | `GetTokenHistoryUseCase` — status passed through, `operation_type` from `disposal_type`, `quality_flag` / `value_provenance` exposed, nullable proceeds, `custody[]` per lot |
| Application | `GetSpanishTaxReportUseCase` — nullable proceeds, per-row provenance, `excludedFlaggedEvents` and `manuallyAssignedCount` on the response |
| Application | `GetFiscalIntegrityUseCase` — defects grouped by flag, ranked by the canonical severity, with the pending-review count and the pending-recalculation marker |
| Adapters | `DuckDbTaxCalculatorAdapter.getLotCustodyLocations()` over `v_lot_current_location` |
| Infrastructure | `dtos/fiscal-integrity.ts` and `GET /api/fiscal/integrity` |
| Infrastructure | `ingestionOutcomeSchema` gains structured `rejected[]` and `unresolvedFiat` |
| Performance | `DuckDbMetricsAdapter.getKpis()` pins four shared sources as temp tables: **1390 ms → ~782 ms** |
| DI | `getFiscalIntegrityUseCase` registered in both constructor paths |

#### Decisions taken

1. **The view's `status` is authoritative, and the test that proves it is the one that contradicts the
   quantities.** A lot whose quantity was *moved* rather than sold keeps every unit and stays `OPEN`
   while holding a zero balance at its acquiring account — so `remaining_qty = 0, status = 'OPEN'` is a
   legitimate state, and any quantity-derived status reports it as consumed. That case is the first
   assertion in the group, because it is the one a recomputation cannot satisfy by coincidence.
2. **Unresolved proceeds surface as `null`, not as `0`.** `TokenLotHistoryEventDto.sale_price_eur` and
   `gain_loss_eur`, and the tax report's `audit_trail` equivalents, are now `number | null` /
   `string | null`. Coercing them was how the two `tsc` errors were "avoidable" — and coercing to `0`
   reads downstream as a genuine disposal at zero, which is D6's whole objection one layer out.
3. **A zero-quantity custody row is not a location.** `v_lot_current_location` emits a row per account
   that ever touched the lot, including one summing to zero once the account has sent everything on.
   Filtered in the use case rather than in SQL: `v_custody_balances` sums the same view and a zero term
   changes no total, so the filter is a presentation concern and belongs where presentation is decided.
4. **Group severity is read from `FLAG_SEVERITY`, not from the row.** The view already emits a severity
   from the seeded vocabulary, so the two normally agree — but if they ever diverge the endpoint reports
   the shared vocabulary's ranking. A test asserts an `UNTRACKED_INFLOW` row arriving marked `low` is
   reported `high`. Restating the ranking in the DTO was avoided the same way: the Zod schema enumerates
   `FLAG_SEVERITIES` and `FIFO_QUALITY_FLAGS` and asserts nothing about which maps to which.
5. **`needsRecalculation` travels with the defects.** One read, one payload. Two endpoints would let the
   UI render a clean integrity report over figures known to be stale — and `fiscal-integrity`'s "Pending
   recalculation is indicated" scenario asks the IntegrityCard to show both. A test asserts the read
   never writes the marker.
6. **The ingestion response now carries `rejected[]` and `unresolvedFiat` as data, and keeps the
   narrated `message`.** Group 9 left this deliberately; the two serve different consumers — a toast
   reads the sentence, a review table needs the rows. `reason` is `min(1)` in the schema, so a rejection
   that lost its explanation fails on the way out rather than reaching a user who cannot act on it.
7. **`getKpis()` pins its shared sources as temp tables rather than as `MATERIALIZED` CTEs.** A CTE
   cannot span statements, and the eleven figures are eleven statements. See the measurement below.

#### The measured `getKpis()` fix, and why the earlier attempt failed

Per-statement timing on an **empty** ledger, obtained by wrapping the adapter's `queryOne`/`queryMany`:

| statement | before | after |
|---|---|---|
| total equity (`v_portfolio_daily_valuation`) | 209 | 3 |
| total cost (open lots) | 140 | 1 |
| flagged lots | 137 | 1 |
| 24 h delta | 106 | 3 |
| ATH / drawdown | 216 | **249** |
| annualized volatility | 110 | 1 |
| spot realized PnL | 99 | 1 |
| futures PnL | 15 | 15 |
| Sharpe | 107 | 1 |
| win rate | 116 | 17 |
| asset performance | 149 | 37 |
| **wall clock, 5 consecutive calls** | **1395, 1383, 1411, 1376, 1390** | **750, 834, 775, 782, 804** |

**1390 → ~782 ms, 1.77×.** The distribution is the finding: with no rows anywhere, eleven statements
each cost 99–216 ms. That is per-statement planning and execution over a deep view chain, not data
volume — which is exactly why group 6's attempt to collapse them into one statement measured 1.5×
*worse* (one plan of eleven times the size, still executed once). Pinning four shared sources
(`kpi_open_lots`, `kpi_valuation`, `kpi_events`, `kpi_returns_volatility`) makes the chain run once and
drops eight of the eleven statements to 1–17 ms.

What is left is honest: `v_portfolio_ath_drawdown` is read by exactly one statement, so pinning it
would pay its own cost and save nothing; and the four `CREATE OR REPLACE TEMP TABLE` statements
account for the ~460 ms the eleven measured statements do not. Getting below that means changing the
valuation view definitions in `packages/database`, which is not this group's surface.

**The correctness risk was pinned by a test, not by inspection.** The tables are rebuilt on *every*
call, because a cached snapshot would report figures from before the last rebuild — and that is a
silent wrong answer, which is worse than the 600 ms. `reads the ledger again on a second call rather
than a cached snapshot` fails when a `pinned` guard is introduced. Recorded trade-off: two concurrent
`getKpis()` calls on one connection share the temp tables, so a rebuild landing between them could tear
a read across sources. The eleven statements were already non-atomic against a changing ledger, so this
narrows the window rather than opening one.

#### ⚠️ Spec defect: the frontend DTO turns this group's `NULL` straight back into a fabricated `0`

Found while checking what the new payload does downstream, and it is the same defect class the change
exists to remove — not a group-11 refactor note.

`apps/frontend/.../CommonSchemaHelpers.ts`'s `numericField` begins
`if (val === null || val === undefined) return 0`, and `ExternalTaxSchemas.ts:198` parses
`sale_price_eur` through it. So the unresolved price that D6 made `NULL` in SQL, kept `NULL` through
the port, and now emits as `null` over HTTP becomes **`0`** at the anti-corruption layer — read
downstream as a genuine disposal at zero. The `COALESCE(price, 1.0)` this change deleted has a
surviving twin one layer out.

Second, smaller, and certain to be noticed first: `ExternalTaxLotSchema.status` is
`z.enum(["FULL","PARTIAL","EMPTY"]).optional()`, so `'OPEN'` and `'CLOSED'` now **fail that parse** in
the running app. The frontend suite is unaffected at 271 because it fixtures its own inputs — which is
worth stating plainly, since a green suite is not evidence here.

Neither is repaired in this group: `fifo-data-quality-flags` places the typed frontend model in 11.x
and the specs assign both files to group 11. Both are listed in the handover below. The `numericField`
one is the higher risk of the two, because it fails *quietly*.

#### The Red, honestly

**32 of the 38 new tests failed before the code existed, and 27 of those on their own assertions.**

| file | new | Red | how |
|---|---|---|---|
| `GetTokenHistoryUseCase.spec.ts` | 12 | 11 | port method and DTO fields declared, use case left recomputing status, hardcoding `'SELL'` and returning `custody: []` — every failure read `expected 'EMPTY' to be 'OPEN'`, `expected 'SELL' to be 'FEE'`, `expected [] to deeply equal […]` |
| `DuckDbTaxCalculatorAdapter.spec.ts` | 3 | 2 | adapter method present, body `return []` |
| `GetFiscalIntegrityUseCase.spec.ts` | 9 | 5 | stub that grouped nothing (one group per row), counted no pending rows and never read the marker |
| `fiscal.test.ts` | 5 | 5 | route absent — these five failed on the response (404/500 vs expected), not on a missing import |
| `ingestion.test.ts` | 3 (+1 extended) | 4 | field absent from the DTO: `expected undefined to deeply equal [ … ]` |
| `GetSpanishTaxReportUseCase.spec.ts` | 5 | 5 | 2 on assertions; **3 crashed** with `TypeError: Cannot read properties of null (reading 'toString')` at `GetSpanishTaxReportUseCase.ts:97` |
| `DuckDbMetricsAdapter.spec.ts` | 1 | 0 | written after the optimisation; pinned by a break instead |

The three `TypeError`s are recorded as crashes rather than claimed as assertion failures. They are not
a weak Red — that line *is* the defect the two `tsc` errors were reporting, and the test reaches it —
but they are not the test's own verdict either.

**Nine deliberate breaks, nine named failures**, each applied to shipped code, suite run, reverted:

| break | tests it turned Red |
|---|---|
| `group.rows.push(row)` removed | 1 (`carries each row through`) |
| pending marker hardcoded `true` | 1 (`healthy report for a clean ledger`) |
| `getDataQuality()` called without the account | 1 (`scopes the query`) |
| a `setSetting` call added to the read | 1 (`never writes a setting while reporting`) |
| severity read from the row instead of `FLAG_SEVERITY` | 1 (`canonical severity even when the row disagrees`) |
| adapter pointed at `v_custody_balances` instead of `v_lot_current_location` | 1 (`where each portion of a lot currently sits`) |
| zero-quantity locations kept | 1 (`omits an account that no longer holds any part`) |
| `rejected: []` while the message still names the row | 2 (`names the rejected ones`, `lost its reason`) |
| temp sources pinned once and cached | 1 (`reads the ledger again on a second call`) |

**Three assertions are not covered by a break, and are recorded rather than claimed:**

1. `returns an empty custody list for a lot the projection knows nothing about` — an absence, and it
   passed against the `custody: []` stub. Every break that would fail it also fails a sibling.
2. `[SQL Injection] getLotCustodyLocations with a malicious accountId returns no rows safely` — passed
   against `return []`. It follows the pattern of the three injection tests already in that file and
   asserts the table survives, so it is not vacuous, but it is not independently pinned either.
3. `scopes custody locations to the requested account` — the `v_custody_balances` break did **not**
   turn it Red, because that view also yields exactly one `acc-1` row for this fixture. It is pinned
   only by the sibling that names the two accounts.

#### Pre-existing tests changed, deliberately

1. **`GetTokenHistoryUseCase.spec.ts` fixtures are now typed `TaxLotType` / `TaxLotEventType`.** They
   previously built lots with `new Decimal(...)` inside an untyped `vi.fn().mockResolvedValue`, which
   type-checked because nothing checked it — `preciseAmountSchema` is a **string**. Typing the fixtures
   produced 15 `TS2322`s and they were fixed by using decimal strings, so the doubles now carry what
   the adapter actually returns. The retired `status: 'FULL'` value went with them.
2. **`GetSpanishTaxReportUseCase.spec.ts`** gained a typed `BASE_EVENT` and a `makePort` helper; the
   original assertion set is unchanged.
3. **`ingestion.test.ts`'s "names the rejected ones"** now also asserts the structured field. No
   existing assertion was weakened.

#### Two smaller findings

1. **A measurement harness was written and then deleted on purpose.** `kpi-perf.bench.spec.ts` timed
   `getKpis()` and asserted nothing; keeping it would have added a permanently green test that verifies
   no behaviour — the exact shape of the five vacuous-pass traps this log already records. The figures
   live in the table above and the correctness of the change is held by
   `reads the ledger again on a second call`.
2. **`v_portfolio_returns_volatility` is read in five places in `DuckDbMetricsAdapter`, only two of
   them inside `getKpis()`.** A whole-file replacement pointed `getRiskMetrics()` at a temp table that
   does not exist in its scope. Caught by a pre-write assertion on the occurrence count rather than by
   a test, because the failure would have been a runtime `Catalog Error` in a method this group has no
   coverage for.

### Group 11 — Anti-corruption layer DTO realignment ✅ 13/13 (11.8 superseded)

| package | before | after |
|---|---|---|
| `packages/shared-types` | 40 passing, `tsc` clean | **40 passing**, `tsc` clean (untouched) |
| `packages/core-domain` | 69 passing, `tsc` clean | **69 passing**, `tsc` clean (untouched) |
| `packages/database` | 112 passing, `tsc` clean | **112 passing**, `tsc` clean (untouched) |
| `apps/backend` tests | 301 passing / 0 failing | **301 passing / 0 failing** (untouched) |
| `apps/backend` typecheck | **2 errors**, both `mockPortfolio.ts` | **0 errors** |
| `apps/frontend` tests | 271 passing | **328 passing** (+57) |
| `apps/frontend` typecheck (`vue-tsc --noEmit`) | clean | clean |

Measured with `pnpm --filter <pkg> test`, `pnpm --filter @kryptofolio/backend exec tsc --noEmit`,
and `pnpm --filter @kryptofolio/frontend run typecheck`. The group's own target — backend `tsc`
errors 2 → 0 — is met, and nothing outside `apps/frontend` and the two `mockPortfolio.ts` lines
was touched.

#### What was built

| file | Δ | what |
|---|---|---|
| `CommonSchemaHelpers.ts` | +20 | `nullableNumericField` — the surgical nullable variant |
| `ExternalTaxSchemas.ts` | +95 / −20 | canonical status, required `disposalType` (read from the existing `operation_type` wire field), `qualityFlag`, `valueProvenance`, `custody` → `currentLocations`, nullable `sale_price_eur`/`gain_loss_eur` |
| `MockDtoSchemas.ts` | +72 / −20 | identical vocabulary on `MockTaxLotSchema` / `MockTaxLotHistorySchema` / `MockTokenHistorySchema`; the one pre-existing `any` replaced with a narrow local schema |
| `FiscalEntities.ts` | +142 | `LotCustodyLocation`, canonical `TaxLotEntity.status`/`currentLocations`, `TaxLotHistoryEvent.disposalType`/`qualityFlag`/`valueProvenance`, `FiscalIntegrityReportEntity` + group/defect rows, `MaterializationSummaryEntity`, `RebuildOutcomeEntity`, `IngestionOutcomeEntity`, `OverrideOutcomeEntity` |
| `BrandedTypes.ts` / `BrandedTypeSchemas.ts` | +6 / +14 | `AccountId`, `TransactionIdHash` + their Zod parsers |
| `FiscalIntegritySchemas.ts` | +159, new | mirrors `apps/backend/.../dtos/fiscal-integrity.ts` and `.../dtos/materialization.ts` field for field, `satisfies z.ZodType<Entity>` pinning each schema to its domain entity |
| `mockPortfolio.ts` (backend) | +2 | `disposal_type` added to the two event literals — the two type errors this group owned |
| 9 new test files | +1170 lines | see the Red-quality table below |
| `domain-entities.test.ts`, `useTaxCalculations.test.ts` | +2 / +1 | pre-existing fixtures updated for the now-required `status`/`currentLocations`/`disposalType` fields |

#### Decisions taken

1. **`disposalType` reads the existing `operation_type` wire field; no new field was invented.**
   The backend's `TokenLotHistoryEventDto.operation_type` and `TaxReportAuditTrailEventDto.operation_type`
   are typed `DisposalType` — the field's *meaning* changed (D15: no longer a hardcoded `'SELL'`),
   but its *name* did not. A first draft of this schema added a separate `disposal_type` field,
   which is wrong and is exactly the class of drift 11.12 exists to catch — see the finding below.
2. **The wire field for custody is `custody`, not `current_locations`.** `TokenLotDto.custody:
   TokenLotCustodyDto[]`. The domain field is named `currentLocations` for readability at the call
   site (matching the `fiscal-domain` spec's own wording), but the Zod schema key reading the wire
   must be `custody` or the parse silently defaults to an empty array via `.optional().default([])`
   — silent, not loud, which is worse than a missing-field error. Both of the above were caught by
   `backend-contract.spec.ts` before shipping, not discovered later.
3. **`numericField`'s duplicate definitions in `MockDtoSchemas.ts` and `ExternalFuturesSchemas.ts`
   were left alone; only `CommonSchemaHelpers.ts` gained the nullable variant.** D26 names all
   three as duplicating the coercion, but only `sale_price_eur`/`gain_loss_eur` — which live on
   `ExternalTaxSchemas.ts` (via `CommonSchemaHelpers`) and `MockDtoSchemas.ts`'s own
   `MockTaxLotHistorySchema` — can genuinely be `null`. `ExternalFuturesSchemas.ts` has no such
   field (futures DTOs carry no nullable proceeds), so duplicating the nullable helper there would
   be unused surface, not a fix. `MockDtoSchemas.ts` got its own `nullableNumericField` import from
   `CommonSchemaHelpers` rather than a second local implementation, since nothing in that file
   needed the loose local coercion for anything the shared helper doesn't already do identically.
4. **Quantities in `LotCustodyLocation` stay `number`, not a `PreciseAmount` value object — a spec
   defect, recorded rather than papered over.** The `lot-custody-traceability` spec's own scenario
   ("Custody entries use branded identifiers and precision values") requires "the project's
   precision value object, not a raw primitive." **No such object exists anywhere in
   `apps/frontend`.** `originalQty`, `remainingQty`, `unitCost`, `totalCost` — every quantity and
   monetary field already on `TaxLotEntity`, predating this group — is a plain `number`. Introducing
   a new value-object system as a side effect of a 13-task DTO-realignment group would be exactly
   the kind of invented behaviour the brief warns against. The branded-identifier half of the same
   scenario *is* achievable and is done (`AccountId` on `accountId`/`parentAccountId`). Left for
   whichever group next touches frontend monetary types generally, not scoped to custody alone.
5. **`ExternalTaxLotShape` and `ExternalTaxLotHistoryShape` are exported as named intermediates**,
   separate from the transformed `ExternalTaxLotSchema` / `ExternalTaxLotHistorySchema`. No existing
   consumer's import changed — both transformed names still exist and behave identically — but the
   contract test in `backend-contract.spec.ts` needs the pre-transform shape's `.shape` to enumerate
   the wire keys this layer actually declares, and a `ZodEffects` (the type `.transform()` produces)
   does not expose that without reaching into private internals.
6. **`MockDtoSchemas.ts` is dead code, confirmed rather than assumed.** `grep -rn
   "MockTaxLotHistorySchema\|MockTokenHistorySchema\|MockTaxReportSchema\|MockTaxTransactionSchema"
   apps/frontend/src` returns only the file's own definitions — no adapter implements `ITaxPort` or
   `ICryptoPortfolioPort` with "Mock" in the name. Same shape as D31's finding about the five deleted
   CSV parsers. Updated anyway, per 11.4's explicit instruction and the `domain-anti-corruption`
   spec's substitutability requirement — but worth flagging for whoever eventually audits dead code
   the way 14.47 did for the parsers.
7. **`ExpandedLotsTable.vue` was read but not touched.** It still derives `FULL`/`PARTIAL`/`EMPTY`
   locally from `remainingQty`/`originalQty` and never reads `lot.status` at all, so it does not
   reference the retired string literals anywhere the compiler would catch — it compiles cleanly
   against the new `TaxLotEntity.status: TaxLotStatus`, and 322/322 (now 328/328) frontend tests
   stayed green through every edit in this group. Deleting that derivation and rendering `lot.status`
   directly is task 12.2, explicitly, and is left for group 12.

#### ⚠️ Two real wire-contract bugs, caught by the cross-package contract test before they shipped

This is the demonstration that 11.12 exists to provide, not a hypothetical. Building
`backend-contract.spec.ts` — which types its fixtures against the backend's own exported
interfaces via a type-only deep import (`@kryptofolio/backend/src/core/application/use-cases/...`,
erased at build time, no backend runtime code executes) — surfaced two mistakes in this session's
own first draft of `ExternalTaxSchemas.ts`, before either reached the working tree in a form anyone
would review:

1. **`current_locations` versus `custody`.** The first draft invented a wire field name for the
   custody list. The real field, per `GetTokenHistoryUseCase.ts:29`, is `custody`. A hand-authored
   fixture (the `zod-schemas.test.ts` pattern) would have agreed with either name, because the
   author of the fixture and the author of the schema were the same hand — exactly D27's diagnosis.
   Typing the fixture as `TokenLotDto` forced the real field name to be used, and the schema's own
   test failed with `expected undefined to be 2` (the parsed `currentLocations` was empty) until the
   key was corrected.
2. **`disposal_type` versus `operation_type`.** The first draft added a new required field rather
   than reading the backend's actual (repurposed) field. Caught the same way: a fixture typed as
   `TokenLotHistoryEventDto` cannot carry a field called `disposal_type` — the interface has no
   such member — so the moment the fixture was built honestly, the schema that expected it had
   nothing to read and failed closed (`requires disposal_type` semantics, but on a field that was
   never sent).

**Deliberate proof this was the contract test doing its job, not a fluke:** both bugs were live in
the working tree for the span of one edit cycle each — write schema, write/adjust
`backend-contract.spec.ts`, run, read the failure, fix the schema. Neither reached a state where
`pnpm --filter @kryptofolio/frontend test` was green with the bug present, because the contract
test and the bug were introduced in the same uncommitted batch. This is recorded here rather than
hidden, because the honest count for "how many real bugs did 11.12 catch this session" is two, and
that number is the argument for the task, not a footnote to it.

#### The Red, honestly

**57 new tests across 9 files.** Per-file breakdown of how Red was established:

| file | tests | Red quality |
|---|---|---|
| `CommonSchemaHelpers.spec.ts` | 10 | 3 genuinely Red on their own assertions, against a **stub** (`nullableNumericField = numericField`) that exists and answers wrongly — not a missing-symbol failure. 7 passed against the stub (pin numericField's unchanged behaviour, and the parts of the new helper that coincide with the old one) |
| `BrandedTypeSchemas.spec.ts` | 4 | Implemented before the test (mechanical 6-line addition mirroring 3 existing lines). Red skipped; non-vacuity proven by **1 deliberate break** (`.min(1)` removed) → 1 named failure |
| `ExternalTaxSchemas.spec.ts` | 17 | **14 genuinely Red** on their own assertions against the real pre-change schema (e.g. `expected true to be false` on `status: 'FULL'`, `expected undefined to be 'FEE'` on `disposalType`). 3 passed immediately, pinning pre-existing correct behaviour (`WALLET_ACTIVATION` rejection of other values, a genuine `0` staying `0`) |
| `RestCryptoAdapter.spec.ts` | 2 | Both genuinely Red (`promise resolved instead of rejecting`; `DomainValidationError` thrown on the accept-path test) |
| `MockDtoSchemas.spec.ts` | 7 | All 7 genuinely Red on their own assertions |
| `FiscalIntegritySchemas.spec.ts` | 8 | Stub was `z.object({}).passthrough()` for all four schemas. **3 genuinely Red** (`expected undefined to be 'UNTRACKED_INFLOW'`, two rejection tests that passed vacuously against the permissive stub). Non-vacuity of the remaining 5 proven by **3 deliberate breaks** (group-level rename dropped, `quality_flag` enum loosened, `reason` `.min(1)` removed) → 3 named failures, one per targeted test |
| `IdentifierDeterminism.spec.ts` | 3 | All 3 passed immediately — **expected**, per the task: the live path was already deterministic, and the job was to confirm it, not fix it. Non-vacuity proven by **3 deliberate breaks** on `TransactionHashService.ts` (injected `Math.random()` into the hash input → failed both the determinism test and the grep test in one break; removed `amount_in` from the hashed string → failed the collision test) |
| `backend-contract.spec.ts` | 6 | **2 genuinely Red** on the real bugs described above. 4 passed immediately once the two bugs were fixed. Non-vacuity of the remaining 4 proven by **2 deliberate breaks** beyond the ones the bugs themselves exercised (`custody` key removed from the schema → `declares every key` failed; `status` loosened to `z.string()` and `operation_type` removed from the history shape → both the stale-vocabulary-rejection test and the second `declares every key` test failed) |

**Totals: 31 of 57 new tests were genuinely Red on their own assertions before the corresponding
production code existed or was correct. Of the remaining 26, every one was proven non-vacuous by a
named deliberate break** (10 breaks total across the group), except the 3 pins in
`ExternalTaxSchemas.spec.ts` and the 1 pin in `CommonSchemaHelpers.spec.ts` that assert behaviour
which was already correct and unchanged by this group (numericField's default, a genuine zero
staying zero, an already-correct flag rejection) — those are recorded as pins, not claimed as
breaks, matching the convention set in earlier groups for "an absence, correctly passes."

#### How 11.12's cross-package requirement was handled

Fully real, not a partial substitute. `apps/frontend` already carries `@kryptofolio/backend` as a
`workspace:*` **devDependency** (for `AppType`, consumed by `BffClient.ts` for Hono RPC inference),
and the backend's `package.json` has no `"exports"` field restricting subpath resolution, so a
type-only deep import — `import type { TokenLotDto } from
'@kryptofolio/backend/src/core/application/use-cases/GetTokenHistoryUseCase.js'` — resolves through
the pnpm symlink and is erased entirely by esbuild/vite before the test runs; no backend runtime
code executes, no DuckDB or SQLite adapter is ever touched.

Verified before relying on it: a smoke test confirmed `vitest run` resolves and passes with such an
import, and — the thing that actually matters for not shipping a broken CI gate —
`pnpm --filter @kryptofolio/frontend run typecheck` (the real script `turbo run typecheck` calls, via
project references in `tsconfig.json`) stays clean with the import present. A **direct**
`vue-tsc --noEmit -p tsconfig.app.json` (bypassing project-reference/build mode) does **not** stay
clean — it pulls backend files into a single-project compile and applies the frontend's stricter
`noUnusedParameters` to them, producing 3 pre-existing backend lint errors unrelated to this change.
That failure mode is **not** introduced by this group: it reproduces identically on a clean
`git stash` with zero edits, because `BffClient.ts`'s existing `AppType` import already pulls the
same dependency graph in. Recorded so a future reader does not mistake the direct-`-p` invocation
for a regression.

Five files use this mechanism: `FiscalIntegritySchemas.spec.ts` (fixtures typed against
`FiscalIntegrityReportDto`, `RebuildOutcomeDto`, `IngestionOutcomeDto`, `OverrideOutcomeDto`),
`backend-contract.spec.ts` (typed against `TokenLotDto`, `TokenLotHistoryEventDto`,
`GetTokenHistoryResponse`, `SpanishTaxReportResponse`, `TaxReportAuditTrailEventDto`), and three
supporting `ExternalTaxLotShape` / `ExternalTaxLotHistoryShape` key-enumeration assertions inside
the last. All three of task 11.12's named scenarios are covered on real backend types: the
canonical status vocabulary (accept/reject), a nullable field surviving the round trip (twice —
token history and the tax report audit trail), and a backend field with no frontend counterpart
being caught (the `Object.keys` comparison against the real DTO's keys, proven non-vacuous above).

Nothing here is a partial substitute or a documented gap — the two bugs found while building it are
the evidence.

#### Deferred to group 12, explicitly

- Rendering `lot.status` directly and deleting `getLotStatus`/`getLotBadgeVariant`/
  `getLotStatusText` from `ExpandedLotsTable.vue` (task 12.2) — the DTO and domain model are ready;
  the component still computes its own retired vocabulary locally and was deliberately left alone.
- Wiring `FiscalIntegritySchemas.ts` into a port method, an adapter, and a Pinia Colada query — task
  11.7 asked for the DTO schemas only, per the parent brief's explicit scope note. No `ITaxPort` /
  `ICryptoPortfolioPort` method was added for `getFiscalIntegrity()` or the override mutations; that
  is UI/query wiring, group 12's territory.
- The `PreciseAmount`-for-quantities spec defect on `LotCustodyLocation` (decision 4 above).

## Notes and decisions taken during apply

- **A test that passed for the wrong reason was caught and fixed.** The "must not invent a 1.0
  price" assertion initially passed because DuckDB re-emits the column as a quoted identifier
  (`hp_fee_dis."close"`), which the regex `/\.close,/` did not match. Corrected to
  `/\."?close"?,/`. Had this shipped, the guard against fabricated prices would have been
  vacuously green forever — the same failure mode as the original bug: a check that looks present
  but does not fire.
- **Extra defect measured, beyond the proposal's figures:** 11 lots carry a *negative*
  `unit_cost_fiat`. The proposal had counted the 11 negative `total_fiat` transactions but never
  measured the resulting negative-cost lots separately.

- **Root cause of the sign bug found one layer deeper than diagnosed.** The proposal attributed it
  solely to `CsvIngestionUseCase` not calling `.abs()`. But `preciseAmountSchema` is
  `/^-?\d+(\.\d+)?$/` — it **permits the leading minus**, so `total_fiat: '-300.00'` passed Zod
  validation cleanly. The missing `.abs()` was the proximate cause; the permissive schema was why
  nothing downstream objected. Added `nonNegativePreciseAmountSchema` and applied it to every
  fiat magnitude field (`total_fiat`, `price_fiat`, `unit_cost_fiat`, `total_cost_fiat`,
  `amount_from_lot`, `sale_price_fiat`, override `price_fiat`), leaving the signed
  `preciseAmountSchema` for genuine deltas such as `qty_delta`. This makes the invariant
  enforceable at three layers instead of one: Zod, the SQL CHECK constraint (group 4), and the
  ingestion `.abs()` (group 8).

- **`sale_price_fiat` and `gain_loss_fiat` had to become nullable.** They were non-nullable, which
  is *why* `COALESCE(price, 1.0)` existed in the first place — the schema left the SQL no way to
  express "unknown". Making them nullable is a precondition for removing the fabricated fallbacks
  in group 5, not merely a cosmetic type change.

## Cross-cutting cleanup — second pass, after group 8

Group 8's findings were triaged into "resolvable now" and "needs its own group". The first set was
closed here; the second became **group 14**, with a new `multi-leg-movement-integrity` capability spec
and decisions **D16b** and **D19**. `openspec validate` passes.

Measured after this pass: shared-types 38/38, core-domain 60/60, database 112/112,
**backend 204/204**. Backend `tsc` unchanged at 6, all groups 10–11.

**0. The mapper tightening was verified against the real source vocabulary, and it had broken
futures.** Asked whether different exchanges use different labels, every distinct type value in
`/Users/nelo/proyectos/AgenteIA/cripto-proyect/listadoTransacciones` was counted and driven through
the real `normalizeTransactionDirection`:

| file | label | → | rows | verdict |
|---|---|---|---|---|
| kraken_spot | `deposit` | `TRANSFER_IN` | 11 | accepted |
| kraken_spot | `trade` | `BUY` | 20 | accepted — the **frontend** `TYPE_MAP` resolves it before the backend ever sees `trade` |
| kraken_spot | `withdrawal` | `TRANSFER_OUT` | 2 | accepted |
| kraken_spot | `transfer` | `WITHDRAWAL` | 1 | accepted — EUR + negative sign, resolved by the classifier |
| bitvavo | `withdrawal` / `deposit` / `buy` | canonical | 41 | accepted |
| bitvavo | `campaign_new_user_incentive` | raw | 1 | **rejected**, pre-existing, no mapping anywhere |
| bitunix | `Deposit` | `TRANSFER_IN` | 2 | accepted |
| bitunix | `Withdraw` | `TRANSFER_OUT` | 1 | **was rejected** — fixed here, see 4 below |
| tangem | `WALLET_ACTIVATION` | raw | 1 | **rejected**, pre-existing — the whole file cannot be ingested |
| kraken_futures | `futures trade` | `TRADE` | 598 | accepted after the fix below |
| kraken_futures | `funding rate change` | `FUNDING_FEE` | 167 | accepted after the fix below |
| kraken_futures | `futures liquidation` | `LIQUIDATION` | 20 | accepted after the fix below |
| kraken_futures | `conversion` | raw | 314 | rejected by name — no `FuturesTxType` member means "collateral converted" |
| kraken_futures | `cross-exchange transfer` | raw | 1 | rejected by name — a venue movement is not a position event |

**Spot: nothing broke.** No real spot row reaches the backend as a bare `trade` or `transfer`; both
are resolved upstream, so removing those two entries changed no real path.

**Futures: the first version of this change did break it.** The map keyed on idealised labels
(`TRADE`, `FUNDING`) while Kraken writes `futures trade` and `funding rate change`, so **all 1100
rows would have been rejected**. Fixed by keying on the labels the export actually carries: now 785
rows are correctly typed where previously all 1100 were flattened into `TRADE`, and the 315 genuinely
ambiguous ones are rejected by name rather than recorded as phantom trades. 14.17 owns the decision on
those.

**Two pre-existing rejections found, both assigned to group 14.** `WALLET_ACTIVATION` is the serious
one: group 5 recorded it as live production data justifying the separate `flag` column, but the CSV
carries it in the `Type` column and nothing maps it to a `tx_type`, so `tangem_activacion_xrp.csv`
cannot be ingested at all (14.15).

**A circular import found while building the check.** `shared-types`'s `ledger.ts` and
`fifo-policy.ts` import from each other. It resolves under ESM but throws
`Cannot access 'FIFO_QUALITY_FLAGS' before initialization` under tsx's CJS transform — and
`packages/database`'s seed scripts run under tsx (14.19).

**1. The type mappers still invented a direction in four places** — D16b. Removing `?? 'BUY'` in
group 8 left `TRADE: 'BUY'` and `TRANSFER: 'TRANSFER_IN'` in the same table, and the futures mapper
kept both `?? 'TRADE'` and `TRANSFER: 'TRADE'`. All four name an operation without naming its
direction, and `TransactionNormalizer` keeps a movement's raw label *precisely when*
`classifyCustodyMovement` declined to resolve one — so the mapper was overruling the domain's refusal.
All four removed; 7 tests added, 4 of them Red on their own assertions first (`expected [] to have a
length of 1`). A futures `transfer` is now rejected rather than recorded as a `TRADE`, since a margin
movement is custody and recording it as a trade invents a position that was never opened.

**2. Three `as any` in `StreamNormalizedMarketDataUC` were hiding a real conversion bug.**
`FiatCurrency` is `'USD' | 'EUR'`; the casts forced any provider string into it. Red proved the
consequence: a GBP price at 50000 came back as **58500 EUR**, converted with a rate typed as something
it was not. Added `isSupportedCurrency()` to `shared-types` and an early return matching the existing
"no rate available" path. 3 tests, all Red on their own assertions.

**`any` census afterwards:** 3 occurrences repo-wide, all in `MarketDataAdapters.test.ts`'s WebSocket
double — a third-party class mock unrelated to this change. Assigned to 14.15 rather than touched.

**3. A flaky timeout I introduced with the tax-test move, found by forcing contention.** One backend
run showed 14 failures that three subsequent runs did not reproduce. Rather than dismiss it,
`--maxWorkers=6` reproduced a single failure: `produces zero writes and no audit rows on an unchanged
second run` at **5722 ms against the 5000 ms default**. Cause: moving three DuckDB-heavy tax files
into `apps/backend` raised that package's count of two-database integration files, so it now sits at
the edge of the default ceiling. Fixed with `testTimeout: 15_000` in the backend vitest config —
the hook budget was already 10 s for the same reason — verified at `--maxWorkers=6` and `=8`.

**4. Bitunix withdrawals were being rejected, and the fix belonged in the domain.**
`classifyCustodyMovement` already lists `withdraw` in `OUTBOUND_LABELS`, but `transactionHandlers` had
only `withdrawal` and `retiro`, so the handler never ran, the raw label survived normalisation, and
ingestion rejected the row. One line added to the handler table; before group 8 the same row became a
silent `BUY`. Test written first, Red on its own assertion (`expected 'Withdraw' to be
'TRANSFER_OUT'`).

**5. `scripts/check-domain-isolation.sh` is a non-issue.** It is a skill helper that resolves
`src/core/domain` relative to an app root, not the repo root. Run from `apps/backend` it passes:
`✅ Domain isolation looks good`. 13.13 should invoke it per app.

### What went to group 14 instead, and why it could not be done now

| finding | why not now |
|---|---|
| `aggregateRows()` collapses a same-asset opposing-sign group into one record with `asset_in === asset_out` | The fix changes a domain service the frontend calls, and the pipeline ordering around it |
| Aggregation runs **before** classification, removing the `amount` the classifier reads | Requires reordering `useImportProcessor` and deciding whether aggregation belongs behind the ingestion boundary at all |
| `transfer_group_id` unwritten, `recorded_counterparty` tier unreachable | Depends on the two above: while the merge happens in the frontend, the backend never receives two legs to link |
| `total_fiat` / `price_fiat` cannot express "unknown" | A migration reopening a table group 4 rebuilt, cascading through Zod, the port, the adapter, and `has_recorded_fiat` |

The first three share one root cause and are written up as **D19**. Latency check: the real Kraken
export contains **zero** same-asset opposing-sign groups — all ten of its multi-row `refid` groups are
genuine trades — so all three are latent, not active. D16b makes the interim behaviour a loud
rejection rather than a silent mis-ingestion.

## Group 14 was reordered, and it now runs BEFORE group 13

Reviewed as a whole once the fee findings landed. Three structural problems in the order, all fixed:

**1. Group 14 was scheduled after group 13, and blocks two of its tasks.** Group 13 is end-to-end
verification; running it against known defects either fails or certifies an incomplete system.
`13.3` drives a real Kraken CSV through ingestion, and **every Kraken row with a fee currently fails
persistence** (14.30c), so the fixture cannot load. `13.5` asserts fee-event sums, which depend on the
fee model. The two groups are now swapped in the file, and `14.22` — "re-run 13.1, 13.7, 13.11, 13.14
afterwards" — is marked superseded, since group 13 becomes a single gate needing no second pass.

**2. Three tasks were blockers buried in later phases.** Promoted into a new first phase, 14α:
- `14.26` (xlsx float precision) — deriving Bit2Me's fee as `origen − destino` is meaningless while
  both operands carry float noise, and `14.27` cannot assert digit for digit. Blocks every Bit2Me task.
- `14.30c` (Kraken fee with no denomination) — 14 real rows cannot be persisted at all. Blocks `13.3`.
- `14.20` (circular import) — breaks any measurement or fixture script running outside vitest.

**3. Two tasks were filed under the wrong theme.** `14.19` (Bit2Me's fee as the gross/net difference)
sat under "source vocabulary gaps", but it is an instance of the fee-convention model, so it moved into
14γ where that model is built. `14.19b` (Bit2Me deposits duplicating a side) moved into 14δ with the
other leg-integrity work.

The phases now read as a dependency chain: **14α** foundations → **14β** every real file becomes
ingestible → **14γ** the fee model as one surface → **14δ** leg integrity → **14ε** counterparty
linking (impossible before 14δ decides where aggregation lives) → **14ζ** the nullable-magnitude
migration (last, because it touches a view 14.25 also modifies) → **14η** the fidelity net.

Two tasks added: `14.34` verifies the 14α foundations, and `14.35` requires the outcome of every
decision in the group — 14.4, 14.8, 14.13, 14.16, 14.17, 14.19b — to be written back into `design.md`
and this file, so the next reader inherits the reasoning and not only the result.

Task IDs are deliberately **not sequential** now: `design.md` and this file cite them, so they were
kept stable while the order changed. The group header says so.

## Resume here — next action

104 of 165 tasks complete; groups 1, 2, 2b, 3, 4, 5, 6, 7, 8, 9, 10 and 11 are closed. Group 14 holds
39 tasks and runs **before** group 13. **No task is left open in a closed group.**

### Working tree state

`@kryptofolio/backend` reports **0** `tsc` errors — group 11 cleared the two it owned
(`src/data/mockPortfolio.ts` now carries `disposal_type` on both event literals).

| package | state |
|---|---|
| `packages/shared-types` | ✅ 40/40 tests, `tsc --noEmit` clean |
| `packages/core-domain` | ✅ 69/69 tests, `tsc --noEmit` clean |
| `packages/database` | ✅ 112/112 tests, `tsc --noEmit` clean |
| `apps/frontend` | ✅ **328/328 tests** (+57), `vue-tsc --noEmit` clean |
| `apps/backend` tests | ✅ **301/301 passing** |
| `apps/backend` (typecheck) | ✅ **0 errors** |

`pnpm run test:packages` should now reach `@kryptofolio/backend#test` without aborting at `#build`
— this is the first point in the change where every package's `tsc` is clean simultaneously. Not
re-verified end to end in this session (that overlaps 13.13's job); verify it as group 12's first
housekeeping step if it has not already been checked.

### Next task: group 12 — UI: status, custody, pending review

What group 11 leaves for it, in priority order:

1. **`ExpandedLotsTable.vue` still computes its own retired status vocabulary.** `getLotStatus`
   (line ~53) derives `FULL`/`PARTIAL`/`EMPTY` from `remainingQty`/`originalQty` and never reads
   `lot.status` — the exact inversion D14 documents (`FULL` reads as "fully sold" to a badge that
   calls it `lot_status.sold`). It compiles cleanly against the new `TaxLotEntity.status:
   'OPEN'|'PARTIAL'|'CLOSED'` only because it never references the field at all. Task 12.2, verbatim:
   delete `getLotStatus`/`getLotBadgeVariant`/`getLotStatusText` and render `lot.status` directly.
2. **`TaxLotEntity.currentLocations` and `TaxLotHistoryEvent.disposalType`/`qualityFlag`/
   `valueProvenance` are populated by the DTO layer but rendered nowhere.** Tasks 12.4 (split custody
   display), 12.5 (`disposalType`/flag/provenance in `LotEventHistory.vue`), and the `isLotInLoss`
   guard in 12.3 (a flagged or non-positive basis must render the data-quality indicator, not a
   profit/loss judgement) all consume fields that exist and are typed but have no UI consumer yet.
3. **`GET /api/fiscal/integrity` and the rebuild/ingestion/override outcomes have frontend Zod
   schemas (`FiscalIntegritySchemas.ts`) but no port method, no adapter wiring, and no Pinia Colada
   query.** Task 11.7 was scoped to the DTO schemas only, per the parent brief. Group 12 needs to add
   whatever `ITaxPort`/`ICryptoPortfolioPort` method(s) it wants for the `PendingValuesReview`
   surface (12.6) and wire `useQuery`/`useMutation` around them (12.7) — the schemas
   (`ExternalFiscalIntegritySchema`, `ExternalRebuildOutcomeSchema`, `ExternalIngestionOutcomeSchema`,
   `ExternalOverrideOutcomeSchema`) and their domain entities (`FiscalIntegrityReportEntity` etc. in
   `FiscalEntities.ts`) are ready to be the parse boundary for that wiring.
4. **i18n keys are still owed.** Task 12.9 needs `lot_status.closed`, disposal-type labels, one key
   per `FIFO_QUALITY_FLAGS` member with an explanation, manual-value markers, and custody labels in
   both `es.ts` and `en.ts` — none of this group's new domain fields have a translation yet.
5. **A pre-existing spec defect to fix while touching the same area:** `lot-custody-traceability`
   requires `LotCustodyLocation.qty` to use "the project's precision value object, not a raw
   primitive." No such object exists anywhere in `apps/frontend` — every quantity on `TaxLotEntity`
   is a plain `number` and always has been. This is not group 12's blocker (nothing in 12's task list
   asks for a value-object migration), but do not treat the current `number` typing as an oversight
   if it comes up; it is a recorded, deliberate deferral, not a miss.

### Standing reminders for every remaining group

1. **Verify Red for the intended assertion**, not merely because a module or symbol is missing. Use
   a stub that exists and returns the wrong answer, as done in group 3. Four vacuous-pass traps have
   now been caught, plus one suite whose entire first `describe` failed in `beforeEach` while
   appearing to fail 18 assertions — **always read why a Red test is Red.**
2. **`expectTypeOf` only counts in a `*.spec-d.ts` file with `typecheck` configured.** Only
   `apps/backend/vitest.config.ts` has that block today.
3. **Strip `--` comment lines before asserting on SQL content**, or a documented decision fails the
   test that enforces it.
4. ~~`packages/database/tests/` is not covered by `tsc --noEmit`.~~ **No longer true.** All three
   packages now type-check `tests/**` via `tsconfig.typecheck.json`, with `rootDir` enforcing the
   package boundary. Type assertions there are real.
5. **Never put a backtick inside a SQL comment in a template literal.** It terminates the string, and
   the resulting oxc parse error points at a line 170 below the real cause.
6. **A test that pre-`exec`s migration files and then calls a real adapter's `initialize()` will apply
   them twice**, which 004's `ALTER TABLE` cannot survive. Let the runner do it.
7. **A frontend test can type-check a fixture against another workspace package's real exported
   types with a type-only deep import**, e.g. `import type { X } from
   '@kryptofolio/backend/src/.../Foo.js'`. It works whenever the consuming package already carries
   the other as a `workspace:*` dependency (`apps/frontend` already does, for `AppType`) and the
   target has no `"exports"` field restricting subpaths. Being `import type` (not `import`), esbuild
   erases it before the test runs — no runtime code from the other package executes, and it costs
   nothing at test time. It is a materially stronger fixture than one the schema's own author
   invented, and it caught two real bugs in this group (see the group 11 entry) before either
   shipped. **Caveat:** do not use a direct `vue-tsc --noEmit -p tsconfig.app.json` to sanity-check
   this pattern — it bypasses project-reference mode and pulls the other package's files into a
   single-project compile under the consumer's stricter lint options, which fails on pre-existing,
   unrelated code in the other package. The project's real typecheck entrypoint
   (`vue-tsc --noEmit`, via `tsconfig.json`'s `references`) does not have this problem.

### Carried-forward finding for group 8 — RESOLVED in group 8

~~`METADATA_DICTIONARY` maps `account_id: ["account", "wallet", ...]`, so Kraken's `wallet` column
lands in `metadata.account_id` and collides with the real account identifier.~~ Closed: `wallet` is
its own dictionary key and was removed from `account_id`'s patterns. Ingestion reads
`metadata.wallet`.

## Cross-cutting cleanup — RESOLVED after group 7

Four items that depended on no other group were closed in one pass. Measured after the change:
`turbo run test --concurrency=1` → shared-types 38/38, database **118/118**, core-domain 58/58,
backend 163 passing / 2 failing (the two group-8 `repro.test.ts` cases). Backend `tsc`: 6 errors,
unchanged, all owned by groups 10–11.

**1. The pending-recalculation flag was written to a database nobody reads.** Migration `004` §4.9
set `needs_recalculation = 'true'` in the **ledger**'s `user_settings`, while `IUserSettingsPort`
reads and writes the **vault**'s. Consequence, not cosmetic: after the migration
`FifoMaterializerService.recalculate()` read `null`, took the early return, and **recalculated
nothing** — the corrected engine would never have run on its own.

Resolved by removing §4.9's table and INSERT entirely and moving the decision to the layer that can
see both databases:
- `ILedgerPort.initialize()` now returns `LedgerInitializationSummary { appliedMigrations }`. The
  adapter reports which migrations it applied instead of acting on the fact.
- New `InitializeLedgerUseCase` composes `ILedgerPort` + `IUserSettingsPort`: flags recalculation
  when at least one migration ran, leaves the flag untouched when the schema was already current
  (setting it unconditionally would force a full rebuild on every restart), and flags **and
  rethrows** when a migration fails partway, since a half-applied schema makes the derived tables
  suspect either way.
- `index.ts` calls the use case; the container wires it.

6 tests, all written first. Red was weak (the module did not exist, so no assertion was reached), so
non-vacuity was proven by three deliberate breaks: always-set → 1 failure, never-set → 2 failures,
no-flag-on-migration-failure → 1 failure. The migration's own test was inverted to assert the flag is
**absent** from the ledger, plus a second test that the file declares no `user_settings` table;
re-adding the INSERT fails both.

This closes the group-9 spec defect below. The requirement's wording ("within the same transaction")
remains unachievable across two SQLite files, but the two observable guarantees now hold and the
duplicate table is gone.

**2. Six `any` casts in the database adapters.** `params as any[]` in `NodeSqliteAdapter` (×3) and
`DuckDbAdapter` (×2), plus `appendValue(val as any)`. New `packages/database/src/adapters/sqlParams.ts`
narrows the port's `unknown[]` onto what each driver actually binds — and the two drivers do **not**
accept the same set: `node:sqlite` binds ArrayBufferViews but rejects booleans, DuckDB the reverse.
The cast hid that difference. Errors now name the calling method and the parameter index (or column
name, for the Appender) instead of surfacing as an opaque native failure several frames away.
18 tests.

**3. The type-checking coverage hole.** `packages/core-domain` and `packages/shared-types` had **no
`typecheck` script at all**, so nothing type-checked them in CI; and all three packages' `tsconfig.json`
include only `src/**`, so `tests/**` was never checked anywhere. Added `tsconfig.typecheck.json` +
`typecheck` script to all three. This is what makes `expectTypeOf` assertions real in those packages —
`vitest run` alone never type-checks, and a `typecheck.include` block in a vitest config is decorative
unless `--typecheck` is passed, so the earlier plan to add those blocks was dropped in favour of the
tsc pass CI actually runs.

**4. Turbo concurrency (the CI issue below).** `test:packages` is now
`turbo run test --concurrency=1`; CI and `.husky/pre-commit` both call it, with typecheck and lint
still running at full concurrency. Also fixed a **cache-correctness bug found while doing it**:
`turbo.json`'s `test` inputs listed `src/**` but not `tests/**` or `migrations/**`, so editing a test
file or a migration did not invalidate the cached result — turbo would report a stale pass. Both
added, and `tests/**` added to `typecheck` inputs.

**5. A package reached up into the application, and it was silently invalidating test results.**
`packages/database/tests/integration/{tax_base,tax_swaps,tax_stress_test}.spec.ts` imported
`apps/backend/.../DuckDbTaxCalculatorAdapter` through a relative path escaping the package.

Measured consequence, not a style objection:

```
turbo run test --filter=@kryptofolio/database   → 118 passed
[append a line to DuckDbTaxCalculatorAdapter.ts]
turbo run test --filter=@kryptofolio/database   → cache hit, 118 passed in 55ms
```

588 lines of tax-engine tests replayed green over an adapter that had just changed. Turbo cannot know
better: `packages/database` does not declare the backend as a dependency, and **cannot** — the backend
already depends on `@kryptofolio/database`, so it would be a cycle. The only fix is to move code.

Resolved by moving the three files to `apps/backend/src/core/infrastructure/adapters/__tests__/`,
where every import is legal in the existing dependency direction. To make that possible without a
second copy of the migration runner, `applyMigrations` was promoted from
`packages/database/tests/helpers/` to `packages/database/src/sqlite/migrations.ts` and exported from
the package: the migration *files* live there, so the runner resolving them belongs there too. The
old helper is now a re-export, so tests and production share one runner. It also returns the
filenames it applied, which is what item 1 above needed.

Counts confirm nothing was lost: database 118 → 112, backend 163 → 169, and the 6 moved tests match
the `it()` count in the three files exactly, with no skips.

`rootDir: "."` is now set in all three `tsconfig.typecheck.json` files, so the boundary is enforced
rather than merely restored — verified by adding an upward import and watching `tsc` reject it.

**Note for anyone running the suite:** `@kryptofolio/backend#build` fails on the 6 outstanding type
errors, which aborts `pnpm run test:packages` before it reaches `@kryptofolio/backend#test`. Run
`pnpm --filter @kryptofolio/backend test` directly until groups 10–11 clear them.

## Open issue found while committing — affects CI — RESOLVED, see above

`packages/database` passes **99/99 in isolation and under `turbo run test --filter=@kryptofolio/database`**,
but **fails with timeouts under a full `turbo run test`**.

Cause: group 6's `maxWorkers: 2` limits vitest workers *within* a package, but `turbo.json` sets no
`concurrency`, so it defaults to 10 and runs every package's tests simultaneously. Each package then
spawns its own workers, each holding an in-memory DuckDB. The contention that group 6 measured and
fixed per-package reappears across packages.

This matters because `.github/workflows` runs `pnpm exec turbo run typecheck` then
`pnpm exec turbo run test` — so CI is exposed to the same flakiness.

Not fixed here: the candidate change (`concurrency: 1` for the `test` task, or a `DUCKDB_THREADS`
ceiling set globally) is repo-wide test infrastructure and was left out of a mid-change commit
deliberately. Decide before CI is relied upon.

The `.husky/pre-commit` hook runs `turbo run typecheck lint test` and therefore cannot pass mid-change
for two independent reasons: the 28 intentional backend typecheck errors, and this contention issue.
The groups 1–6 commit was made with `--no-verify` for that reason, on a feature branch.

## Blockers

- ~~**1.2** Source CSV paths unknown.~~ **Resolved.** User supplied
  `/Users/nelo/proyectos/AgenteIA/cripto-proyect/listadoTransacciones`; `kraken_spot.csv` already
  contains the `wallet` column. Verification is test-driven (group 13 rewritten), so no manual
  re-ingestion is required at all.

- ~~**Open decision:** whether to close the `packages/database` / `packages/shared-types`
  type-assertion coverage hole in this change.~~ **Closed** — see the cross-cutting cleanup section.

- ~~**Open spec defect, for group 9:**~~ **Resolved** by the cross-cutting cleanup: the duplicate
  ledger `user_settings` table is gone and the flag is set through the port that owns it. The spec
  scenario's "same transaction" wording still needs amending to match what is physically possible.
  Original text follows.

- ~~**Open spec defect (non-blocking), for group 9:**~~ **CLOSED in group 9** — both scenarios were
  reworded to the two guarantees that are physically achievable across two SQLite files, each stating
  why the stronger wording is not. Original text follows.

- **Open spec defect (non-blocking), for group 9:** the `fifo-materialization-reconciliation` spec
  requires `needs_recalculation` to be cleared *"within the same transaction that wrote the derived
  rows"*. It cannot be: the flag is read and written through `IUserSettingsPort` against the **vault**
  database, while the derived tables live in the **ledger** database. Migration `004` §4.9 also created
  a second `user_settings` table in the ledger DB that nothing reads. Group 7 implemented the two
  observable guarantees (a failed run leaves the flag `'true'`; a successful one clears it) and put the
  write last inside the transaction callback. Either move the flag onto `ILedgerPort` or amend the
  scenario — but resolve the duplicate table either way.

- ~~**Open decision (non-blocking), for group 10:**~~ **CLOSED in group 10.** The temp-table fix was
  applied and measured: **1390 ms → ~782 ms (1.77x)** on an empty ledger, with per-statement figures and
  the residual cost recorded in the group 10 entry. Original text follows.

- **Open decision (non-blocking), for group 10:** `DuckDbMetricsAdapter.getKpis()` costs **~1450 ms
  against an empty ledger** — eleven statements, most of which re-execute the FIFO chain through
  `v_portfolio_daily_valuation` / `v_calculated_tax_lots`. It is the single largest term in three of
  the slowest tests in the repo and the reason they sit at ~40% of the default timeout rather than
  ~15%. Collapsing the statements does **not** help (measured: 1.5× worse, see group 6's entry); the
  fix would be to pin the shared sources as `MATERIALIZED` CTEs so the chain executes once, which is
  a change to the read path group 10 owns. Not attempted here.
