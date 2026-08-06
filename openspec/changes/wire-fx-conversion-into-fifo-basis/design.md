## Context

The FIFO engine resolves a price for an acquisition or disposal with an `ASOF LEFT JOIN` against `historical_prices`, then values the quantity with it. `historical_prices` carries a `currency` column, and the engine reads it — but only to compare it with the transaction's `fiat_currency` and raise `CURRENCY_MISMATCH` when they differ. `ledger.exchange_rates` (migration `003_currency_schema.sql`, described there as a *"hard prerequisite for Phase 2B ASOF JOIN multi-currency conversions"*) is joined in exactly one place: the daily portfolio valuation view. The FIFO valuation path never touches it.

Measured on the live ledger on 2026-08-05, after the ingestion defects were fixed: 578 tax lots, of which **544 carry `unit_cost_fiat = 0` and `quality_flag = 'CURRENCY_MISMATCH'`**. Running the engine's own CTEs by hand against that database returns `0.001238332817` for a B2M staking reward stored as `0` — the price resolves (`0.015692281 USD`), the rate exists (`USD/EUR = 0.918695`), and nothing multiplies them.

Three constraints shape the design:

- `tax_lots.unit_cost_fiat` is `NOT NULL` with a non-negative `GLOB` `CHECK`. An unresolved basis cannot be represented in the number, which is why `v_calculated_tax_lots` masks a flagged lot's basis to `'0'` and why the flag — not the figure — is the carrier of "we do not know". That masking stays; what changes is how few lots need it.
- The price series is mixed by construction. `data/historical/prices` is assembled from CoinMarketCap exports (written as USD) and an oracle backup (which states `price_eur`, `price_usd`, or both). After the current seeder fix the tree holds 8 884 USD rows and 2 656 EUR rows, and one symbol can have rows of each — B2M has both.
- The ECB publishes EUR-based rates only, so `exchange_rates` holds `USD/EUR` and never `EUR/USD`.

The `fifo-data-quality-flags` capability being modified here is introduced by the in-flight `fix-fifo-transfer-traceability` change and does not exist in `openspec/specs/` yet.

## Goals / Non-Goals

**Goals:**
- A cost basis and a disposal value stated in the transaction's reporting currency, whatever currency the price series used.
- `CURRENCY_MISMATCH` reduced to the cases conversion genuinely cannot address, with a missing rate reported as its own distinct defect.
- A converted figure reproducible from the ledger years later, without re-fetching reference data.
- The FX ledger maintained by the running system, so a fresh install is not silently dependent on someone having run a seed script.

**Non-Goals:**
- Fetching or backfilling rates for pairs beyond what the ECB feed provides. A `GBP/EUR` gap stays a gap, reported as `MISSING_FX_RATE`.
- Changing how a price series is resolved (the `ASOF` price join, its symbol matching, or its date semantics).
- Changing the masking rule itself, or making `unit_cost_fiat` nullable. That is a schema question this change deliberately leaves alone.
- Re-denominating the ledger. `fiat_currency` remains per transaction; this change converts *into* it, never away from it.
- Converting a figure the source itself stated. A recorded `total_fiat` is already in the reporting currency.

## Decisions

### Archive order: `fix-fifo-transfer-traceability` first, this change last

Settled with the maintainer on 2026-08-05. `fix-fifo-transfer-traceability` archives first, creating `openspec/specs/fifo-data-quality-flags/spec.md` with its original text; this change archives afterwards, so its `MODIFIED` blocks land on top and are the version that survives.

This is why the `fifo-data-quality-flags` delta carries each modified requirement in full — every scenario, including the ones this change leaves untouched — rather than only the clauses that differ. A partial `MODIFIED` block would drop the older change's detail at archive time, and the ordering makes this delta the last writer.

Nothing in the implementation depends on the order; it is an archive-time concern only, so work can proceed while the other change closes its remaining tasks.

### The conversion happens in the DuckDB view, not in Node

