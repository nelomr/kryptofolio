---
"@kryptofolio/frontend": patch
"@kryptofolio/backend": patch
"@kryptofolio/core-domain": patch
"@kryptofolio/shared-types": patch
---

Migrated the frontend's fiscal domain model (tax transactions, tax lots, lot history events, custody
locations, futures/derivatives) from raw `number` fields to the `Money` value object, so a fiscal
figure can no longer lose precision to a float round-trip once it reaches the UI. Backend:
`GetTokenHistoryUseCase`'s six wire fields change shape from `number` to `string` (compatible in
both directions, since the frontend's helpers already accept either) and drop a `sale_fee` key that
was never assigned; `GetSpanishTaxReportUseCase`'s `sale_fee` becomes `ConvertedAmount | null` and no
longer fabricates a zero when no fee resolved. Seven table columns across three tables (the
transactions table's Total/Price/Amount, the tax report details table's Fee, and the derivatives
table's Amount/PnL/Fees+Funding) now render an em dash for a genuinely unresolved figure instead of a
misleading `€0.00`/`0` — a deliberate, audited rendering change, not a regression. No database
schema, persisted data shape, or calculated fiscal figure (AEAT bases, totals, estimated IRPF)
changed; every retyped field was already display-only.
