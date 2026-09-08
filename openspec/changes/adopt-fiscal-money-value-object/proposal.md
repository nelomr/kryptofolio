## Why

`apps/frontend/src/core/domain/models/FiscalEntities.ts` types fiscal magnitudes — a lot's
`unitCost`/`totalCost`, a derivative's `realizedPnl`/`funding`, a transaction's `totalEur`/`priceEur`,
a relocation's `qty` — as a bare `number`.
`openspec/specs/domain-financial-precision/spec.md`'s "Financial Arithmetic Encapsulation" requirement
already forbids this: "Native JavaScript `number` types SHALL NOT be used for any financial
calculations to prevent IEEE-754 precision loss." `FiscalEntities.ts` is currently non-compliant with
its own project's spec, not merely stylistically behind it.

`packages/core-domain/src/value-objects/Money.ts` is a real, working value object — it wraps
`decimal.js` privately, validates via `preciseAmountSchema` on construction, and offers
`add`/`sub`/`mul`/`div`/`equals`/`toString` — and `packages/core-domain/src/domain/models/MoneyEntities.ts`
already builds `FiatMoney`/`ExchangeRate` on top of it. `apps/frontend` already depends on
`@kryptofolio/core-domain` (`workspace:*`) and already imports `Money`, `CurrencyConverter` and
`FiatCurrency` from it in `views/Settings/components/CurrencySettings.vue`. Adopting it in
`FiscalEntities.ts` is one workspace import away, not a new dependency.

**Two precision losses here are measured, not hypothetical.** An earlier revision of this proposal
claimed the risk was purely latent because "the backend already sends fiscal amounts as decimal
strings." That claim was made by reading the *consumer* schema (`ExternalTaxSchemas.ts`) rather than
the *emitter* — the exact failure CLAUDE.md's working method 5 warns about. Measured in the emitter:

- `apps/backend/src/core/application/use-cases/GetTokenHistoryUseCase.ts` converts lot figures to
  floats **before** they reach the wire — `Number(lot.original_qty)`, `Number(lot.remaining_qty)`,
  `Number(lot.unit_cost_fiat)`, `Number(lot.total_cost_fiat)` (lines 160-163),
  `Number(evt.amountFromLot)` (line 191), `Number(row.qty)` (line 233) — and its wire DTO declares
  those six fields `number` (lines 28-31, 52, 76). This violates CLAUDE.md rule 4 in the backend
  today. Everything else in the backend already emits strings correctly; see
  `GetPortfolioSummaryUseCase.ts:20-35` for the pattern.
- `ExternalTaxSchemas.ts:100,136` collapses `total_fiat`'s `null` into `0` with `?? 0`, even though
  `apps/backend/src/core/domain/ports/ILedgerPort.ts:37-41` documents in so many words that `null`
  means "genuinely unknown" while a source-stated `0` is a fact. That is CLAUDE.md's "Nullable is a
  real state" already broken in the frontend.

What remains latent is the *visible* impact: no user-facing wrong figure has been measured yet. So
this stays a correctness-of-model change — it fixes the shape of the model and two real losses along
the path — rather than a bug fix chasing a reported symptom.

The emitter finding also changes the order of work. Constructing a `Money` in the frontend DTO layer
from a value the backend already floored through a float would be **false precision**: a type
asserting an exactness the datum no longer has, which is worse than the honest `number` there today.
The backend fix is therefore not a side note; it is what makes the lot-side phases mean anything.

## What Changes

**First, in the backend — the enabling work.**

- `GetTokenHistoryUseCase` emits exact decimal strings instead of `Number(...)`, following
  `GetPortfolioSummaryUseCase`'s pattern: the seven call sites at lines 160-163, 191 and 233, plus the
  six wire-DTO field declarations at lines 28-31 (`original_qty`, `remaining_qty`, `unit_cost`,
  `total_cost`), 52 (`qty`) and 76 (`amount_from_lot`). One file.

**Then, in the frontend model.**

- Replace `number` with `Money` from `@kryptofolio/core-domain` on every genuinely monetary/quantity
  field in `FiscalEntities.ts`. The type choice is settled, not deferred to `design.md`: `Money` is the
  repo's single precision type on the frontend side (`PreciseAmount`, the branded backend type, is not
  exported to the frontend, and CLAUDE.md rule 4 forbids introducing a second one). The fields:
  - `TaxDerivativeEntity.amount`, `.tradePrice`, `.realizedPnl`, `.fees`, `.funding`
  - `TaxTransactionEntity.amount`, `.totalEur`, `.priceEur`, `.feeEur`, `.amountIn?`, `.amountOut?`
  - `LotRelocationEntity.qty`
  - `TaxLotEntity.originalQty`, `.remainingQty`, `.unitCost`, `.totalCost`
  - `TaxLotHistoryEvent.amountFromLot`, `.saleFeeEur?`
  - `LotCustodyLocation.qty`