The rate is a dated row joined to a dated event — an analytical join over the same relations the price join already walks. Doing it in Node would mean shipping every candidate price and rate across the port boundary to multiply pairs of them, and would put a monetary derivation outside the engine that the rest of the FIFO graph is expressed in.

*Alternative considered:* resolve rates in the materialiser with `Decimal.js`, where `Money` already lives. Rejected: the materialiser consumes finished events, and moving valuation there splits the engine across two languages with two rounding regimes.

### The multiplication stays in DECIMAL, and the existing `DOUBLE` cast is a defect to fix in passing

`acquisition_resolved` currently computes the basis as `qty_in * TRY_CAST(a.market_price_in AS DOUBLE)` — a float multiplication in a tax figure, against a `DECIMAL(38,18)` column. Introducing a second float multiplication for the rate would compound it. The conversion and the valuation are therefore both expressed in `DECIMAL(38,18)`.

*Alternative considered:* leave the `DOUBLE` casts alone and convert in `DOUBLE` for consistency. Rejected: this repository's precision rule exists because `2.236429 − 1.536429` is `0.7000000000000002` in float64, and a basis is the number every gain is derived from.

### Rate resolution: `ASOF LEFT JOIN` on a normalised pair, direct then reciprocal

`exchange_rates.date` is `TEXT`; it is cast to `DATE` for the join, matching what the valuation view already does. The pair is built as `<series currency>/<reporting currency>`. Because the ECB publishes EUR-based rates only, a direct lookup would leave a USD-reporting user with no coverage at all, so resolution falls back to the reciprocal pair with `1 / rate`.

The reciprocal is a second-class result and is recorded as such: reciprocating a rate published to six decimal places loses precision that the direct rate would not, and a reader auditing a figure is entitled to know which was used.

*Alternatives considered:* (a) direct pair only — rejected, it silently makes the feature EUR-only while appearing general; (b) store both directions at write time — rejected, it doubles the FX ledger to encode a fact derivable at read time, and an inverted row is not something the ECB published.

### `MISSING_FX_RATE` is a new flag rather than a reuse of `MISSING_PRICE`

They fail differently and are fixed differently: `MISSING_PRICE` means no price series covers the asset at that date, and is resolved by seeding prices; `MISSING_FX_RATE` means the price exists but the pair or date is absent from the FX ledger, and is resolved by seeding rates. Collapsing them would send a user to the wrong remedy.

Severity matches `MISSING_PRICE` (`medium`): both mean a figure is unknown, neither means a figure is wrong.

*Alternative considered:* keep raising `CURRENCY_MISMATCH` when no rate exists. Rejected: that is the string this change exists to stop overloading — it currently means "differs", will mean "differs irreconcilably", and would then also mean "we lack a rate".

### `CURRENCY_MISMATCH` survives, scoped to a manual override in a foreign currency

`override_currency_differs` already exists in `tx_context`. A user-declared price stated in a currency other than the transaction's is a contradiction in the *input*, not a gap in reference data — converting it would be guessing which of the two the user meant. So the flag keeps a real, narrower job rather than being removed.

### Provenance: a named provenance member plus the rate and its date

`value_provenance` gains `MARKET_CONVERTED`, alongside the existing `MARKET` and `MANUAL`. The rate and rate date are persisted as their own columns on `tax_lots` and `lot_history_events`, `NULL` when no conversion took place.

A named member alone would say a conversion happened without letting anyone reproduce it; columns alone would leave a reader inferring "converted" from a non-`NULL` rate. Both are cheap, and reproducibility of a tax figure is the point.

*Alternative considered:* a JSON provenance blob. Rejected: the ledger's `STRICT` tables and `GLOB`-constrained numeric columns exist precisely so a figure is queryable and constrained, and a blob is neither.

`CHECK` constraints cannot be `ALTER`ed in SQLite, only rebuilt, so both the widened flag vocabulary and the widened provenance vocabulary require a table rebuild in one migration.

