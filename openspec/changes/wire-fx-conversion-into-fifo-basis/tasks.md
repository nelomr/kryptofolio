## 0. Baseline

- [x] 0.1 Archive order settled and recorded in `design.md`: `fix-fifo-transfer-traceability` archives first, this change last, so its `MODIFIED` blocks are the version that survives. An archive-time concern only — it gates nothing in the implementation.
- [x] 0.2 Capture the baseline on the real ledger and commit it to this change directory: counts of `tax_lots` by `quality_flag`, how many carry `unit_cost_fiat = 0`, and the same for `lot_history_events`. Nothing in this change can be shown to have worked without a before figure.
- [x] 0.3 Confirm the test/typecheck baseline is green (`pnpm test`, `pnpm typecheck`) so "still green" has a meaning.

## 1. Vocabularies in shared-types

- [x] 1.1 Add `MISSING_FX_RATE` to `FIFO_QUALITY_FLAGS` in `packages/shared-types/src/schemas/fifo-policy.ts`, with a doc comment stating how it differs from `MISSING_PRICE` (price absent vs rate absent — different remedies).
- [x] 1.2 Add `MISSING_FX_RATE: 'medium'` to `FLAG_SEVERITY`, matching `MISSING_PRICE`.
- [x] 1.3 Add `MARKET_CONVERTED` to `MANUAL_VALUE_PROVENANCE`, and rename nothing else — the existing `MARKET` and `MANUAL` members keep their meaning.
- [x] 1.4 Write the failing test first: assert every flag has a severity and that the two vocabularies are exhaustive, and watch it go red before adding the members.

## 2. SQLite schema

- [x] 2.1 Write a migration that rebuilds `tax_lots` and `lot_history_events` with the widened `quality_flag` and `value_provenance` `CHECK` vocabularies. A `CHECK` cannot be `ALTER`ed, only rebuilt — do both tables in the one migration.
- [x] 2.2 In the same migration, add `fx_rate` and `fx_rate_date` to both tables, nullable, with the same `GLOB` numeric constraint style the existing decimal columns use.
- [x] 2.3 Add a test asserting the migration is idempotent when run twice, and that the rebuilt tables reject a flag outside the vocabulary and accept `MISSING_FX_RATE`.
- [x] 2.4 Prove the `CHECK` can fail: insert `MARKET_CONVERTED` before the migration and confirm it is rejected, then after and confirm it is accepted.

## 3. FX ledger is written by the running system

- [x] 3.1 Extend the port `FetchAndStoreExchangeRatesUC` writes through so it can upsert a dated rate, keeping the KV-store write it already performs. Keep the port an interface in `domain/ports/`; the SQLite write belongs to the adapter.
- [x] 3.2 Write the failing test first: the use case, given a fetched rate and publication date, upserts `(date, pair)` into `exchange_rates` and is idempotent on a second run for the same date.
- [x] 3.3 Preserve the published-vs-carried-forward distinction in `source` (`ECB` vs `ECB_PRIOR_DAY`), rather than labelling every row `ECB`. Assert it in the test.
- [x] 3.4 Verify against the running backend that a boot fetch leaves a row in `exchange_rates`, read from a second process so the write is genuinely committed.
- [x] 3.5 Run `pnpm seed:ecb-rates` afterwards and confirm it reports the already-written rows as skipped duplicates, not as conflicts.

## 4. Rate resolution in the view graph

- [x] 4.1 Add an integration test (`packages/database/tests/integration/`) that seeds a ledger with a EUR-reporting acquisition, a USD price row via `_price_seed`, and a `USD/EUR` rate, and asserts the resulting lot's `unit_cost_fiat` is the converted euro figure. Watch it fail for the stated reason — the basis masked to `0` with `CURRENCY_MISMATCH` — before implementing.
- [x] 4.2 Add the rate join to `acquisition_priced`: `ASOF LEFT JOIN ledger.exchange_rates` on the normalised pair, `CAST(date AS DATE) <= tx_date`, most recent first. Cast the `TEXT` date as the valuation view already does.
- [x] 4.3 Resolve the reciprocal pair with `1 / rate` when the direct pair is absent, and mark which of the two was used so provenance can record it.
- [x] 4.4 Add a test that the reciprocal path is only taken when the direct pair is missing, and that a direct rate is never inverted.
- [x] 4.5 Add a test that a rate dated *after* the transaction is never used, seeding only a later rate and asserting `MISSING_FX_RATE`.

## 5. Conversion at each valuation site

