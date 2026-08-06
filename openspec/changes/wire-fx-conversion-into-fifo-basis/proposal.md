## Why

The FIFO engine values an acquisition from a historical price series, compares that series' currency with the transaction's reporting currency, and — when they differ — raises `CURRENCY_MISMATCH` and writes a cost basis of `0`. It never converts, even though `ledger.exchange_rates` exists for exactly that purpose: migration `003_currency_schema.sql` introduces the table as a *"hard prerequisite for Phase 2B ASOF JOIN multi-currency conversions"*, and that phase was never built.

The consequence, measured on the real ledger after the ingestion defects were fixed (2026-08-05): **544 of 578 tax lots carry `unit_cost_fiat = 0` and `quality_flag = 'CURRENCY_MISMATCH'`** — every lot whose value has to come from a price series rather than from the source row. The price is there and the rate is there; only the multiplication is missing. Running the engine's own SQL by hand against the live database returns a basis of `0.001238332817` for a B2M staking reward that the ledger stores as `0`.

The zero is not a lost computation: `tax_lots.unit_cost_fiat` is `NOT NULL` with a non-negative `CHECK`, so an unresolved basis cannot be expressed in the number, and `v_calculated_tax_lots` deliberately masks it (`CASE WHEN quality_flag IS NULL THEN raw_unit_cost_fiat ELSE '0' END`). That masking is correct for a genuinely unresolvable value. It is wrong here, because the value *is* resolvable — which means the largest part of the portfolio has no cost basis, every average cost reads as zero, and any gain computed from it would be the full disposal proceeds.

`market-data-fiat-normalization` already requires this conversion for *live* prices. The historical path never got it.

## What Changes

- Convert a historical market price into the transaction's reporting currency inside the FIFO valuation path, using the daily rate from `ledger.exchange_rates`, before it becomes a cost basis or a disposal value. Applies to all three valuation sites: the acquisition price, the disposal price, and the crypto-fee price.
- **BREAKING (reported figures)**: `CURRENCY_MISMATCH` narrows from "the series currency differs from the reporting currency" to "…and no rate could be resolved for that pair and date". Lots that carry the flag today and are convertible will gain a real cost basis, and the flag will clear. This changes every affected cost basis, average cost, and realised gain — the reason it is a spec change and not a patch.
- Raise `MISSING_FX_RATE` where a conversion is required but no rate exists, so "we hold no rate for this pair" stops being indistinguishable from "the currencies disagree and we refuse to look".
- Populate `ledger.exchange_rates` from the running backend. Today the table is only ever written by `pnpm seed:ecb-rates`; a fresh install has an empty FX ledger and therefore no convertible price at all. The live ECB job writes a single current rate to the KV store, which cannot value a two-year-old acquisition.
- Record the conversion in the audit trail: a converted value SHALL state the rate and date it used, so a tax figure derived from a conversion can be reproduced years later.

## Capabilities

### New Capabilities
- `fifo-fx-conversion`: converting a historical market price into the reporting currency within the FIFO valuation path — rate resolution by pair and date, the arithmetic and its precision, what happens when no rate exists, and the provenance a converted figure must carry.

### Modified Capabilities
- `fifo-data-quality-flags`: the `Currency Mismatch` requirement currently states *"conversion MUST NOT be attempted by this capability"* and triggers the flag on a currency difference alone. Both clauses change: conversion is attempted first, and the flag becomes the residue of a conversion that could not be performed. Adds `MISSING_FX_RATE` to `FIFO_QUALITY_FLAGS`. **This capability is introduced by the in-flight `fix-fifo-transfer-traceability` change and does not exist in `openspec/specs/` yet — see design.md for the sequencing constraint.**
- `fiat-exchange-rates`: adds a requirement that the historical daily FX ledger is maintained by the running system, distinct from the single current rate the existing requirement covers.
- `spot-fifo-tax-calculator`: `Spot FIFO Lots Resolution` and `Crypto-Fee Disposal Generation` gain the conversion step in the valuation they specify, so a cost basis is stated in the reporting currency whatever currency the series used.

## Impact

- `packages/database/src/adapters/DuckDbAdapter.ts` — the view graph: `acquisition_priced`, `acquisition_resolved`, `disposal_priced`, the fee valuation, and the `currency_mismatch` expressions in `v_calculated_tax_lots` / `v_calculated_lot_history_events`.
- `packages/shared-types/src/schemas/fifo-policy.ts` — `FIFO_QUALITY_FLAGS` and `FLAG_SEVERITY` gain `MISSING_FX_RATE`.
- `packages/database/migrations/sqlite/` — a new migration for the flag vocabulary `CHECK` on `tax_lots` and `lot_history_events` (a `CHECK` cannot be `ALTER`ed, only rebuilt), and for any provenance column the design settles on.
- `apps/backend/src/core/application/use-cases/FetchAndStoreExchangeRatesUC.ts` and its port — writing the daily rate to the FX ledger as well as the KV store.
- `packages/database/scripts/seed_ecb_rates.ts` — remains the backfill path for history predating first install.
- Frontend: the quality-flag union, its i18n labels, and any component that renders a flag badge or reads `unitCostFiat`.
- `docs/fifo-tax-engine.md` and `docs/architecture/duckdb-*.md`.
- Requires a full FIFO rebuild after deployment; every existing lot's basis is recomputed.