### Formatting precision rises from 12 to 18 decimals, and a value that rounds away is flagged

The engine writes figures through `PRINTF('%.12f', …)` into `DECIMAL(38,18)` columns. A converted micro-price can be non-zero and still round to `0.000000000000` at twelve places — which would store a silent zero on an *unflagged* lot, the exact confusion this change is removing. Formatting moves to 18 decimals to match the column, and a non-zero figure that still formats to zero is flagged rather than persisted as zero.

*Alternative considered:* clamp tiny values to the smallest representable figure. Rejected: inventing a floor is a fabricated basis, and the flag mechanism already exists to say "not representable".

### The FX ledger is written by the boot fetch; the seed script stays as backfill

`FetchAndStoreExchangeRatesUC` writes only the current rate to the KV store today, so a fresh install has an empty `exchange_rates` and no convertible price at all. It gains an idempotent upsert into the FX ledger, keyed on `(date, pair)` — the table's own primary key, so `INSERT OR IGNORE` suffices and the ledger stays append-only in practice. `pnpm seed:ecb-rates` remains the only way to obtain history predating first install.

`source` already distinguishes `ECB` from `ECB_PRIOR_DAY` in the existing backup data, which is the carried-forward marker the spec requires; the use case must preserve that distinction rather than labelling everything `ECB`.

## Risks / Trade-offs

- **Every reported cost basis and gain changes.** → This is the intended effect, but it must be visible: the migration plan requires capturing the before/after distribution of flags and bases on the real ledger, and the change is not complete until those numbers are stated in the verification report. A user who has filed a tax return from the current figures needs to know they moved.
- **A wrong rate direction silently scales every figure by ~0.92 or ~1.09.** → The direction is verifiable against the data (`USD/EUR = 0.918695` on 2024-11-01, i.e. `EUR = USD × rate`) and gets a test that would fail if the multiplication were inverted, asserting a converted euro figure is *smaller* than its USD source for a rate below 1.
- **One symbol can hold both USD and EUR rows, so the `ASOF` price join may return either denomination for adjacent dates.** → Correctness does not depend on which it returns, because the conversion is driven by the row's own `currency`. But a series that flips denomination mid-stream can produce two slightly different values for the same day, so a task exists to report per-symbol denomination mixing and decide whether the price seeder should prefer one source per symbol.
- **The reciprocal path loses precision.** → Recorded as its own provenance so it is auditable, and out of scope to improve until a non-EUR reporting currency is actually in use.
- **Widening two `CHECK` vocabularies means rebuilding `tax_lots` and `lot_history_events`.** → Both are derived tables, re-materialisable from SQLite by definition, so the migration can rebuild them empty and let the first rebuild refill them. The migration must still be written so a partially applied run leaves a consistent schema.
- **`MISSING_FX_RATE` will appear on rows that previously showed `CURRENCY_MISMATCH`, which reads like a new problem.** → The frontend needs its label and severity in the same change, not after it, so the flag never renders as an unknown string.

## Migration Plan

1. Land the flag and provenance vocabularies in `shared-types` first, so the SQLite `CHECK` migration and the DuckDB views agree from the start.
2. Rebuild the two derived tables in one migration, widening both vocabularies and adding the rate columns.
3. Write the FX ledger from the boot fetch, and backfill with `pnpm seed:ecb-rates`, before touching the engine — so the conversion has data to resolve the moment it exists.
4. Wire the conversion into the views behind its tests, one valuation site at a time (acquisition, disposal, fee), each independently verifiable.
5. Force a full FIFO rebuild and record the before/after flag and basis distribution on the real ledger.
6. **Rollback:** the derived tables are re-materialisable, so reverting the views and rebuilding restores the previous figures. The FX ledger rows and the widened vocabularies are additive and can stay.

## Open Questions

- Should the price seeder prefer a single denomination per symbol, given B2M currently carries both USD and EUR rows from two sources? Deferred to the mixing report in the tasks; it does not block the conversion, which is driven per row.