- Extend `Money` with the comparison and formatting surface these call sites need: `compareTo(other):
  -1 | 0 | 1`, `isNegative()`, `isZero()`, `isPositive()`, and `toFixed(dp: number): string`
  (delegating to `Decimal.toFixed`, exact). Deliberately **not** added: `toNumber()` and any getter for
  the private `Decimal` — either would reopen the float escape hatch this change exists to close.
- Honour `total_fiat`'s null-vs-zero distinction: `ExternalTaxSchemas.ts` uses `nullableNumericField`
  (which already exists for exactly this case in `CommonSchemaHelpers.ts:29-45` and is simply not used
  here) instead of `?? 0`, and `TaxTransactionEntity.totalEur` becomes `Money | null`. Note that
  `totalEur` is **not** a passthrough: the operation-type `switch` re-derives it (BUY from
  `amount_out`, SELL from `amount_in`, DEPOSIT/AIRDROP/REWARD/TRANSFER_IN and
  WITHDRAWAL/FEE/TRANSFER_OUT forced to `0`). Whether those forced zeros are legitimate facts ("a
  receipt has no fiat counterparty") or disguised unknowns must be decided per branch in `design.md` —
  distinguishing them is part of the work, not an assumption to carry over.
- Delete the dead precision trap in `apps/frontend/src/lib/utils.ts`: `MONETARY_FIELDS`,
  `safeAmountToNumber` (which truncates to five decimals via `parseFloat(n.toFixed(5))`), and `gt`/`lt`
  (which compare through it). Measured: no consumer anywhere in `apps/frontend/src` — the only names
  imported from `@/lib/utils` across the whole frontend are `cn`, `getDeterministicHue` and the
  `CSSVars` type, and those stay untouched. (Measured beyond the mandate: `isPositive`, `isNegative`,
  `isZero`, `formatAmount` and `stringToColor` in that same file are also importerless and also route
  through `safeAmountToNumber` or its 0.00001 epsilon; `design.md` should decide whether they go in the
  same sweep, since leaving them keeps the truncating helper alive.)
- **Legacy `*_eur` aliases.** `ExternalTaxSchemas.ts:70-77` accepts both the canonical `price_fiat`,
  `fee_fiat`, `total_fiat` and the legacy `price_eur`, `fee_eur`, `total_eur`, and lines 100/136 fall
  back through them. Measured in the emitter: no part of `apps/backend` emits the `*_eur` names any
  more — they are dead on the consumer side only. This change acknowledges them as in the
  conversation; `design.md` decides explicitly either to remove them from the schema (consistent with
  CLAUDE.md rule 8, no carried-over compatibility) or to keep them with a written reason. Not left
  implicit.
- **Out of scope — `TaxLotHistoryEvent.salePrice` / `.gainLoss`.** These are not `number` and never
  were: they are `ConvertedAmount | null` (`packages/shared-types/src/money/converted-amount.ts`), a
  discriminated union of `CONVERTED`/`NATIVE`/`UNCONVERTIBLE` whose `amount`/`nativeAmount` already
  carry exact decimal strings validated by `preciseAmountSchema`. Retyping them to `Money` would
  destroy the conversion-outcome union. They stay as they are. (Earlier revisions named
  `salePriceEur`/`gainLossEur`; no such fields exist.)
- The one thing that does change on that side: two sign comparisons currently round an exact decimal
  through a float — `Number(figure.amount)` in `figureTone`
  (`apps/frontend/src/composables/useConvertedAmountDisplay.ts:118`) and
  `Number(event.gainLoss.amount) >= 0` in
  `apps/frontend/src/views/TaxReport/composables/useTaxCalculations.ts:184`. Both become exact decimal
  comparisons via a helper in `packages/shared-types/src/money/` — that package already depends on
  `decimal.js`. `useConvertedAmountDisplay.ts` remains the repo's reference pattern for
  `ConvertedAmount` display; this change does not build a parallel `Money` layer beside it.
- **Out of scope — `TaxReportSummary`.** Its six AEAT aggregates are `capitalGains`, `capitalLosses`,
  `savingsBaseYields`, `generalBaseAirdrops`, `netPatrimonialResult`, `estimatedIrpf`, and they are
  **already typed `string`** — exact decimal, already compliant. There are no `…Eur`-suffixed fields
  here to fix. Stated explicitly so no later pass "fixes" a field that is already correct: exact
  decimal `string` is a compliant form, and the spec delta must recognise it as such rather than
  demanding `Money` here.
- Leave every genuinely-integer field alone: `year`, `count`, `pendingReview`, `totalDefects`,
  `processedCount`, `excludedFlaggedEvents`, `excludedUnresolvedIncomeCount`, and the
  `ReconciliationSummaryEntity` counters. None of these is a fiscal magnitude.
- Update the DTO layer to construct `Money` from the wire string directly, rather than parsing to
  `number` first and typing the entity around that loss.
- Update every downstream consumer to `Money`'s arithmetic and comparisons instead of native
  `+`/`-`/`*`/`/`, `>`/`<`/`!==`, and `Number(...)`.

## Capabilities

### Modified Capabilities
- `domain-financial-precision`: the frontend's fiscal domain model becomes compliant with the
  requirement it already states, exact decimal `string` is recognised as a compliant carrier alongside
  `Money`, and the backend's lot-history emitter stops floating its figures.
- `fiscal-domain`: `FiscalEntities.ts`'s field types are this capability's own surface.
- `lot-custody-traceability`: `GetTokenHistoryUseCase`'s wire DTO — lots, disposal events and
  relocations — changes shape.

## Impact

- **Backend and frontend, and the wire shape changes.** This is *not* a frontend-only change; the
  earlier revision's claim that "the backend already sends decimal strings, so there is no wire-contract
  change" was false for the lot entities and is retracted. Six fields of
  `GetTokenHistoryUseCase`'s response go from `number` to `string`: `original_qty`, `remaining_qty`,
  `unit_cost`, `total_cost`, `qty` (custody and relocation), `amount_from_lot`.
- **No breaking window, and no coordinated deploy.** The frontend's `numericField`
  (`CommonSchemaHelpers.ts:17-27`) already accepts a number *or* a numeric string and coerces either,
  so the current consumer tolerates the new emitter as-is. The two sides can land in either order; the
  frontend phases simply have no value until the backend one has landed.
- **34 non-test consumers** of `FiscalEntities.ts` (`grep -rl FiscalEntities apps/frontend/src` →
  45 files, 34 excluding tests), grouped as: DTO schemas (`ExternalTaxSchemas`,
  `ExternalFuturesSchemas`, `FiscalIntegritySchemas`, `MockDtoSchemas`), nine use-cases under
  `core/application/use-cases/`, the `ITaxPort` port and `PortfolioEntities` model, the
  `RestTaxAdapter`, query/ingestion composables (`useTaxQueries`, `useImportProcessor`), the TaxReport
  and Portfolio view composables, and their view components. The full per-file list and the specific
  call sites to convert live in this change's measured fact sheets; `tasks.md` carries them.
- **Hard constraint from the user: nothing may break and every screen must render byte-identically to
  today.** In particular, the existing `.toFixed(4)`
  (`views/Portfolio/components/table/ExpandedLotsTable.vue:209,214`) and `.toFixed(8)`
  (`views/Portfolio/components/table/LotEventHistory.vue:175`) call sites must **not** be rerouted
  through `formatNumber` from `composables/useFormatters.ts` — that applies `Intl` with thousands
  separators and would change the rendered output. This is precisely why `Money.toFixed(dp)` is a
  required part of this change: those call sites become `field.toFixed(4)` / `field.toFixed(8)` and
  render the same characters. The `totalEur: Money | null` change is the one place where render may
  legitimately differ, and only where a figure is genuinely unknown — an unknown must not keep
  rendering as `0`.
- **CLAUDE.md rules this brushes against**: rule 1 (zero `any` — when proving it, grep `, any>` too);
  rule 3 (domain purity: `FiscalEntities.ts` may import `Money` from `core-domain`, which keeps
  `decimal.js` private, but must not import `decimal.js` itself); rule 4 (money is never a raw float —
  the rule `GetTokenHistoryUseCase` breaks today; and no second precision type, hence `Money`, not a
  promoted `PreciseAmount`); rule 5 (`ConvertedAmount` stays a discriminated union); rule 8 (no shims
  or carried-over compatibility — there is no transitional `Money | number` union, each entity is
  retyped together with all of its consumers in one green commit, and this is the rule the `*_eur`
  aliases and the dead `lib/utils.ts` helpers are weighed against); and "Nullable is a real state"
  (`total_fiat`'s `?? 0`, and `salePrice`/`gainLoss` `null` never collapsing into `0`).
- **Working-method rule this change has already paid for**: method 5 — measure the real thing, and for
  a claim about the wire, measure the **emitter**, never the consumer's schema. Every new wire claim in
  this proposal was verified in the emitting backend file.
- **Sequencing**: no external prerequisite. `fix-fifo-transfer-traceability`, which previously blocked
  this, is archived (`openspec/changes/archive/2026-08-06-fix-fifo-transfer-traceability`); the only
  other active change is `add-ai-portfolio-advisor`, which does not touch `FiscalEntities.ts`. The
  internal ordering is fixed, though: the `GetTokenHistoryUseCase` fix comes first.
