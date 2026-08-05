## Why

`apps/frontend/src/core/domain/models/FiscalEntities.ts` types every fiscal amount — a lot's
`unitCost`/`totalCost`, a disposal's `salePriceEur`/`gainLossEur`, a tax report's
`capitalGainsEur`/`estimatedIrpfEur`, a derivative's `realizedPnl`/`funding` — as a bare `number`.
`openspec/specs/domain-financial-precision/spec.md`'s "Financial Arithmetic Encapsulation" requirement
already forbids this: "Native JavaScript `number` types SHALL NOT be used for any financial
calculations to prevent IEEE-754 precision loss." `FiscalEntities.ts` is currently non-compliant with
its own project's spec, not merely stylistically behind it.

This was found while auditing `fix-fifo-transfer-traceability`'s task 14.36b, whose own text corrected
an earlier claim in that change's history: `packages/core-domain/src/value-objects/Money.ts` is not
"unbuilt, unavailable, or hypothetical." It is a real, working value object — wraps `decimal.js`
privately, validates via `preciseAmountSchema` on construction, full `add`/`sub`/`mul`/`div`/`equals`
arithmetic — and `packages/core-domain/src/domain/models/MoneyEntities.ts` already builds
`FiatMoney`/`ExchangeRate` on top of it. `apps/frontend` already depends on `@kryptofolio/core-domain`
(`workspace:*`) and already imports and uses `Money`, `CurrencyConverter` and `FiatCurrency` from it in
`views/Settings/components/CurrencySettings.vue`. Adopting it in `FiscalEntities.ts` is one workspace
import away, not a new dependency.

**Why this is a correctness-of-model change, not a bug fix, and why it is its own change rather than a
14η task.** No defect has been measured from `FiscalEntities.ts`'s numbers today — the backend already
sends fiscal amounts as `PreciseAmount` strings over the wire, and the frontend DTO layer
(`ExternalTaxSchemas.ts`, `FiscalIntegritySchemas.ts`) is where those strings are currently converted to
`number` before reaching the domain model. The risk is latent, not active: a report totalling many lots,
or a UI computation performed directly on these numbers rather than on the DTO's original string, is
where IEEE-754 loss would first become visible, and nothing in the current call graph has been measured
to do that yet. Folding this into 14η would mean re-typing roughly a dozen fields across
`FiscalEntities.ts` and updating every one of their ~8 downstream consumers
(`useTaxCalculations.ts`, `TaxReportDetailsTable.vue`, `ExpandedLotsTable.vue`, `LotEventHistory.vue`,
`TokenSalesHistory.vue`, `TokenActiveLots.vue`, `CryptoKpiCards.vue`, and the DTO modules that construct
these entities) in the middle of a change already carrying nine unrelated closeout tasks — exactly the
kind of scope creep `fix-fifo-transfer-traceability`'s own working method warns against.

## What Changes

- Replace `number` with `Money` (or a thinner `PreciseAmount`-typed wrapper, decided in `design.md`) on
  every genuinely monetary/quantity field in `FiscalEntities.ts`: `TaxDerivativeEntity.tradePrice`,
  `.realizedPnl`, `.fees`, `.funding`; `TaxTransactionEntity.amount`, `.totalEur`, `.priceEur`,
  `.feeEur`, `.amountIn`, `.amountOut`; `TaxLotEntity.qty`, `.originalQty`, `.remainingQty`,
  `.unitCost`, `.totalCost`; `TaxLotHistoryEvent.amountFromLot`, `.salePriceEur`, `.gainLossEur`,
  `.saleFeeEur`; `TaxReportSummary.capitalGainsEur`, `.capitalLossesEur`, `.savingsBaseYieldsEur`,
  `.generalBaseAirdropsEur`, `.netPatrimonialResultEur`, `.estimatedIrpfEur`.
- Leave every genuinely-integer field alone: `year`, `count`, `pendingReview`, `totalDefects`,
  `processedCount`, `excludedFlaggedEvents`, `excludedUnresolvedIncomeCount`, the four
  `ReconciliationSummaryEntity` counters. None of these is a fiscal magnitude.
- Update the DTO layer (`ExternalTaxSchemas.ts` and any other module constructing these entities) to
  construct `Money` from the wire string directly, rather than parsing to `number` first and typing the
  entity around that loss.
- Update every downstream consumer to call `Money`'s arithmetic (`add`/`sub`/`mul`/`div`) and a
  formatting adapter instead of native `+`/`-`/`*`/`/` and `toFixed`/`toLocaleString`.
- Preserve the `null` states this change's parent work (`fix-fifo-transfer-traceability` D26/14ζ)
  deliberately introduced: `salePriceEur: Money | null`, `gainLossEur: Money | null` — adopting `Money`
  must not silently re-collapse a genuinely-unresolved figure into `0`.

## Capabilities

### Modified Capabilities
- `domain-financial-precision`: the frontend's fiscal domain model becomes compliant with the
  requirement it already states.

## Impact

- **Frontend only.** No backend, database, or wire-contract change — the backend already sends
  `PreciseAmount` strings; this changes only how the frontend *models* what it already receives.
- **~8 consumers to update**, named above, none of them a port or an adapter boundary — all are
  presentation-layer reads of an entity this change retypes.
- **Prerequisite**: none technically, but sequenced after `fix-fifo-transfer-traceability` so it does
  not compete with that change's own in-flight edits to `FiscalEntities.ts` (the nullable
  `salePriceEur`/`gainLossEur` fields it introduced).