- [x] 5.1 Convert the acquisition price in `acquisition_resolved`, in `DECIMAL(38,18)` — and replace the existing `TRY_CAST(market_price_in AS DOUBLE)` while there, per the design decision. A float multiplication has no place in a cost basis.
- [x] 5.2 Add a test that would fail if the multiplication were inverted: for a rate below 1, the converted euro figure MUST be smaller than its USD source.
- [x] 5.3 Convert the disposal price in `disposal_priced`, with a test that a disposal and its matched lot are both stated in the reporting currency and the gain is their difference.
- [x] 5.4 Convert the fee price, with a test that the fee component of the basis and the fee disposal use the *same* resolved rate — so a fee cannot be valued at one rate as an expense and another as a disposal.
- [x] 5.5 Add a test that a recorded `total_fiat` is never converted, even when a rate exists.
- [x] 5.6 Add a test that a series already in the reporting currency resolves with no row in `exchange_rates` at all.

## 6. Flags and provenance

- [x] 6.1 Narrow `currency_mismatch` in `v_calculated_tax_lots` and `v_calculated_lot_history_events` to the manual-override case (`override_currency_differs`), and raise `MISSING_FX_RATE` where a conversion was required and no rate resolved.
- [x] 6.2 Add a test for each of the three outcomes on one fixture: convertible (no flag, real basis, taxable), no rate (`MISSING_FX_RATE`, masked, non-taxable), override in a foreign currency (`CURRENCY_MISMATCH`, masked, non-taxable).
- [x] 6.3 Emit `value_provenance = 'MARKET_CONVERTED'` with `fx_rate` and `fx_rate_date` populated for a converted figure, and `NULL` rates for an unconverted one.
- [x] 6.4 Add a test that recomputes a stored basis from its quantity, series price and recorded rate and reproduces the stored figure — the reproducibility requirement, made executable.
- [ ] 6.5 Carry the two new columns through `FifoMaterializerService` and `SQLiteLedgerAdapter`'s reconcile paths without widening any type to `any`.

## 7. Precision and formatting

- [x] 7.1 Raise the `PRINTF('%.12f', …)` formatting to 18 decimals wherever a monetary figure is written, matching the `DECIMAL(38,18)` columns it lands in.
- [x] 7.2 Add a test that a converted unit cost of the order of `1e-9` survives the round trip into SQLite as a plain decimal string satisfying the column's `GLOB` constraint, not scientific notation.
- [x] 7.3 Flag rather than persist a non-zero figure that still formats to zero, and add the test for it. An unflagged zero must always mean "genuinely free".
- [x] 7.4 Re-run the existing FIFO integration suites and confirm the widened precision did not move any figure they assert. If one moves, decide whether the old assertion encoded the truncation, and record which.

## 8. Frontend surface

- [ ] 8.1 Extend the frontend quality-flag union and its Zod DTO so `MISSING_FX_RATE` and `MARKET_CONVERTED` parse, never as a bare `string`.
- [x] 8.2 Add i18n labels and descriptions for both, in `en` and `es`, in the same change — a flag with no label renders as an unknown string to the user.
- [ ] 8.3 Show the rate and its date wherever a converted figure is presented in the audit trail, so a user can see how the number was reached.
- [ ] 8.4 Verify a nullable rate renders as absent rather than as `0` — `null >= 0` is `true` in JavaScript, and this project has shipped that bug.

## 9. Rebuild and verification on real data

- [ ] 9.1 Force a full FIFO rebuild against the real ledger and record the after figures for the same counts captured in 0.2.
- [ ] 9.2 Verify one converted lot by hand against its source file and the ECB rate for its date, digit for digit — not against a fixture.
- [ ] 9.3 Report what remains flagged and why, per flag and per asset, including any asset whose price series does not cover its earliest transaction. No silent residue.
- [ ] 9.4 Run `pnpm typecheck` and `pnpm test` across the workspace and confirm both green.
- [ ] 9.5 Grep the diff for `: any`, `as any`, `<any>` and `, any>` and confirm none were introduced.

## 10. Documentation

- [ ] 10.1 Document the conversion in `docs/fifo-tax-engine.md`: where it happens, how a rate is resolved, what each of the three currency outcomes means, and how to reproduce a converted figure.
- [ ] 10.2 Update `docs/architecture/duckdb-*.md` for the new join in the view graph.
- [ ] 10.3 Document in `docs/backend.md` that the FX ledger is now maintained by the running backend, with the seed script as the backfill path for history predating first install.
