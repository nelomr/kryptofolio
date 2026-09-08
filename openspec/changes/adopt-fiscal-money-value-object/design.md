## Context

> **Sequencing — read this before opening any file.** The change
> `openspec/changes/align-derivatives-pnl-contract/` **lands first, in full**. It repoints
> `getFuturesDerivatives()` from `/api/tax/transactions/futures-derivatives` (deleted) to
> `/api/tax/transactions/futures`, which changes the *emitter* of every `TaxDerivativeEntity` field
> from the `DerivativesPnl` aggregate to `LedgerFuturesTransaction`, and rewrites
> `CexFuturesLedgerSchema` against it. Commit 1 of this change's Migration Plan retypes
> `TaxDerivativeEntity` and **cannot start until that change is merged**: retyping five fields whose
> producer is about to change is how D15's premise failed the first time. That change's D6 states
> the same order from its own side.

`openspec/specs/domain-financial-precision/spec.md`'s "Financial Arithmetic Encapsulation"
requirement states that every financial amount "SHALL be represented and computed using a precision
Value Object (`Money` or `PreciseAmount`) wrapping `decimal.js`", and that "Native JavaScript
`number` types SHALL NOT be used for any financial calculations". `apps/frontend/src/core/domain/
models/FiscalEntities.ts` predates that requirement being enforced against the frontend's own domain
models and is currently non-compliant. `openspec/specs/fiscal-domain/spec.md` owns those field types
as its surface. See `proposal.md` for motivation.

Everything below was measured against the code on 2026-09-04. The change's earlier revisions
asserted a field inventory that did not match the repository; nothing here is inferred.

**Premise failure, corrected — the backend does not send strings for the lot entities.** An earlier
revision of this design (and `facts.md`, and `proposal.md`'s "frontend only" claim) measured the
frontend's *consumer* schema and concluded that "the exact string is available at the boundary". That
is false for four of the six entities. Measured at the **emitter**,
`apps/backend/src/core/application/use-cases/GetTokenHistoryUseCase.ts` declares `number` in its wire
DTO (`original_qty`, `remaining_qty`, `unit_cost`, `total_cost` at lines 28-31; custody `qty` at 52;
`amount_from_lot` at 76) and emits `Number(...)` at lines 160-163, 191, 233 and 257. The IEEE-754 loss
therefore happens **before** the wire. Constructing a `Money` from that in the frontend DTO layer
would model a already-truncated number exactly: a type asserting a precision the datum does not have,
which is worse than the honest `number` there today. CLAUDE.md working-method rule 5 warns about
exactly this — measure the real emitter, not a convenient proxy — and it is why D0 exists and comes
first.

**What does emit exact strings** (premise confirmed, these phases were sound):
`LedgerFuturesTransaction` (`apps/backend/src/core/domain/ports/ILedgerPort.ts:62-80` — `amount?`,
`trade_price?`, `realized_pnl?`, `funding_amount?`, `fee_amount?`, each `PreciseAmount`) feeding
`TaxDerivativeEntity` once `align-derivatives-pnl-contract` has landed, and `LedgerSpotTransaction` (`ILedgerPort.ts:25-45` — `amount_in?`,
`amount_out?`, `fee_amount?` as `PreciseAmount`, `total_fiat`/`price_fiat` as
`PreciseAmount | null`) feeding `TaxTransactionEntity`. The reference pattern for emitting correctly
is `GetPortfolioSummaryUseCase.ts:23-24,35` (`total_realized_pnl_fiat: string`,
`avg_price_fiat: string`). `GetTokenHistoryUseCase` is the backend's only outlier.

**Emitter coverage for all seventeen fields, verified — no field is left unmeasured.** The D7 premise
failure came from checking a consumer schema instead of a producer, so every in-scope field's emitter
was audited by declared type:

Two columns, because the first audit checked only the first: a carrier can be exact and still be
*optional* at source, and a `??` on the consumer side then fabricates a value.

| Fields | Emitter | Carrier precision | Emitter optionality → consumer |
|---|---|---|---|
| `TaxDerivativeEntity.realizedPnl`, `.fees`, `.funding` | `LedgerFuturesTransaction` (`ILedgerPort.ts:71,73,75`), emitted by `SQLiteLedgerAdapter.ts:249,251,253`, served raw by `routes/tax.ts:105-108` | exact `PreciseAmount` — sound | **optional, and absence is reachable**: three nullable TEXT columns (`002_ledger_schema.sql:66,68,70`), and a source-stated `'0'` is persisted *as* `'0'`, so `undefined` is the other state; `?? 0` fabricates — D15 |
| `TaxDerivativeEntity.amount`, `.tradePrice` | `LedgerFuturesTransaction` (`ILedgerPort.ts:69-70`), emitted by `SQLiteLedgerAdapter.ts:247-248` | exact `PreciseAmount` — sound | **optional, and absence is reachable**: a `FUNDING_FEE` row has neither, and `trade_price` has no ingestion writer at all (`CsvIngestionUseCase.ts:444-457`) — D15 |
| `TaxTransactionEntity.totalEur`, `.priceEur` | `LedgerSpotTransaction` (`ILedgerPort.ts:43-44`), served raw by `routes/tax.ts:100-104` | `PreciseAmount \| null` — sound | **nullable and documented as "genuinely unknown"**; collapsed by `?? 0` — D11 |
| `TaxTransactionEntity.feeEur` | **no producer**: the schema reads `fee_fiat`, and `routes/tax.ts:100-109` serves `fee_amount` + `fee_asset_id` (`ILedgerPort.ts:35-36`) | n/a — the key never arrives | **fabricated `0` on 100% of rows**, and an absent `fee_amount` means unknown, a discarded undenominated zero, or unresolved — three states, one of them a zero → `Money \| null` — D15's audit list |
| `TaxTransactionEntity.amount` (six `switch` branches), `.amountIn`, `.amountOut` | `LedgerSpotTransaction` (`ILedgerPort.ts:32,34`) | `PreciseAmount` — sound | **optional, and absence is reachable** (`SQLiteLedgerAdapter.ts:160,214`) — D15's audit list |
| `TaxLotEntity`'s four, `TaxLotHistoryEvent.amountFromLot`, `LotRelocationEntity.qty`, `LotCustodyLocation.qty` | `GetTokenHistoryUseCase` | **truncated by `Number(...)` — D0** | required — no fabrication |
| `TaxLotHistoryEvent.saleFeeEur` | `GetSpanishTaxReportUseCase.ts:190` | **fabricated as a hardcoded `0` — D14** | declared required, invented at source |

Both derivative rows were wrong in the previous revision, which named the `DerivativesPnl` aggregate
as the emitter and its three declared fields as *required*. `align-derivatives-pnl-contract`'s D1
deletes the route that served that aggregate to the tax report; the emitter is
`LedgerFuturesTransaction` and every one of the five carriers is optional. The emitter-optionality
column added in the previous revision is exactly what makes the correction visible, and it is kept
for that reason. D15 records what the new measurement decides.

**Three further defects found in the same seam**, all approved into this change: the frontend's
transaction transform collapses a genuinely-unknown `total_fiat` into `0` (D11), the report's
`sale_fee` is a zero invented at the emitter (D14), and `apps/frontend/src/lib/utils.ts` carries a
dead precision-truncating helper cluster (D13).

**`Money` as it stands** (`packages/core-domain/src/value-objects/Money.ts`, 41 lines): private
`amount: Decimal`, `constructor(value: string | Decimal)` that runs `preciseAmountSchema.parse` only
on the string branch, plus `toString`, `add`, `sub`, `mul`, `div`, `equals`. No comparison, no
`toFixed`, no numeric escape hatch. Exported from `packages/core-domain/src/index.ts:10`.
`preciseAmountSchema` (`packages/shared-types/src/schemas/transactions.ts:4`) is
`/^-?\d+(\.\d+)?$/` plus a `new Decimal(val)` refinement — it accepts negatives, so a `Money` can
represent a loss.

**Availability**: `apps/frontend/package.json:25-26` depends on both `@kryptofolio/core-domain` and
`@kryptofolio/shared-types` as `workspace:*`, and `views/Settings/components/CurrencySettings.vue`
already imports `Money`. `packages/shared-types/package.json` already depends on `decimal.js`.

**The fields actually typed `number`** (six entities, seventeen fields): `TaxDerivativeEntity`
(`amount`, `tradePrice`, `realizedPnl`, `fees`, `funding`), `TaxTransactionEntity` (`amount`,
`totalEur`, `priceEur`, `feeEur`, `amountIn?`, `amountOut?`), `LotRelocationEntity` (`qty`),
`TaxLotEntity` (`originalQty`, `remainingQty`, `unitCost`, `totalCost`), `TaxLotHistoryEvent`
(`amountFromLot`, `saleFeeEur?` — see D14, which drops the `?`), `LotCustodyLocation` (`qty`,
`FiscalEntities.ts:143`).

**`LotCustodyLocation.qty` closes a pre-existing gap, and is not scope this change invented.**
`openspec/specs/fiscal-domain/spec.md`'s already-archived "Custody Location in the Domain Model"
requirement carries the scenario "Custody entries use branded identifiers and precision values",
which states that a custody entry's quantity "MUST use the project's precision value object, not a
raw primitive". The field is `number` today, so it violates a requirement that is already
authoritative in `openspec/specs/` — recorded here so neither the implementer nor the verifier reads
it as scope creep.

**Measured blast radius per entity** (`grep -rl <Entity> apps/frontend/src`, excluding
`__tests__`/`.spec.`/`tests/`): `TaxDerivativeEntity` 9 files, `LotRelocationEntity` 8,
`TaxLotEntity` 10, `TaxTransactionEntity` 12, `TaxLotHistoryEvent` 13, `LotCustodyLocation` 3.
`FiscalEntities.ts` overall has 34 non-test consumers.

**Three `Number(...)`-on-an-exact-decimal sign comparisons, not two.** Beyond
`useConvertedAmountDisplay.ts:118` and `useTaxCalculations.ts:184`, there is
`views/TaxReport/components/TaxReportSummaryCards.vue:53` —
`const isPositive = (figure: string): boolean => Number(figure) > 0`, applied at lines 71, 86 and 101
to `props.metrics.capitalGains`, `.yields` and `.totalLosses`, i.e. to `TaxReportSummary`'s `string`
fields. Same defect class, different carrier. See D2.

**Hard user constraint**: nothing may break and every screen must render exactly the characters it
renders today — with the deliberate, approved exceptions below, each confined to a named table
column: D11 (two columns of `TaxTransactionsTable`), D14 (one column of `TaxReportDetailsTable`),
D15's audit list (one more column of `TaxTransactionsTable`), and **D15 proper (three columns of
`TaxDerivativesTable`)**. Seven columns across three tables.

D15 proper's render changes are new in this revision and are a direct consequence of the emitter
change: with the aggregate as the emitter, `amount` and `tradePrice` were *never* sent and the three
remaining figures were *always* sent, so nothing could move. With `LedgerFuturesTransaction` all five
are optional and reachable in both directions, so a resolved value can now arrive where the aggregate
sent nothing, and an unresolved one where the aggregate always sent a figure. The comparison baseline
for those three columns is **the state after `align-derivatives-pnl-contract`**, not today's screen:
today the derivatives table renders zero rows for every user (that change's Context measures why), so
"unchanged from today" is not a meaningful claim for this table and is not made anywhere below.

## Goals / Non-Goals

**Goals:**

- Make `GetTokenHistoryUseCase` emit exact decimal strings, so the frontend has something exact to
  build a `Money` from (D0). Without this, four of the six entity phases would produce false
  precision rather than precision.
- Bring the seventeen `number` fields above onto `Money`, constructing each from the exact decimal
  string at the DTO boundary rather than `parseFloat`-ing to `number` first.
- Give `Money` the comparison and formatting surface those call sites need, without opening a float
  escape hatch.
- Close all three `Number(...)`-on-an-exact-decimal sign comparisons.
- Stop the transactions table asserting a false `€0.00` where `total_fiat` is unknown or was
  resolved and discarded (D11). Display-only; no computed fiscal figure changes.
- Remove the dead precision-truncating helpers in `lib/utils.ts` (D13) and the dead `*_eur` wire
  aliases (D12), rather than leaving this seam half-corrected.
- Keep the rendered output byte-identical except in the seven table columns D11, D14, D15's audit
  list and D15 proper name explicitly — four of them across `TaxTransactionsTable` and
  `TaxReportDetailsTable`, three in `TaxDerivativesTable`, whose baseline is the state after
  `align-derivatives-pnl-contract`.

**Non-Goals:**

- `TaxLotHistoryEvent.salePrice` / `.gainLoss` (see D1) and `TaxReportSummary` (see D2).
- `PortfolioEntities.ts`'s `amount: number` / `currentValueFiat: number` (lines 26, 30). They are
  portfolio-valuation figures, not fiscal magnitudes, and retyping them would pull the whole
  Portfolio value pipeline into this change. D7 states how the one place they meet a `Money` is
  handled, and names them as the natural follow-up change.
- Any database or persisted-schema change. Nothing is migrated; SQLite already stores TEXT decimals.
- Any backend change beyond `GetTokenHistoryUseCase`'s six wire fields and seven emission sites
  (D0). The rest of the backend already emits exact strings and is left untouched.
- `ExternalFuturesSchemas.ts`'s own `price_eur`/`fee_eur` aliases (lines 148, 154, 175, 177). Same
  shape as D12's, but their emitter was not measured in either fact-finding round, and
  `__tests__/futures-schemas.test.ts:175-183` has a test that deliberately asserts alias tolerance —
  so deleting them is an unmeasured behaviour change. Deferred to its own change, which should start
  by measuring what `routes/tax.ts:110` actually emits.
- `lib/utils.ts`'s `stringToColor` is deleted as dead code (D13) but is *not* a precision defect;
  no other non-monetary cleanup is in scope.
- Any transitional shim, dual-read union, or feature flag (see D4).

## Decisions

### D0 — backend phase 0: `GetTokenHistoryUseCase` emits `PreciseAmount`, and the fix is deleting a wrapper

**The exact value is already in hand one expression before the loss.** Measured at each source:

| Emission site | Source expression | Source's declared type |
|---|---|---|
| `:160` `original_qty` | `lot.original_qty` | `PreciseAmount` (`ILedgerPort.ts:123`) |
| `:161` `remaining_qty` | `lot.remaining_qty` | `PreciseAmount` (`ILedgerPort.ts:124`) |
| `:162` `unit_cost` | `lot.unit_cost_fiat` | `PreciseAmount` (`ILedgerPort.ts:125`) |
| `:163` `total_cost` | `lot.total_cost_fiat` | `PreciseAmount` (`ILedgerPort.ts:126`) |
| `:191` `amount_from_lot` | `evt.amountFromLot` | `string` (`ITaxCalculatorPort.ts:77`) |
| `:233` relocation `qty` | `row.qty` | `string` (`ITaxCalculatorPort.ts:182`) |
| `:257` custody `qty` | `row.qty` | `string` (`ITaxCalculatorPort.ts:167`) |

So the `Number(...)` wrapper is gratuitous destruction, not a conversion anything needs. The fix is
to **delete the wrapper** and widen the DTO's declared type — not to go looking for an exact string
anywhere, and not to introduce any parsing. Recorded explicitly so the implementer does not build a
conversion that is not required.

**Declared wire type: `PreciseAmount`, not bare `string`.** The four lot fields already hold a
`PreciseAmount` at source, so declaring `original_qty: PreciseAmount` on `TokenLotDto` is a
passthrough with no cast. `amount_from_lot` and the two `qty` fields arrive as plain `string` from
`ITaxCalculatorPort`; those three are declared `string`, because branding them would require a
`toPreciseAmount(...)` call whose only effect is a re-validation of a value the DuckDB view already
produced — work with no reader. This is a deliberate asymmetry inside one DTO: the brand is carried
where it already exists and not manufactured where it does not.

*Rejected:* declaring all six as bare `string` for uniformity. It would discard a brand the ledger
port already guarantees, at the one boundary where the guarantee is free.

**No breakage window, and it is safe to land alone, before any frontend commit.** The frontend's
`numericField` (`core/infrastructure/dtos/CommonSchemaHelpers.ts:17-27`) is a `z.preprocess` that
already accepts both a `number` and a numeric `string` (`typeof val === 'string'` branch, line 20).
So after D0 the current frontend parses the new payload unchanged — it converts the string to a
`number` exactly as it converts a `number` today. The wire's *shape* changes (`number` → `string`)
but no consumer needs coordinating, which is why phase 0 can be a standalone green commit rather
than a synchronised release.

**The zero filter at `:257-258` is a trap, and it moves to an exact predicate.**

```
const qty = Number(row.qty);
if (qty === 0) continue;
```

This is the upstream filter that decides whether a custody row exists at all — the one
`LotCustodyLocation.qty`'s own comment refers to as "zero-quantity rows are filtered upstream", and
which `fiscal-domain`'s delta covers in a scenario. `Number(x) === 0` and an exact zero test are not
equivalent at the edges: `Number('1e-400')` underflows to `0`, so a real, tiny holding would be
filtered out of existence. Decision: the predicate becomes
`compareDecimalStrings(row.qty, '0') === 0`, reusing D1's helper from `@kryptofolio/shared-types`.

*Rejected:* keeping `Number(row.qty)` for the predicate only and emitting the string separately. It
works, but it leaves a `Number()` on a money value in a file whose whole point is that it stopped
doing that, and a future reader has no way to tell a confined boolean use from the defect —
CLAUDE.md rule 4 has no "only for a boolean" carve-out.

*Rejected:* `new Decimal(row.qty).isZero()`. Equally exact and permitted at this layer (a use case
may use a math library), but it makes `GetTokenHistoryUseCase` import `decimal.js` for one predicate
when a shared helper already expresses it, and it would be the second idiom for the same question in
this change.

This is also the one place D0 gives `compareDecimalStrings` a **backend** consumer, which is the
concrete vindication of D1's decision to put it in `shared-types` rather than in the frontend.

**Checked: no analogous zero filter for lots or events.** `grep -n 'continue|\.filter\(|=== 0'` over
the file returns only `:146` (`targetLots.filter` — a symbol match, not a magnitude), `:172`
(`.filter((id) => Boolean(id))` — an id presence check), `:227` (`if (!lotIds.has(...)) continue` — a
set membership check) and the custody filter above. Lots and events are never filtered by quantity,
so `:257` is the only predicate D0 has to redesign.

**Blast radius: one file, one test file, no route change.** `grep -rn` for the use case and its four
DTO type names across `apps/backend` returns `core/infrastructure/di/container.ts` (lines 46, 125,
229, 300 — construction only, no field access), `core/infrastructure/adapters/
DuckDbTaxCalculatorAdapter.ts:134` (a comment), `core/infrastructure/routes/portfolio.ts:46` (passes
the response through untouched), and `__tests__/GetTokenHistoryUseCase.spec.ts`. Nothing else reads
these fields. In that spec, six assertions state numbers over the changed fields and must become
exact-string assertions: `:135` `original_qty).toBe(2000.0)`, `:136`
`remaining_qty).toBe(1573.45)`, `:141` `amount_from_lot).toBe(426.55)`, `:325` and `:332`
(`qty: 1073.45` and `qty: 500` inside `toEqual`), and `:418` `move?.qty).toBe(500)`.

Note the fixtures those come from — `'2000.0'`, `'1573.45'`, `'426.55'`, `'1073.45'`, `'500.00'`,
`'500.0'` — because passthrough now **preserves the source's formatting**: the wire will carry
`'500.00'` where it used to carry `500`. That is invisible downstream (D7b measures that
`Money('500.00').toString()` is `'500'`, identical to today's `String(500)`), but the spec's
assertions must be written against the string the source actually holds, not a normalised one.

### D1 — `salePrice` / `gainLoss` stay `ConvertedAmount | null`; only the `Number()` sign checks change

`TaxLotHistoryEvent.salePrice` and `.gainLoss` (`FiscalEntities.ts:215+`) are **not** `number` and
never were: they are `ConvertedAmount | null`
(`packages/shared-types/src/money/converted-amount.ts`), a discriminated union over
`CONVERTED` / `NATIVE` / `UNCONVERTIBLE` whose `amount` and `nativeAmount` are already
`preciseAmountSchema` — exact decimal strings. They are therefore *already compliant* with the
precision requirement, and they carry information `Money` has no representation for: `rate`,
`rateDate`, `nativeCurrency`, `requested`, and the `UNCONVERTIBLE` arm itself. Retyping them to
`Money` would delete the conversion-outcome union, which
`converted-amount.ts`'s own comment explains exists precisely so that "a conversion to the currency
you were already in must be the identity function" and so a failed conversion is never rendered as a
plausible wrong number. That is a loss of fiscal information, not a precision upgrade.

*Rejected:* `Money | null`, as an earlier revision of this design decided — and it decided it over
field names (`salePriceEur`, `gainLossEur`) that do not exist in the codebase at all.

What **does** change is the sign comparisons that currently round an exact decimal through an
IEEE-754 double. Three, measured:

- `apps/frontend/src/composables/useConvertedAmountDisplay.ts:118` — `const amount =
  Number(figure.amount)` inside `figureTone`, then `> 0` / `< 0`.
- `apps/frontend/src/views/TaxReport/composables/useTaxCalculations.ts:184` —
  `Number(event.gainLoss.amount) >= 0 ? 'gain' : 'loss'` inside `getEventVariant`.
- `apps/frontend/src/views/TaxReport/components/TaxReportSummaryCards.vue:53` — `Number(figure) > 0`
  over `TaxReportSummary`'s `string` fields (see D2's qualification). Its carrier is not a
  `ConvertedAmount`, but the defect and the fix are identical.

All three become exact decimal comparisons through a new helper in
`packages/shared-types/src/money/`:

```
// packages/shared-types/src/money/compare.ts
export function compareDecimalStrings(a: string, b: string): -1 | 0 | 1
```

All three call sites compare against the literal `"0"`, so one function covers them; a separate
`signOf…` wrapper would be surface for no behaviour. The tri-state return matches `Money.compareTo`
(D5) so the two comparison idioms in this codebase read the same. Verified against `decimal.js` in
this repo: `new Decimal('0.1').plus('0.2').comparedTo('0.3') === 0`, where the float path gives
`0.30000000000000004`.

*Why `shared-types` and not the frontend:* the helper's domain is the `preciseAmountSchema` string
contract, which `shared-types` defines and `ConvertedAmount` — also in `shared-types` — is built
from. `packages/shared-types/package.json` already declares `decimal.js`, so the helper adds no
dependency, and it keeps `decimal.js` out of `apps/frontend`'s import graph (CLAUDE.md rule 3 —
`useConvertedAmountDisplay.ts` must not learn to import a math library). A frontend-local copy would
also be unavailable to the backend, which parses the same strings.

`useConvertedAmountDisplay.ts` remains the repo's reference pattern for `ConvertedAmount` display
(`describeConvertedAmount`, `figureText`, `figureTone`, `figureClass`, `isPositiveFigure`,
`summariseConversion`). This change does **not** build a parallel `Money`-based display layer beside
it.

### D2 — `TaxReportSummary` is out of scope, and exact decimal `string` is a compliant carrier

`TaxReportSummary` (`FiscalEntities.ts:277`) holds `capitalGains`, `capitalLosses`,
`savingsBaseYields`, `generalBaseAirdrops`, `netPatrimonialResult`, `estimatedIrpf` — already typed
`string`, exact decimal. There are no `…Eur`-suffixed fields here; an earlier revision named six that
do not exist.

Recorded explicitly so no later pass "fixes" them: **a decimal `string` validated by
`preciseAmountSchema` is a compliant form of the "Financial Arithmetic Encapsulation" requirement.**
The requirement's target is IEEE-754 loss, and a decimal string has none; the spec delta must
recognise `string` alongside `Money` rather than demanding `Money` for a field that never loses a
digit. Retyping these to `Money` would be churn with no correctness gain, and would force
`Money` construction on aggregates the UI only ever formats.

**Qualification, and it matters: a compliant *carrier* does not make the *comparisons* compliant.**
`views/TaxReport/components/TaxReportSummaryCards.vue:53` defines a local
`isPositive = (figure: string) => Number(figure) > 0` and applies it at lines 71, 86 and 101 to
`props.metrics.capitalGains`, `.yields` and `.totalLosses` — three of these very `string` fields. Its
own comment argues the loss is harmless "because a CSS class is the one use where losing the last
places is harmless", and that is true of the *magnitude* but not of the *sign*, which is all the
predicate returns: a `capitalGains` of `'0.0000000000000000001'` is a gain, and `Number(...) > 0` on
a value that underflows to `0` paints it as neither. So D2's conclusion is right about the type and
incomplete about the comparison. This third site joins the other two on `compareDecimalStrings` in
commit 0 (D1) — it is the cheapest of the three, since the carrier is already an exact string and
only the operator changes.

*Rejected:* retyping `TaxReportSummary` to `Money` to make the comparison type-safe. That is D2's
main decision restated; the comparison is fixable without touching the carrier.

### D3 — the target type is `Money` from `@kryptofolio/core-domain`, not a promoted `PreciseAmount`

The precision spec names "`Money` or `PreciseAmount`". The choice is forced, not aesthetic: the
branded `PreciseAmount` type (`string & { __brand: 'PreciseAmount' }`) lives **only** in
`apps/backend/src/core/domain/value-objects/PreciseAmount.ts`. `apps/frontend` importing from
`apps/backend` would invert this monorepo's dependency direction — an app depending on another app,
which nothing in this repo does. And `shared-types` exports only `preciseAmountSchema`, whose
`z.infer` is a plain `string` with no brand.

*Rejected:* promoting a branded `PreciseAmount` into `packages/shared-types` so the frontend could
use it. That creates a **second precision type** alongside `Money`, which CLAUDE.md rule 4
explicitly forbids ("use it instead of a second precision type"). It would also leave the codebase
with two answers to "what type is money here", which is the state this change exists to end.

`Money` is additionally already proven in `apps/frontend` and already backs `FiatMoney` /
`ExchangeRate` in `packages/core-domain/src/domain/models/MoneyEntities.ts`.

### D4 — no `Money | number` union; migration is per entity, all consumers in the same commit

An earlier revision of this design proposed a "temporary dual-read (`Money`-or-`number`) union on the
in-progress fields, removing the union only once every consumer of that field is converted". That is
rejected. It is a backwards-compatible shim introduced solely to avoid changing call sites in the
same commit, which CLAUDE.md rule 8 forbids by name. It is also unsafe in a way a shim usually is
not: while the union is live, `entity.field` is `Money | number`, so every arithmetic and comparison
site must be narrowed, and any site that is *not* narrowed keeps compiling on the `number` arm — the
union hides exactly the sites the retype is supposed to surface.

**The migration unit is one entity, retyped together with every one of its consumers, in one commit
that is green on its own.** Order, by measured increasing blast radius:

| # | Entity (entities) | Non-test consumer files | Why here |
|---|---|---|---|
| 1 | `TaxDerivativeEntity` | 9 | Smallest, and self-contained: no other entity references it. Contains the only real arithmetic in scope (`useDerivativesTable.ts:99-101`, `-tx.fees + tx.funding`), so the arithmetic idiom — and, after D15's re-decision, the null-propagating variant of it — is settled first, on the smallest surface. **Blocked on `align-derivatives-pnl-contract` (see the Context banner and D15).** |
| 2 | `TaxTransactionEntity` | 12 | Also referenced by no other in-scope entity; its consumers are use-cases plus one table. |
| 3 | `LotRelocationEntity` | 8 | Only one field (`qty`). Shares files with the lot entities but not fields, so it lands independently. |
| 4 | `TaxLotEntity` **+** `TaxLotHistoryEvent` **+** `LotCustodyLocation` | 10, 13 and 3, overlapping in 8; union of all three is 13 | Must be one commit: `LotTimelineRow` (`FiscalEntities.ts:171`) is a discriminated union over `{ kind: 'DISPOSAL'; event: TaxLotHistoryEvent }` and `{ kind: 'RELOCATION'; relocation: LotRelocationEntity }`, and `useTaxCalculations.ts:293-302` builds it from both; `ExpandedLotsTable.vue` and `LotEventHistory.vue` consume lots and their events together. Splitting them would leave one arm of the union retyped and the other not. `LotCustodyLocation` joins them because `TaxLotEntity.currentLocations` (`FiscalEntities.ts:208`) is `LotCustodyLocation[]` — the two are reached through the same field. |

**`LotCustodyLocation` does not widen step 4.** Measured: `grep -rn LotCustodyLocation
apps/frontend/src` names the type in exactly three non-test files — `core/domain/models/
FiscalEntities.ts`, `core/infrastructure/dtos/ExternalTaxSchemas.ts` (schema at 275-294, mapping at
287-293, wired into the lot at 352 and 369) and `core/infrastructure/dtos/MockDtoSchemas.ts` (219,
which hardcodes `currentLocations: []` and so needs no change at all). All three are already in
`TaxLotEntity`'s ten-file set, so step 4's file count is unchanged at 13 and the smallest-first
ordering argument stands as written. `grep -rn 'currentLocations\|custodyOf'` finds one further
reader that does not name the type: `views/Portfolio/components/table/ExpandedLotsTable.vue:111`
(`custodyOf`) rendering at 240-262 — a file already in step 4 for `TaxLotEntity` and
`TaxLotHistoryEvent`. Marginal cost in step 4 is therefore near zero, which is why it lands here
rather than as its own commit.

**Why this ordering keeps every commit green without a shim** — the only argument the union had in
its favour. `FiscalEntities.ts` declares each entity independently: no in-scope entity has a field
whose type is another in-scope entity, with two exceptions — the `LotTimelineRow` union
(`FiscalEntities.ts:171`) and `TaxLotEntity.currentLocations: LotCustodyLocation[]`
(`FiscalEntities.ts:208`) — and both fall inside step 4, which is why that step fuses three
entities. So retyping entity *E* makes red exactly the sites that read a
`number` field *of E*, and those sites are confined to *E*'s own consumer files, all of which are
fixed in the same commit. No consumer of an already-migrated entity is disturbed (its fields are
already `Money`), and no consumer of a not-yet-migrated entity is disturbed (its fields are still
`number`). Steps 1-3 are strictly disjoint in fields; step 4's two entities are handled together.
Each commit therefore compiles and tests green with no transitional type anywhere.

**D0 does not disturb this ordering; it strengthens it.** Phase 0 is a backend-only commit that lands
before step 1 and is green on its own (the frontend's `numericField` already accepts strings, so no
frontend file changes with it). It does, however, make steps 3 and 4 *possible*: without it,
`LotRelocationEntity.qty`, `TaxLotEntity`'s four fields, `TaxLotHistoryEvent.amountFromLot` and
`LotCustodyLocation.qty` would be `Money` instances built from an already-truncated `number` — false
precision. Steps 1 and 2 are unaffected either way, since `LedgerFuturesTransaction` and
`LedgerSpotTransaction` already emit exact strings; D0 is a prerequisite of steps 3-4 specifically,
not of the whole change. Step 1 has a *different* prerequisite, outside this change:
`align-derivatives-pnl-contract` must have landed, because it is what makes
`LedgerFuturesTransaction` the emitter of `TaxDerivativeEntity`'s fields at all (D15). D11, D12 and D13 attach to specific commits in the Migration Plan below
rather than forming their own phases.

Ordering smallest-first is deliberate beyond convenience: the first commit establishes every idiom
this change introduces (DTO construction, `compareTo` in a sort comparator, `add`/`sub` for real
arithmetic, `toString()` into `useFormatters`) on 9 files, so the 13-file commit is mechanical
repetition rather than fresh judgement.

### D5 — the comparison and formatting surface goes on `Money` itself

This closes the previous revision's Open Question. `Money` gains:

```
compareTo(other: Money): -1 | 0 | 1
isNegative(): boolean
isZero(): boolean
isPositive(): boolean
toFixed(dp: number): string
```

`compareTo`, `isNegative`, `isZero`, `isPositive` cover every comparison measured in scope: sign
checks (`TaxDerivativesTable.vue:219,226,230,234,254` — `tx.tradePrice !== 0`, `tx.realizedPnl > 0`,
`tx.realizedPnl < 0`, `tx.fees !== 0 || tx.funding !== 0`; `useTaxCalculations.ts:322` —
`lot.unitCost > 0`; `ExpandedLotsTable.vue:287` — `lot.remainingQty > 0`) and ordering
(`useDerivativesTable.ts:39-41`, `TaxTransactionsTable.vue:83-87`). `compareTo` returning a tri-state
rather than a pair of booleans means `a.compareTo(b) > 0` reads the same as today's `a > b`, so the
rewrite is mechanical; it is also the shape CLAUDE.md rule 5 wants over a bag of boolean predicates.

The Open Question asked whether these belong on `Money` or on a frontend-only wrapper, since
`core-domain` is shared beyond the tax report. Answer: on `Money`. A monetary comparison is not
fiscal-domain-specific — `MoneyEntities.ts`'s `FiatMoney`/`ExchangeRate` will want the same four —
and a frontend wrapper would either need the private `Decimal` (rejected below) or would re-parse
`toString()`, reintroducing the very string→number hop this change removes.

*Rejected:* `toNumber()`. Every consumer measured needs a comparison, a display string, or exact
arithmetic; all three are served without it. `toNumber()` would be an unguarded invitation to compute
on the lossy value, the exact failure mode the backend brands `PreciseAmount` to prevent.

*Rejected:* a getter exposing the private `Decimal`. A call site could then compare `.valueOf()` as a
number, silently reopening the hole — and it would leak `decimal.js` into `apps/frontend`'s types,
against CLAUDE.md rule 3.

**`toFixed(dp)` is mandatory, not convenience.** Two call sites render a fixed-decimal figure with no
thousands separators:

- `views/Portfolio/components/table/ExpandedLotsTable.vue:209,214` — `.toFixed(4)`
- `views/Portfolio/components/table/LotEventHistory.vue:175` — `(row.event.amountFromLot || 0).toFixed(8)`

`formatNumber` in `apps/frontend/src/composables/useFormatters.ts` cannot replace them: it runs
`Intl.NumberFormat` with digit grouping, so a lot quantity that renders `12345.6789` today would
render `12,345.6789`. The user's hard constraint is that every screen renders identically, so those
sites become `field.toFixed(4)` / `field.toFixed(8)`, delegating to `Decimal.prototype.toFixed`
(exact, and non-exponential — verified: `new Decimal(1e-7).toFixed()` is `"0.0000001"`, not
`"1e-7"`). Note the `|| 0` at `LotEventHistory.vue:175` must be **deleted**, not carried over:
`amountFromLot` is required, and a `Money` instance is always truthy, so the guard becomes dead code
that would mislead a reader into thinking the field is nullable.

### D6 — formatting stays in `useFormatters.ts` with an unchanged signature; call sites pass `.toString()`

Verified: `formatCurrency`, `formatPercent` and `formatNumber` already accept
`number | string | null | undefined` and `parseFloat` a string input once, immediately before
`Intl.NumberFormat`. That is a bounded, non-compounding read at the terminal rendering point —
unlike arithmetic on a `number`-typed entity field, a single `parseFloat` feeding a formatter has
nowhere for its rounding to accumulate. No change to that module; each call site goes from
`entity.field` to `entity.field.toString()`.

*Rejected:* adding a `Money`-aware overload to `useFormatters.ts`. It would do
`parseFloat(value.toString())` behind a second signature for no behavioural difference, and would
make `useFormatters.ts` depend on `core-domain`.

### D7 — the one mixed-type comparison: convert at the component boundary via an explicit helper

`views/Portfolio/components/table/ExpandedLotsTable.vue:89-90`:

```
const currentPrice = props.assetCurrentValueEur / props.assetAmount;
return lot.unitCost > currentPrice;
```

Measured provenance: `assetAmount` and `assetCurrentValueEur` are props declared `{ type: Number }`
(`ExpandedLotsTable.vue:41-42`), passed from `views/Portfolio/components/LotHierarchyTable.vue:210-217`
as `row.original.amount ?? 0` and `row.original.currentValueFiat ?? 0`. Those originate in
`core/domain/models/PortfolioEntities.ts:26,30`, both `number`, and are **out of scope** (Non-Goals).
So after step 4 this line compares a `Money` against a `number`.

Decision: convert at the boundary, and name the lossiness. A second helper joins `compareDecimalStrings`:

```
// packages/shared-types/src/money/compare.ts
export function preciseAmountFromNumber(value: number): string
```

implemented as `new Decimal(value).toFixed()` — exact for the double it is given, and always
non-exponential, so the result satisfies `preciseAmountSchema` (verified across `1e-7`, `1e21`,
`0.1+0.2`, `1/3`, negatives and `0`). `isLotInLoss` becomes: build
`new Money(preciseAmountFromNumber(props.assetCurrentValueEur))` and
`new Money(preciseAmountFromNumber(props.assetAmount))`, divide, then
`lot.unitCost.compareTo(currentPrice) > 0`. The existing
`if (!props.assetAmount || !props.assetCurrentValueEur) return false` guard already precedes it, so
there is no division by zero.

*Rejected:* `Money.fromNumber(n)`. A static factory on `Money` is a float door on the type this
change exists to protect, and it would be reached for at boundaries that do not actually need it.
`preciseAmountFromNumber` returns a *string*, so it cannot be mistaken for a precision upgrade; the
name states that its input was already lossy and that the loss happened upstream.

*Rejected:* `String(value)` instead of `Decimal(value).toFixed()`. `String(1e-7)` is `"1e-7"`, which
fails `preciseAmountSchema`'s regex and would throw at runtime on small quantities — a real case for
crypto amounts.

*Rejected:* leaving the comparison in `number` because it only tints a row. That is the argument this
change rejects everywhere else, and a comparison against a lot's exact `unitCost` is precisely where
a boundary belongs.

**`preciseAmountFromNumber` survives the D0 correction, and this is its only legitimate use.**
Checked deliberately, because D0 removes the reason an earlier revision of this design gave for the
helper. After D0 every in-scope field arrives as an exact string, so no in-scope field needs it:
`LotCustodyLocation.qty` in particular does **not** — an earlier revision of this section claimed the
opposite from the consumer schema alone (`ExternalTaxSchemas.ts:284`'s `qty: numericField`) without
measuring `GetTokenHistoryUseCase.ts:257`, which is the premise failure the Context records. What
does still need it is exactly this comparison: `currentPrice` derives from
`PortfolioEntities.ts:26,30`, which stay `number` and are out of scope, so a `Money` still has to
meet an external `number` here and nowhere else. The helper therefore ships with **one call site**,
and that is a reason to keep it narrow, not a reason to delete it: without it this line either keeps
a float comparison or grows an ad-hoc `String(n)` that throws on `1e-7`.

*Rejected:* dropping `preciseAmountFromNumber` and leaving `isLotInLoss` on floats until
`PortfolioEntities` is migrated. It would leave the only measured mixed-type comparison in the
codebase unfixed, and the follow-up change would then have to revisit a file this change already
touched twice.

**One behaviour to preserve, one to correct.** `numericField` returns `0` for `null`, `undefined`
and `''`. For every in-scope field *except* `total_fiat`, that mapping is preserved as
`new Money('0')` — those fields are non-nullable at source and the `0` is not standing in for an
unknown. `total_fiat` is the exception, and D11 corrects it, because its own port documents `null`
as a distinct state.

### D7b — raw template interpolation of a `Money` renders identically; no change at those sites

`LotCustodyLocation.qty` is rendered by **raw interpolation**, not through `useFormatters` and not
through `toFixed`: `views/Portfolio/components/table/ExpandedLotsTable.vue:257-258` is
`{{ location.qty }}`. That is a third render mechanism the identical-output constraint has to cover,
so it was checked rather than assumed.

Vue's `toDisplayString` calls `JSON.stringify` on an object only when that object does **not**
override `toString`; `Money` does override it, so `{{ money }}` renders `Money.toString()`, i.e.
`Decimal.prototype.toString()`. Measured against `String(Number(s))` for the same wire strings:

| wire | `String(number)` today | `Decimal.toString()` |
|---|---|---|
| `"79.11"` | `79.11` | `79.11` |
| `"79.110"` | `79.11` | `79.11` |
| `"0.0000001"` | `1e-7` | `1e-7` |
| `"0.00000001"` | `1e-8` | `1e-8` |
| `"12345.6789"` | `12345.6789` | `12345.6789` |
| `"1000000"` | `1000000` | `1000000` |
| `"1e21"` | `1e+21` | `1e+21` |
| `"0"` | `0` | `0` |

Identical throughout, including both exponential thresholds (`Decimal`'s default `toExpNeg`/`toExpPos`
happen to coincide with `Number`'s here) and trailing-zero normalisation — the `"79.110"` row is the
one D0 makes reachable, since a passthrough now preserves the source's trailing zeros where
`Number()` used to strip them; `Money` re-normalises them on construction, so the rendered characters
are unchanged. Decision: leave every raw
interpolation site as `{{ field }}` — no `.toString()` needed, since the interpolation already calls
it. The regression net is `ExpandedLotsTable.status.spec.ts:196-268`, which already asserts on
`data-testid="lot-custody-entry"`; note `ExternalTaxSchemas.spec.ts:114` asserts
`currentLocations[1].qty).toBe(79.11)` and must become a `Money` equality assertion in step 4.

### D8 — `Money` instances inside Vue reactive state: measured safe, no mitigation needed

Real risk, so it was measured rather than reasoned about. A probe under `apps/frontend`'s own vitest
(vue 3 + `decimal.js` as resolved in this workspace) placed `Money` instances in `reactive([...])`
and in `ref({...})`:

| Observation | Result |
|---|---|
| the row object is a proxy | `true` |
| the `Money` instance read off it is a proxy | `true` |
| the `Decimal` read through that proxy is a proxy | **`false`** |
| `decimalReadThroughProxy instanceof Decimal` | `true` |
| `proxiedMoney.add(proxiedMoney2).toString()` | `"4.5"` — correct |
| `proxiedMoney.sub(...)`, `.equals(...)` | correct |
| `new Money(decimalReadThroughProxy)` | `"1.5"` — takes the `Decimal` branch |
| `new Money("2").add(proxiedMoney)` | `"3.5"` — mixed plain/proxied is fine |

Mechanism: `decimal.js` sets `Symbol.toStringTag = 'Decimal'` on its prototype
(`decimal.mjs:4905`), so Vue's `targetTypeMap` classifies a `Decimal` as `INVALID` and refuses to
proxy it. The private `amount` field is therefore always a raw `Decimal`, and
`value instanceof Decimal` in the constructor and `other.amount` in `add`/`sub`/`mul`/`div`/`equals`
all behave exactly as outside reactive state. (TypeScript `private` is compile-time only, so
`other.amount` is an ordinary property read at runtime; that is pre-existing and unchanged.)

Consequences recorded so the implementer does not re-litigate them:

- **No `markRaw`, no `shallowRef`, no "construct `Money` outside reactive state" rule.** The probe
  also confirmed `markRaw` works, but it is unnecessary complexity and would silently opt fiscal rows
  out of reactivity.
- **Sorting uses `compareTo` in the comparator.** `useDerivativesTable.ts:39-41` and
  `TaxTransactionsTable.vue:83-87` currently compute `aVal - bVal` over a union of "timestamp
  milliseconds" and "the fiscal field". With `Money` the two branches no longer share a subtraction,
  so each comparator splits: the timestamp branch keeps `getTime()` subtraction, the fiscal branch
  becomes `a.field.compareTo(b.field)`, and `sortOrder === 'asc' ? cmp : -cmp` applies the direction
  once. Sort *stability* is unchanged (`Array.prototype.sort` is stable per spec, and the comparator
  is still total).

### D9 — `Money`'s unvalidated `Decimal` branch is left as it is

The constructor runs `preciseAmountSchema.parse` only on the string branch; a `Decimal` is accepted
as-is. Deliberately unchanged by this change. In every call site this change creates, a `Decimal`
can only arrive from `Money`'s own arithmetic — `apps/frontend` never imports `decimal.js` (CLAUDE.md
rule 3) and the new helpers return strings, so the branch is unreachable from the code being added.
Validating it would also mean a regex parse on every `add`/`sub` result, inside the aggregation loops
this change is meant to make cheap and exact. Tightening it is a `core-domain` hardening question,
with its own consumers outside `apps/frontend`, and belongs to its own change.

### D10 — no performance work; no benchmark task

Each `Money` construction is one regex test, one `new Decimal(...)`, and one object allocation.
Measured placement of the cost: construction happens in the DTO layer (`ExternalTaxSchemas`,
`ExternalFuturesSchemas`, `FiscalIntegritySchemas`, `MockDtoSchemas`) once per query response, not per
render frame — Pinia Colada caches the parsed entities, so a scroll or a re-sort re-reads existing
instances. Sorting compares via `Decimal.comparedTo` rather than `-`, which is slower per comparison
but runs on the same O(n log n) already there.

Virtualization does not change this: of the four files importing `@tanstack/vue-virtual`,
`views/Portfolio/components/LotHierarchyTable.vue` is the only in-scope one, and it virtualizes the
**asset** rows (Level 1); lots and lot events render inside an expanded row, un-virtualized, and are
already fully materialised before the row opens — as are their `currentLocations` entries, whose
`Money` construction happens inside `ExternalLotCustodyLocationSchema`'s transform
(`ExternalTaxSchemas.ts:287-293`) along with the rest of the lot. Virtualization reduces the number of *rendered*
rows, not the number of constructed entities, and construction is not on the render path.

D0 does not change this conclusion. It makes the token-history payload marginally larger (a JSON
string is quoted where a number was not, and trailing zeros survive), which is a transfer-size
difference measured in bytes per row on a localhost, self-hosted request, and it *removes* a
`Number()` per field on the backend. It also removes work from the frontend: `numericField`'s
`Number(trimmed)` is replaced by the `Money` construction that would have happened anyway.

No benchmark task is added. If a table ever regresses visibly after this change, the fix is to move
construction behind the DTO's lazy field access, not to relax the type — recorded here so the
fallback is a design position rather than an improvisation.

### D11 — `totalEur` becomes `Money | null`, and each `switch` branch is decided on its own semantics

*Scope note added after the full `?? 0` sweep:* this decision's branch table governs `totalEur`
only, because only `totalEur` is re-derived per operation type. The two neighbouring fields on lines
`:150-151` — `priceEur` and `feeEur` — are simple passthroughs and are **not** covered by the table;
they are decided in D15's audit list (`priceEur` → `Money | null` on `total_fiat`'s exact reasoning,
`feeEur` → `Money | null`, **re-decided in this revision** against its emitter), and land in the
same commit.

`ILedgerPort.ts:37-41` documents the rule the frontend breaks: "`null` when neither a total nor a
price could be resolved at ingestion — genuinely unknown. A source-stated `0` (a promotional credit,
a free acquisition) is a fact and stays `0`; only its absence becomes `null`."
`ExternalTaxSchemas.ts:100` and `:136` write `raw.total_fiat ?? raw.total_eur ?? 0`, collapsing the
two. `TaxTransactionEntity.totalEur` therefore becomes `Money | null`, and the three fields read
through `nullableNumericField` (`CommonSchemaHelpers.ts:29-45`, which exists for precisely this and
is documented as opt-in per field) instead of `numericField`.

**Scope, measured, because this decision is easy to over-read: `totalEur` is display-only.** Its
complete consumer set is `RestTaxAdapter.ts:105,137,181` (passthrough into the entity),
`MockDtoSchemas.ts:47` (mock construction) and **exactly one table cell**,
`views/TaxReport/components/TaxTransactionsTable.vue:313`, `{{ formatCurrency(tx.totalEur) }}`. No
frontend computation reads it — not a sum, not a comparison, not a tax base. The AEAT bases are
computed by the backend on its own `/report` route via `getSpanishTaxReportUseCase` from the ledger,
never from this entity. **No calculated fiscal figure changes anywhere in this change, and no tax
liability moves.**

So the reason for the fix is narrower than "a fiscal misstatement", and narrow is enough: the
transactions table currently *states a false zero*. It prints `€0.00` for an airdrop or reward whose
market valuation the backend did resolve, and it erases the unknown-versus-zero distinction that
`ILedgerPort.ts:37-41` documents as a recorded fact. A screen asserting that something was worth
nothing, when a resolved value exists one layer away, is worth fixing on its own terms.

`CsvIngestionUseCase`'s comment is cited in the table below for one purpose only: as evidence that
the backend **does** populate `total_fiat` for income rows. That comment describes a risk in the
**ingestion** layer, at persist time, when `total_fiat` would be stored `NULL` — a different layer
and a different moment. The frontend's `?? 0` cannot make anything disappear from the general base,
because the general base is not read from here.

The hard part is that **`totalEur` is not a passthrough — the `switch` re-derives it per operation
type**, so "use `nullableNumericField`" does not by itself say what each branch should produce. A
forced `0` is sometimes a fact and sometimes a discarded valuation, and the two must be separated by
argument, not by uniformity. The criterion: **`Money('0')` only where zero is a structural property
of the operation itself; `null` where the figure exists in principle but was not resolved; a
passthrough wherever the backend resolved one.**

**Measured this revision, and it empties the criterion's first arm for this transform.**
`resolveFiatMagnitudes` is called on the single spot path at `CsvIngestionUseCase.ts:388`, before the
`LedgerSpotTransaction` literal is built, and **it branches on no `tx_type` at all** (`:739-772`):
it reads `total_fiat`/`price_fiat`, and when the source stated neither it fetches a market unit price
for `asset_in || asset_out` (`fetchUnitPrice`, `:775-790`) and multiplies by the quantity. So a
`TRANSFER_IN` of BTC, a `DEPOSIT`, a `WITHDRAWAL` and a `TRANSFER_OUT` all carry a **resolved
`total_fiat`** whenever a price series answered. The four branches that forced `Money('0')` were
therefore discarding a figure the backend had resolved — the identical defect this table fixes one
row down for `AIRDROP`/`REWARD`, and the identical *method* error already corrected twice in this
document: the zero was inferred from `tx_type` in the presentation layer instead of measured at the
emitter. Inferring a source's zero from an operation type is also what CLAUDE.md rule 7 forbids: had
a source genuinely meant "this row has no fiat magnitude", that is a declaration for
`sourceProfile/profiles.ts`, not a global assumption in a Zod transform.

| Branch | Today | Decision | Cell renders | Why |
|---|---|---|---|---|
| `BUY` | `raw.amount_out ?? total_fiat ?? 0` | `raw.amount_out ?? raw.total_fiat ?? null` | value, else `—` | The fiat leg paid. It exists by definition; if neither field arrived, it is unknown, not free. |
| `SELL` | `raw.amount_in ?? total_fiat ?? 0` | `raw.amount_in ?? raw.total_fiat ?? null` | value, else `—` | Symmetric — the fiat proceeds received. |
| `SWAP`, `MIGRATION_SWAP` | `total_fiat ?? 0` | `raw.total_fiat ?? null` | value, else `—` | Crypto-for-crypto still has a fiat counter-value at the moment of the swap. An unresolved one is unknown; `0` would state the swap moved nothing of value. |
| `DEPOSIT`, `TRANSFER_IN` | forced `0` | `raw.total_fiat ?? null` | resolved valuation, else `—` | **Inverted in this revision.** The old reading — "moving your own asset in has no fiat counterparty, so zero is the fact" — describes a *consideration*, and `total_fiat` is not one: the emitter resolves a market valuation for every row regardless of type. `€0.00` states the moved asset was worth nothing; the resolved valuation is what the backend actually knows, and `—` is the honest answer when no price answered. Consistent with `AIRDROP`/`REWARD` below, whose figure is a valuation of exactly the same kind. |
| `WITHDRAWAL`, `TRANSFER_OUT` | forced `0` | `raw.total_fiat ?? null` | resolved valuation, else `—` | Same, outbound. |
| `AIRDROP`, `REWARD` | forced `0` | `raw.total_fiat ?? null` | resolved value, else `—` | **The branch the forced `0` was getting wrong.** Measured: `CsvIngestionUseCase.resolveFiatMagnitudes` (`:739-772`) runs for every ingested row regardless of type and resolves a market valuation when nothing is stated — hence its comment about a promotional credit resolving to `0`. Cited only as evidence that `total_fiat` *is* populated for income rows; the frontend was discarding a value it had. |
| `FEE` | forced `0` | `raw.total_fiat ?? null` | resolved value, else `—` | A fee has a real fiat cost, resolved by the same path as `AIRDROP`. |
| `default` / `UNKNOWN` | `total_fiat ?? total_eur ?? 0` | `raw.total_fiat ?? null` | value, else `—` | An unclassifiable row is the definition of "we do not know". |

**`null` must render as `—`, and that requires a call-site change — measured trap.**
`formatCurrency(null)` returns `'€0.00'` (`useFormatters.ts:7`), so simply retyping the field and
leaving `{{ formatCurrency(tx.totalEur) }}` in place would re-fabricate the zero the decision
removes, silently. The cell becomes an explicit `null` gate rendering `'—'`, following the precedent
`figureText` already sets for exactly this reason (`useConvertedAmountDisplay.ts:94-100`: "`null`
renders as a dash rather than a zero: no price was ever resolved for the event, and a `0` would
state that it earned nothing"). `formatCurrency` itself is **not** changed — D6 stands, and other
callers depend on its current null behaviour; the gate lives at the one call site that now has a
nullable field.

**The first of the change's four deliberate render changes**, enumerated per column in D15's
closing table: one column ("Total") of one table (`TaxTransactionsTable.vue`). After this revision
the affected row set is **every spot type**, not a subset — `AIRDROP`, `REWARD` and `FEE` rows move
from a fabricated `€0.00` to their resolved value; `DEPOSIT`, `TRANSFER_IN`, `WITHDRAWAL` and
`TRANSFER_OUT` rows do the same, having lost their forced zero; and any row whose fiat magnitude
never resolved moves from `€0.00` to `—`. **No branch of this transform renders `€0.00` by
construction any more, so the `null` gate at `:313` is load-bearing for every row** — see the guard
table in D15's closing section.

Nothing in the tax report, no total, no base and no `estimatedIrpf` changes: there is no figure to
reconcile and no discrepancy to hunt for. **Rule 6, explicitly:** rendering a valuation in the Total
column of a `TRANSFER_IN`/`TRANSFER_OUT` row creates no taxable disposal and touches neither
ordering — the global per-asset tax FIFO is materialised backend-side from the ledger
(`PARTITION BY asset_id ORDER BY timestamp, tx_id`), per-account custody keeps its own oldest-first
allocation and its synthetic `ownwallet-<ASSET>` counterparty, and this transform feeds a table cell
that no allocation, queue or base reads.

`__tests__/zod-schemas.test.ts:209` (`totalEur).toBe(0)` on a `DEPOSIT`) **no longer stays green in
substance** — the previous revision said it would, on the now-falsified premise. It pinned the forced
zero, so it is rewritten to assert the passthrough: a `DEPOSIT` carrying `total_fiat` yields that
value, and a `DEPOSIT` carrying none yields `null`. Both cases must be watched go red against a
restored `totalEur = 0`.

Consumers of `totalEur` must then gate on `null` before any `Money` method, exactly as
`getEventVariant` already does for `gainLoss` — the pattern exists and is not being invented. Since
the measured consumer set is three passthroughs and one cell, that is four sites, not a sweep. And
per CLAUDE.md's "Nullable is a real state", `null` must never be re-collapsed to `0` downstream, in a
formatter or in a sum.

*Rejected:* leaving `totalEur` as `Money` and keeping the `?? 0`, on the grounds that a display-only
field cannot cause a miscalculation. The field is the *only* place this operation's fiat value is
shown to the user, and `ILedgerPort.ts:37-41` records unknown-versus-zero as a fact the layers below
went to trouble to preserve. Discarding it at the last hop, in the one place a human reads it, is the
worst place to discard it.

*Rejected:* `nullableNumericField` for the passthrough but keeping the forced `0` in every derived
branch. It would satisfy the letter of the rule at the one field that is barely read and leave the
fabrication in the branches that actually produce `totalEur` for most rows.

*Rejected (and this is what the previous revision decided):* `Money('0')` for
`DEPOSIT`/`TRANSFER_IN`/`WITHDRAWAL`/`TRANSFER_OUT`, on the argument that an internal movement has no
fiat counterparty so zero is structural. Rejected on measurement, not on taste: the emitter resolves
`total_fiat` for those rows exactly as it does for every other type, so the "structural zero" was a
presentation-layer inference over `tx_type` that discarded a known figure. It was also unfalsifiable
in the shape it was written — with the forced `0` in place, no test could distinguish a source that
stated nothing from one whose valuation resolved.

*Rejected:* keeping the forced `0` for those four types but only when `total_fiat` is absent. That is
`?? 0` narrowed to four branches, and the branch table's whole purpose is that absence means
unresolved everywhere in this transform.

### D12 — the legacy `*_eur` wire aliases are deleted

`ExternalTaxSchemas.ts:70-77` accepts `price_eur`, `fee_eur` and `total_eur` beside the canonical
`price_fiat`, `fee_fiat`, `total_fiat`, with `??` fallbacks at `:100`, `:136`, `:150` and `:151`.
Measured on the emitter side: `grep -rn 'total_eur|price_eur|fee_eur' apps/backend/src` finds these
three names in no route, use case or port — only in `data/mockPortfolio.ts` (`avg_price_eur`, a
different field on a different schema) and in a `GetTokenHistoryUseCase.spec.ts:428` assertion that
a field is *absent*. Nothing emits them. Decision: delete the three alias keys and the four `??`
fallbacks.

Checked before deciding, as the aliases could have live feeders in tests:
`apps/frontend/src/__tests__/zod-schemas.test.ts` does feed `price_eur`/`fee_eur` to
`ExternalTaxTransactionSchema` at lines 156-157, 180-181, 200, 219, 236 and 253 — seven fixture
occurrences across the BUY/SELL/DEPOSIT/etc. cases. These are fixtures written to the alias, not
evidence of a producer, so they are renamed to `price_fiat`/`fee_fiat` in the same commit. Recorded
so this does not surface as a surprise red suite.

*Rejected:* keeping the aliases "in case an old backend is deployed". There is no such deployment
path — the backend and frontend ship from one monorepo at one version — and CLAUDE.md rule 8 forbids
carrying compatibility nobody needs. Keeping them also keeps alive the exact failure mode
`ExternalTaxReportSummarySchema`'s own comment describes: "Six required fields, not nineteen optional
aliases falling back to `0`. The alias soup existed to tolerate backend drift, and it did the
opposite."

*Rejected:* deleting the aliases in a separate change. They are read by the very `??` chains D11
rewrites; touching those lines twice would be churn, and the second pass would have to re-measure
the emitter.

### D13 — `lib/utils.ts`'s dead precision cluster is deleted, all eight exports

Measured name by name with `grep -rlw` across `apps/frontend/src`, excluding `lib/utils.ts` itself.
No consumer anywhere: `MONETARY_FIELDS`, `safeAmountToNumber`, `gt`, `lt`, `isPositive`,
`isNegative`, `isZero`, `formatAmount`, `stringToColor`. Kept, because they have real consumers:
`cn` (52 files), `getDeterministicHue` (4), `CSSVars` (3). Two residual grep hits were checked and
are not consumers: `assets/favicon.svg` contains the letters `gt`, and
`TaxReportSummaryCards.vue:53` declares its **own local** `isPositive` without importing this one
(which is also why D2's third call site does not contradict this measurement).

The cluster must go **whole**. Deleting only the four names first identified would leave
`safeAmountToNumber` alive as the last remaining dependency of nothing — and it is the defect:
`parseFloat(n.toFixed(5))`, truncating every value to five decimals. `isZero` is worse than it looks:
`Math.abs(safeAmountToNumber(val)) < 0.00001` declares anything under `1e-5` to be zero, which over
crypto quantities is not a zero but a holding. `formatAmount` is
`safeAmountToNumber(val).toFixed(5)`. `gt`, `lt`, `isPositive` and `isNegative` all compare through
the truncating helper. Eight exports; the file is left with `cn`, `CSSVars` and `getDeterministicHue`.

`stringToColor` is included **as dead code, not as a precision defect** — it is deterministic
colouring, no money involved. It is deleted because it is in the same file, has zero consumers, and
`getDeterministicHue` is the function that superseded it; leaving one dead export behind while
removing eight would be arbitrary. Stated explicitly so the delta and the verifier can see the
distinction.

*Why this belongs in this change rather than a "dead code" one:* it is the same defect class this
change exists to eliminate, sitting in the same layer, and CLAUDE.md rule 8 does not permit
dragging it along. A working `safeAmountToNumber` left in `lib/utils.ts` is a loaded gun for the
next implementer looking for a "compare two amounts" helper while every fiscal field is being
retyped to `Money` — the one moment someone is most likely to reach for it.

*Rejected:* deleting only `safeAmountToNumber` and keeping the boolean helpers with an exact
implementation. There is no consumer to serve, `Money` now answers those questions (D5), and
`compareDecimalStrings` answers them for strings (D1). Rewriting dead code is not a fix.

### D14 — `saleFeeEur` is a fabricated zero at source; the emitter stops asserting it and the field becomes `Money | null`

`saleFeeEur` was in the seventeen-field inventory from the start and its emitter had never been
measured — the same omission that produced D7's false premise. Measured now:

- `GetSpanishTaxReportUseCase.ts:190` emits a hardcoded `sale_fee: 0` into every `audit_trail` row.
- `GetSpanishTaxReportUseCase.ts:63` declares it `sale_fee: number` — the **only** non-nullable
  figure in that DTO block, sitting directly beneath `sale_price: ConvertedAmount | null` and
  `gain_loss: ConvertedAmount | null`, whose shared comment (lines 55-60) says a `'0'` "would read as
  a genuine disposal at zero, which is the failure mode the nullable column exists to prevent".
  `sale_fee` is the exception to the rule its own neighbour documents.
- `GetTokenHistoryUseCase.ts:85` declares `sale_fee?: number` and **never assigns it**; `grep -n
  'sale_fee'` over that file returns the declaration and nothing else. On that route the field is
  always `undefined`.
- The consumer: `ExternalTaxSchemas.ts:219` (`sale_fee: numericField.optional()`) mapped at `:254` to
  `saleFeeEur`, rendered at `TaxReportDetailsTable.vue:286-287`. Because `0` is not `null`, the tax
  report's fee column shows `€0.00` on **every** row and the dash branch is unreachable there.

Retyping `saleFeeEur` to `Money` without touching the emitter would turn a fabricated zero into an
*exact* fabricated zero wearing a type that asserts precision. Same defect class as D11, same remedy.

**1. The emitter is in scope, and it emits `null` — it does not compute a fee.** Checked as
instructed whether `evt` carries fee data at that point: it does not.
`ConvertedDisposalEvent` (`ITaxCalculatorPort.ts:72-95`) has no fee member at all —
`grep -n 'fee\|Fee' core/domain/ports/ITaxCalculatorPort.ts` returns nothing. So there is nothing
available to emit, which settles it: `sale_fee: 0` is not a placeholder for a value in hand, it is an
assertion with no source. `sale_fee` becomes `ConvertedAmount | null` and line 190 emits `null`.

*Carrier choice:* `ConvertedAmount | null`, matching its two neighbours in the same DTO, rather than
a `PreciseAmount | null`. A fee is a figure in the report's currency and will one day need the same
`CONVERTED`/`NATIVE`/`UNCONVERTIBLE` outcome as the sale price beside it; giving it a different
carrier now would guarantee a second migration when it is finally computed. Nothing changes for the
frontend, which reads it through the same `ConvertedAmount` machinery D1 keeps.

*Explicitly out of scope:* actually resolving the fee. That means threading a fee through
`ConvertedDisposalEvent` and the FIFO event projection — its own change. This decision only stops the
report claiming zero.

*Rejected:* leaving the emitter alone and typing the frontend field `Money`. It is precisely D7's
error repeated: modelling an invented number exactly.

*Rejected:* deleting `sale_fee` from the audit-trail DTO as unused. It is rendered — there is a
column for it — so removing it would remove a column the user sees, which is a product decision, not
a cleanup.

**2. The frontend field becomes `saleFeeEur: Money | null` — two states, and the `?` goes.** Today it
is `saleFeeEur?: number`. The three-state `Money | null | undefined` is rejected outright under
CLAUDE.md rule 5: `undefined` would mean "this route does not carry fees" and `null` "the fee was
never resolved", and **no reader distinguishes them** — `TaxReportDetailsTable.vue:286`'s `!= null`
catches both, and it is the only reader. A distinction with no consumer is exactly the
representable-but-meaningless state rule 5 exists to forbid. Both wire shapes therefore land on
`null`: `ExternalTaxLotHistorySchema` (`ExternalTaxSchemas.ts:205-260`, the single schema serving both
the token-history and audit-trail routes) reads the key as nullable-and-optional and maps an absent
or null wire value to `null`.

*Note for the spec delta:* `fiscal-domain`'s scenario requiring that optionality "not be collapsed
into `Money('0')`" is satisfied — nothing here becomes `Money('0')`. If that scenario is read as
requiring the literal `?` to survive, it needs adjusting, because `Money | null | undefined` invents a
state no code reads.

*Rejected:* keeping `?` and using `Money | undefined` with no `null`. It would force the emitter to
omit the key rather than state `null`, which is a weaker signal: an omitted key is
indistinguishable from a field the sender does not know about, while `null` is a recorded "no
figure" — the same argument `ILedgerPort.ts:37-41` makes for `total_fiat`.

**3. The render change, and the D11 trap does not recur here.** Verified: the guard at
`TaxReportDetailsTable.vue:286-287` is `event.saleFeeEur != null ? formatCurrency(event.saleFeeEur) :
'—'`, and `!=` (loose) catches `null` and `undefined` alike, so a `null` never reaches
`formatCurrency` and never becomes its `'€0.00'` fallback (`useFormatters.ts:7`). **The existing guard
is sufficient**; the call site needs only `formatCurrency(event.saleFeeEur.toString())` per D6. That
is the difference from D11, where the cell had no guard at all.

**This is the second of four deliberate render changes**, scoped as tightly as D11's: the fee column
of `TaxReportDetailsTable.vue` moves from `€0.00` to `—` on **every** audit-trail row, because every
one of them was showing a fabricated zero. Rows reached through the token-history route already
render `—` (the field was always `undefined` there) and are unchanged. No total, base or
`estimatedIrpf` is affected — `sale_fee` is display-only and feeds no computation, exactly like
`totalEur`.

Two test fixtures pin the old shape and must move with it: `__tests__/backend-contract.spec.ts:80`
(`sale_fee: 0` in a `TaxReportAuditTrailEventDto` literal — a contract test, so it must assert the
nullable shape) and `core/infrastructure/dtos/__tests__/ExternalTaxSchemas.spec.ts:142`
(`sale_fee_eur: 0.5`, which feeds a *legacy* key the schema does not even read — worth deleting while
it is being touched, and `data/mockTax.ts:109`'s `sale_fee_eur: 5` is the mock emitting the same dead
name).

**4. `GetTokenHistoryUseCase.ts:85`'s `sale_fee?: number` is deleted.** It is declared and never
assigned — dead by the same measurement standard as D13, and now doubly so: after this decision the
token-history route has no fee to report and the frontend schema defaults the field to `null`.
Keeping an unassigned optional key would mean the DTO advertises a figure the route does not produce.
It lands in commit 0b with D0's other changes to that file.

*Rejected:* populating it instead. Same reason as point 1 — there is no fee value available on that
path either, and inventing one is the defect.

### D15 — `TaxDerivativeEntity`'s five `?? 0`: the emitter changed, all five carriers are optional, all five become `Money | null`

**Premise failure, corrected for the second time in this document — and this time the conclusion
survives for a different reason than the one that produced it.** The previous revision decided
`amount` and `tradePrice` → `Money | null` on the premise that *the emitter does not emit them at
all*: `/api/tax/transactions/futures-derivatives` served `DerivativesPnl`
(`IPortfolioAnalyticsPort.ts:26-33`), a `GROUP BY ft.symbol` aggregate, and a sum of positions has no
single size and no single execution price. That premise is gone.
`openspec/changes/align-derivatives-pnl-contract/`'s **D1 deletes that route** (`routes/tax.ts:110-118`)
and repoints `getFuturesDerivatives()` at `/api/tax/transactions/futures`, whose emitter is
`LedgerFuturesTransaction`. Its own **D5 says so in those words** and hands the correction here.

`Money | null` for `amount` and `tradePrice` is still the right conclusion. It now rests on two
measured facts instead of a structural impossibility:

1. **The emitter declares them optional and the absence is genuinely reachable.**
   `ILedgerPort.ts:69-70` is `amount?: PreciseAmount` / `trade_price?: PreciseAmount`, and
   `SQLiteLedgerAdapter.ts:247-248` maps a NULL column to `undefined`
   (`row.amount ? toPreciseAmount(...) : undefined`). The columns are nullable TEXT with a
   NULL-tolerant `CHECK` (`002_ledger_schema.sql:64-65`), so NULL is a stored state, not a
   theoretical one.
2. **A funding row has no position size and no execution price.** Naming it precisely, because the
   two layers use different vocabularies and the brief for this revision used a third: the emitter's
   type is **`FUNDING_FEE`**, one of the four members of `FuturesTxType`
   (`packages/shared-types/src/schemas/ledger.ts:19-23` — `TRADE`, `FUNDING_FEE`, `SETTLEMENT`,
   `LIQUIDATION`, matching the SQL `CHECK` at `002_ledger_schema.sql:62`). **`FUTURES_FUNDING` is not
   a `FuturesTxType`**; it is the *frontend entity's* name for the same thing
   (`FiscalEntities.ts:28-32`), produced by `mapFuturesType`'s `funding_fee`/`funding` keys
   (`ExternalFuturesSchemas.ts:97-109`). Checked rather than assumed, because asserting an
   enum member that does not exist is how the first D15 premise died.
3. **Stronger still for `tradePrice`: nothing writes it.** `CsvIngestionUseCase.ts:444-457`
   constructs every persisted `LedgerFuturesTransaction` and sets no `trade_price` key at all, so the
   column is NULL for every ingested row regardless of type. `SQLiteLedgerAdapter.ts:298` is the only
   writer and it writes what the entity carries. So `tradePrice` is *always* absent today — a
   `Money('0')` there would be a fabrication on 100% of rows.

**The three fields the previous revision made non-nullable are re-decided, and the decision inverts.**
Their old justification was `DerivativesPnl`'s declaration: `realizedPnl: string`, `fees: string`,
`funding: string`, all **required**, so a `?? 0` was unreachable defence. At the new emitter they are
`realized_pnl?`, `funding_amount?` and `fee_amount?` (`ILedgerPort.ts:71,73,75`), each emitted as
`row.x ? toPreciseAmount(...) : undefined` (`SQLiteLedgerAdapter.ts:249,251,253`) over a nullable TEXT
column (`002_ledger_schema.sql:66,68,70`). The `?? 0` is now a live fabrication on real rows.

The criterion is D11's, unchanged: **`Money('0')` only where zero is a structural property of the
operation itself; `Money | null` where the figure exists in principle but was not resolved.** What
decides every one of the five the same way is a single measurement: **the emitter distinguishes a
stated zero from an absence, and it preserves the stated zero.** The columns are TEXT, so a persisted
`'0'` is a truthy string and survives the `row.x ? …` gate as `'0'`; `undefined` is therefore reached
only by a SQL NULL. And the ingestion layer says in its own words what that NULL means:
`CsvIngestionUseCase.resolveFee`'s `NO_FEE` branch (`:681-685`) persists `amount: '0'` for a stated
zero that has a denomination, and comments that an undenominated zero "could only be stored as the
NULL that means *unknown*". A carrier that can say "zero" and chooses to say "nothing" is not saying
zero.

| Field | Emitter's declaration | Decision | Why |
|---|---|---|---|
| `amount` | `amount?: PreciseAmount` (`ILedgerPort.ts:69`), `SQLiteLedgerAdapter.ts:247` | `Money \| null` | A `FUNDING_FEE` row has no position size. Absence is a stored NULL, and a stated `'0'` size would arrive as `Money('0')` — the two states stay separable. |
| `tradePrice` | `trade_price?: PreciseAmount` (`:70`), `SQLiteLedgerAdapter.ts:248` | `Money \| null` | Same, plus point 3 above: no writer populates it, so it is absent on every row today. |
| `realizedPnl` | `realized_pnl?: PreciseAmount` (`:71`), `SQLiteLedgerAdapter.ts:249` | `Money \| null` | **Inverted.** No `tx_type` makes it structurally zero — a `TRADE` may or may not close a position, and `SETTLEMENT`/`LIQUIDATION` always realize something. Absence means the source stated no realized result for this row, which is not the same claim as "it realized exactly nothing", and this is the change's single most fiscally load-bearing figure (`FiscalEntities.ts:52` — "the primary taxable figure for AEAT IRPF"). A fabricated `0` here is a declared figure nobody measured. |
| `fees` | `fee_amount?: PreciseAmount` (`:75`), `SQLiteLedgerAdapter.ts:253` | `Money \| null` | **Inverted.** `resolveFee` (`:679-685, 705-725`) persists `'0'` for a stated, denominated zero and NULL for both "no fee stated" and "fee stated but its denomination is unresolved" (`PENDING_REVIEW`). The second is a fee that exists and was not resolved. So absence here cannot mean "the source stated none". |
| `funding` | `funding_amount?: PreciseAmount` (`:73`), `SQLiteLedgerAdapter.ts:251` | `Money \| null` | **Inverted.** Same gate, same stated-zero preservation (`CsvIngestionUseCase.ts:453`). A funding figure absent from a `TRADE` row is unstated, not measured-as-zero. |

*Rejected — `Money('0')` for `realizedPnl`, `fees` and `funding`, on the argument that an opening
trade realizes nothing and a fee-less trade has no fee, so zero is the operation's structural
property.* This is the closest call in the revision and it is defensible in the abstract; it is
rejected because it is **not measurable at this emitter**. Structural zero would have to be derivable
from `tx_type`, and it is not: the four types do not partition into "can carry this figure" and
"cannot", and the NULL that would be read as a structural zero is the same NULL that
`resolveFee` documents as unknown. If a given exchange genuinely never states realized PnL on
opening trades, that is a **source convention and it belongs in `sourceProfile/profiles.ts`**
(CLAUDE.md rule 7) as a declared per-source semantic — not as a global display-layer assumption that
one shape of NULL means zero, which is the exact defect class that seam exists to eliminate.

*Rejected — `Money | null` for two and `Money('0')` for three, i.e. keeping the previous revision's
split with new reasoning.* The split's whole basis was the old emitter's required/absent asymmetry.
At `LedgerFuturesTransaction` all five carriers are the same shape — optional `PreciseAmount`, NULL
column, stated zero preserved — so any split would have to be invented rather than measured.

*Rejected — keeping non-null `Money` with `Money('0')` where absent and rewriting the `!== 0`
sentinels as `isZero()`.* That is the current defect restated in an exact type: one value meaning two
things, which is the rule-5 antipattern whose recurring shape CLAUDE.md describes as "an explicit
`fee: '0'` collapsing into 'no fee'". `TaxDerivativesTable.vue:212,219` already reads `0` as
"absent" and `:254` gates the fee/funding breakdown on `tx.fees !== 0 || tx.funding !== 0`, so a
genuinely zero fee is invisible today. `null` in the type is what ends that.

**D15 proper now DOES change what is rendered — three columns of `TaxDerivativesTable.vue`.** This
reverses the previous revision's "D15 itself changes nothing on screen", which was true only of the
aggregate emitter, where `amount`/`tradePrice` were always absent and the other three always present.
The baseline for the comparison is the state after `align-derivatives-pnl-contract`, since the table
renders no rows at all before it. Measured per column:

| Column / site | After `align-…` alone | After D15 | Why it moves |
|---|---|---|---|
| Amount (`:211-213`) | `?? 0` then `tx.amount !== 0 ? formatNumber(...) : "---"` | explicit `tx.amount === null` gate → `—`, else the value | Absent still shows a dash; a **genuinely zero** size now shows `0` instead of a dash. That is the sentinel defect being fixed, not a new behaviour. |
| Trade Price (`:215-220`) | `---` on every row | `—` on every row | No change in substance: the field has no writer (point 3). The gate becomes honest about *why*. |
| PnL (`:222-238`) | `formatCurrency(0)` → `€0.00`, no icon | `—`, no icon | **The material change.** Rows whose `realized_pnl` is NULL stop asserting a realized result of zero on the report's primary taxable figure. |
| Fees/Funding + net impact (`:240-260`) | `€0.00` net impact, breakdown hidden by `tx.fees !== 0 \|\| tx.funding !== 0` | `—` net impact when either operand is unresolved; breakdown shown when either is a resolved non-zero | Same reason, plus a genuinely zero fee now shows in the breakdown instead of being suppressed. |

Consequences to implement, all inside commit 1:

- **`formatCurrency(null)` returns `'€0.00'` and `formatNumber(null)` returns `'0'`** — the same trap
  D11 measured. Every one of the four sites above needs an explicit `=== null` gate rendering `—`;
  retyping the field without the gate silently re-fabricates the zero. `useFormatters.ts` is not
  changed (D6).
- **`getPnlClass`** (`useDerivativesTable.ts:83-87`, `pnl > 0` / `< 0`) becomes
  `Money | null` → `null` takes the neutral `text-muted-foreground` arm, and the two live arms use
  `isPositive()` / `isNegative()`. The `v-if="tx.realizedPnl > 0"` / `v-else-if="… < 0"` icon pair
  (`:229,:233`) gates on `null` first.
- **`getNetImpact`** (`useDerivativesTable.ts:99-101`, `-tx.fees + tx.funding`) returns
  `Money | null`: `tx.funding.sub(tx.fees)` when both are resolved, **`null` when either is not**.
  It must not sum a `null` as zero — CLAUDE.md's "Nullable is a real state", and the same rule D11
  states as "`null` must never be re-collapsed to `0` downstream, in a formatter or in a sum". A net
  impact computed from an unknown component is a fabricated figure, so the cell renders `—` and the
  `>= 0` class ternary (`:243-247`) gets the null arm first — `null >= 0` is `true` in JavaScript,
  which is the bug this project has already shipped once.
  *Rejected:* summing only the resolved components. It is `?? 0` wearing a different name.
- **The sort comparator** (`useDerivativesSort`, `useDerivativesTable.ts:35-43`) sorts on
  `realizedPnl`, which is now nullable, so D8's comparator split needs a null rule here that the
  other comparators do not: **`null` sorts last in both directions** (unresolved rows are not
  "smaller" than a loss), implemented as an explicit null check before `compareTo`, and the
  comparator stays total so `Array.prototype.sort`'s stability still applies. Per CLAUDE.md rule 3
  the ascending *and* descending assertions must each be watched go red against a deliberate sign
  break.
- **The `?? 0` fallbacks** at `ExternalFuturesSchemas.ts:171-175` (five of them) are what
  `align-derivatives-pnl-contract` D3 deliberately leaves standing "for this change only"; commit 1
  replaces them with `Money` construction on the present branch and `null` on the absent one, reading
  the emitter's own keys (`amount`, `trade_price`, `realized_pnl`, `fee_amount`, `funding_amount`)
  as that change's rewritten schema declares them.

**The emitter is not touched, and this is not the D0/D14 situation.** `LedgerFuturesTransaction` is
correct: it declares five optional exact carriers, it preserves a stated zero, and its NULLs mean
what `resolveFee` says they mean. The fabrication is entirely in the frontend's `?? 0`. Stated so
nobody opens `SQLiteLedgerAdapter` or a DuckDB view for this. Two real defects *were* found in the
emitter while measuring and are deliberately out of scope, recorded so they are not lost: no writer
populates `trade_price` (point 3 — a futures-ingestion gap, not a precision one), and
`SQLiteLedgerAdapter.ts:247-253`'s truthiness gate would also collapse an empty-string column value
to `undefined`, which cannot occur under the current `CHECK` constraints but is a latent conflation.
Both belong to a futures-ingestion change.

**Point 3, the legacy aliases in this file: D12's deferral is now resolved elsewhere, not by this
change.** The previous revision deferred `ExternalFuturesSchemas.ts`'s `price_eur` (`:148`, read at
`:175`) and `fee_eur` (`:154`, read at `:177`) because their emitter was unmeasured, and it could not
be measured while the route served a shape the schema could not parse at all.
`align-derivatives-pnl-contract`'s **D3 deletes both**, along with every other alias with no
producer, and deletes the `futures-schemas.test.ts:175-196` alias-tolerance test that kept them
alive. So this change inherits an alias-free `CexFuturesLedgerSchema` and adds no decision of its
own here; if commit 1 still finds an alias in that file, the prerequisite change has not fully
landed and commit 1 must not proceed.

**Closing the audit loop: one more site, and it is inside D11's own transform.** The seventeen-field
emitter audit checked carrier *precision* but not emitter *optionality*, so it was re-run for the
latter. The pattern appears in exactly one place beyond D11's `total_fiat` and D15's five:
`ExternalTaxSchemas.ts:150-151`.

- `priceEur: raw.price_fiat ?? raw.price_eur ?? 0` — but `price_fiat` is
  `PreciseAmount | null` (`ILedgerPort.ts:44`), sitting under the *same* comment that documents
  `total_fiat`'s null as "genuinely unknown". This is D11's defect on a second field, one line below
  it. **Decision: `priceEur` becomes `Money | null` on the same terms and in the same commit as
  `totalEur`** — passthrough, `null` when unresolved, and its cell
  (`TaxTransactionsTable.vue:306`, `formatCurrency(tx.priceEur)`) takes the same `—` gate, since
  `formatCurrency(null)` would otherwise print `€0.00`. It shares D11's render-change scope: one more
  column of the same table.
- `feeEur: raw.fee_fiat ?? raw.fee_eur ?? 0` — **re-decided in this revision, and it inverts.**
  The previous decision (non-null `Money`, `?? 0` → `Money('0')`) rested on two claims, and the
  measurement kills both.

  **(a) An absent `fee_amount` does not mean "the source stated no fee".** `resolveFee` is the
  **same function** for spot (`CsvIngestionUseCase.ts:415`) and futures (`:454`) — one `resolveFee`
  call per market, both writing `fee.amount === null ? undefined : toPreciseAmount(...)`. So the
  argument that inverted `fees` and `funding` in the derivatives table above applies to this field
  verbatim; deciding the two differently was the asymmetry, not the alignment. Traced to the emitter,
  `fee.amount === null` has **three** distinct producers and only one of them is a zero:

  | Producer | What the source did | What NULL then means |
  |---|---|---|
  | `NO_FEE` with `stated: false` (`appliers.ts:379`, from `resolveFeeDenomination`'s `ABSENT` at `:87-88`) | left the fee cell empty | unknown — the type's own comment (`appliers.ts:68`) reads "The source stated no fee, which is not the same as stating none was charged" |
  | `NO_FEE` with `stated: true` but no `row.fee_currency` (`CsvIngestionUseCase.ts:683-685`) | wrote an explicit `0` with no resolvable unit | a genuine zero, **discarded** — the ledger's pair invariant admits no amount without an asset, so it is stored as "the NULL that means unknown", in the emitter's own words |
  | `PENDING_REVIEW` with an unresolvable unit or an unparseable figure (`:705-725`) | charged a fee and named it ambiguously | a fee that **exists** and was not resolved |

  A stated, denominated zero is preserved as the string `'0'` and arrives as `'0'`. Absence is
  therefore the union of "unknown", "a zero we could not write down" and "unresolved" — three
  states a `Money('0')` would collapse into a declared zero. Under D11's criterion that is `null`.

  **(b) Checked as instructed whether any path makes absence legitimately mean "no fee", including
  the profiles: none does, and none can.** `resolveFeeDenomination` returns `ABSENT` *before*
  `declaredDenomination` is ever called (`appliers.ts:87-88`), so no `SourceFormatProfile` is
  consulted for an empty fee cell; `profile.feeDenomination`'s three kinds (`ROW_ASSET`,
  `NAMED_COLUMN`, `COLLATERAL_CURRENCY`) each answer only *what unit* a fee is charged in, never
  whether an empty cell means zero, and `resolveGrossNetFee`'s `NO_FEE` branches all fire on
  `!hasFee` without consulting the convention either. **No source can currently declare that its
  empty fee cell means no fee was charged**, so there is no per-source semantics for the frontend to
  honour and nothing for the asymmetry to have been protecting.

  **Decision: `feeEur` becomes `Money | null`**, on the same terms and in the same commit as
  `totalEur` and `priceEur`: `moneyField` → `nullableMoneyField`, `?? 0` → `?? null`.

  **(c) A second, larger measurement fell out of the emitter check, and it changes what the field
  reads.** `fee_fiat` **is never emitted by anything.** `/transactions/spot` and
  `/transactions/futures` (`routes/tax.ts:100-109`) serialise `LedgerSpotTransaction` /
  `LedgerFuturesTransaction` verbatim, and those declare the fee as **`fee_amount` +
  `fee_asset_id`** (`ILedgerPort.ts:35-36`, `:75-76`) — not `fee_fiat`. `grep -rn 'fee_fiat'
  apps/frontend/src` returns the schema's own declaration (`ExternalTaxSchemas.ts:74`) and its read
  (`:151`), nothing else; over `apps/backend/src` it returns only DuckDB futures-PnL view internals
  (`DuckDbMetricsAdapter.ts:283,311`, `DuckDbTaxCalculatorAdapter.ts:516,558`,
  `DuckDbAdapter.ts:287`), which serve other routes. So `feeEur` is `0` on **100% of rows today**,
  and once D12 deletes the `fee_eur` alias the field has no producer key at all. This is D14's
  `sale_fee` exactly: a hardcoded zero, invisible because nothing reads it.

  Consequence written into the decision: `feeEur` is `Money | null` and is **`null` on every row**
  until a producer exists. The DTO stops fabricating; the field does not start asserting.

  *Rejected — repointing the schema at the emitter's real key, `fee_amount`.* It is the tempting
  one-line fix and it is a unit fabrication. `fee_amount` is denominated in `fee_asset_id`, which
  `routeFee` resolves to a **crypto asset** on the `ASSET_DISPOSAL` path (`appliers.ts:425`) and to a
  fiat currency only on `BASIS_ADJUSTMENT` (`:413`); mapping it into a field named `…Eur` would print
  a `0.0001 BTC` fee as `€0.0001`. The honest shape is the discriminated union the emitter already
  computes — an asset-quantity fee versus a fiat-valuation fee, per CLAUDE.md rule 5 — carried on the
  wire beside its unit. That is a fee-exposure change of its own, named here so it is not lost, and
  it is why the field is kept rather than deleted.

  *Rejected — deleting `feeEur` outright as dead.* It has no reader in production code (measured
  below), so D13's standard is nearly met — but not met: D13 deleted helpers with **no consumer and
  no producer and a superseding implementation**, whereas `feeEur`'s producer exists one key over and
  its exposure is the named follow-up. Deleting the field and re-adding it a change later is churn,
  and it would also drop the concept from `ITaxPort`, `MockTaxTransactionSchema` and the
  contract-test surface for no gain.

  *Rejected — keeping non-null `Money` and letting `Money('0')` stand until the follow-up.* It would
  leave this change shipping one exactly-typed fabricated zero while removing eight others, on a
  field whose emitter was the very thing this revision re-measured.

  **No render change, and this is measured, not assumed.** `grep -rn 'feeEur' apps/frontend/src`
  returns eight sites: the DTO construction (`ExternalTaxSchemas.ts:151`), three passthroughs
  (`RestTaxAdapter.ts:107,139,183`), the entity declaration (`FiscalEntities.ts:109`), the mock
  schema (`MockDtoSchemas.ts:49`) and five test fixtures. **There is no cell**: unlike `priceEur`
  (`:306`), `totalEur` (`:313`) and `amount` (`:301`), `TaxTransactionsTable.vue` never renders a fee
  column, and no composable, sum or comparison reads it. So this field adds nothing to the render
  count below — the count stays at four changes over seven columns.

  One trap does apply, off-screen: `MockDtoSchemas.ts:49` declares `feeEur: numericField`, whose
  absent-value mapping produces `0`. Left as `numericField` it would re-fabricate the zero on the
  mock path while the real path returns `null`, so it moves to `nullableMoneyField` with the other
  three magnitudes (`:46-49`).

  **What would make this decision reviewable.** Two triggers, both checkable in one grep. If a
  `SourceFormatProfile` gains a declaration that an empty fee cell means no fee charged — a
  `feeAbsence`-shaped member consulted before `resolveFeeDenomination` returns `ABSENT` — then
  absence becomes separable from unknown for that source, and `Money('0')` becomes correct on that
  path only. If the ledger gains a way to record a denominated-less zero (relaxing the amount/asset
  pair invariant), the second producer row above disappears and NULL narrows to two meanings. The
  measurement to re-run either way is exactly the three producers of `fee.amount === null` in
  `resolveFee` — measured at the emitter, never at the consumer.
- `amount` — **six sites, not one**: `ExternalTaxSchemas.ts:105, 111, 120, 128, 135, 141`, one per
  `switch` branch, each `raw.amount_in ?? 0`, `raw.amount_out ?? 0`, or the two-leg fallbacks at
  `:135`/`:141`. Emitter: `amount_in?`/`amount_out?`, both `PreciseAmount | undefined`
  (`ILedgerPort.ts:32,34`), and absence is genuinely reachable —
  `SQLiteLedgerAdapter.ts:160` maps a NULL column to `undefined` and `:214` writes `null` when the
  leg is absent, so the column is nullable in the STRICT table and the port models it honestly.
  In every branch, `amount` is the magnitude of the **crypto leg the row is about** — the leg whose
  asset becomes `symbol`. **Decision: `amount` becomes `Money | null`**, in the same commit, with
  each branch reading its own defining leg and falling to `null` rather than `0`, and its one render
  site (`TaxTransactionsTable.vue:301`, `formatNumber(tx.amount)`) taking the same `—` gate.

  *Rejected — and this was the closest call in the change:* making the schema **fail** instead, on
  the argument that an operation with no quantity is not an operation. It is the right instinct and
  the wrong mechanism here. A `safeParse` failure does not surface the row: `RestTaxAdapter.ts:117`
  skips it with a `console.warn`, and the one view that would show rejected rows,
  `getInvalidTransactions`, is served by `routes/tax.ts:118` returning a hardcoded `[]`. So failing
  would make a defective row **disappear** from the ledger with no user-visible trace — strictly
  worse than the fabricated zero it replaces, and worse than a `—` that says "this row exists and its
  quantity is unresolved". It is also against this repo's established precedent for exactly this
  situation: a lot with an unresolvable basis is *kept* and marked (`qualityFlag` plus a forced basis
  the UI must consult), and a disposal with no resolved price is *kept* as `ConvertedAmount | null`.
  Refusing the row is the correct long-term answer only once there is a surface that shows refusals,
  which is `getInvalidTransactions`' own change.

  *Rejected:* `Money('0')`, i.e. today's behaviour with an exact type. It states the user moved zero
  of an asset on a row that exists, which is the fabrication D11 removes one field over.
- `amountIn?` / `amountOut?` **keep their `?`, and this is deliberate, not an oversight.** They are
  genuinely per-type optional — a `DEPOSIT` has no out-leg, and the absence is the operation's shape
  rather than a missing measurement. Nothing coalesces them to `0` today (`:155-156` pass
  `raw.amount_in`/`raw.amount_out` straight through) and no reader distinguishes absent from zero, so
  neither D14's rule-5 argument nor D11's fabrication argument applies. Confirmed at the emitter on
  this revision's re-measurement, since the previous one asserted it without checking: `readLeg`
  sets `amount_in`/`asset_in_id` (and the outbound pair) **only** on its `STATED` branch
  (`CsvIngestionUseCase.ts:409-412`), and a quantity that names no asset is not written as an absent
  leg at all — the whole row is rejected with a reason (`:377-386`). So an absent leg is a leg the
  source did not state, which is the operation's shape, and it is never a measurement that went
  missing. They become
  `Money | undefined` (the `?` preserved) and never `Money | null`: adding a `null` arm beside the
  `?` would be the three-state union D14 rejects. This is consistent with the spec delta's use of
  these two as the example of optionality that must survive — the two fields it names are exactly the
  two this design keeps optional.

No further site exists inside the fiscal perimeter. Every `??`-with-`0` over an in-scope field is
accounted for: two in D11 (`totalEur`), five in D15, and the eight above (`priceEur`, `feeEur`, six
`amount` branches). Of the eleven in-scope magnitudes, **exactly one keeps a non-null carrier**
(`amountIn`/`amountOut`, as `Money | undefined`); after this revision **no in-scope field is
retyped to a non-null `Money` whose absence produces `Money('0')`**, and no `Money('0')` is
constructed anywhere in the fiscal DTO layer. A future reader who finds one has found a regression.

### The deliberate render changes, per column — the whole list, and the guard each cell needs

**Count: four decisions, seven columns, three tables — unchanged by this revision.** `feeEur`
became nullable and added no column, because it has no cell (measured above). What the revision did
change is the *row scope* of column 1, which now moves on every spot type rather than a subset. The
table is kept per column because that is what makes the constraint verifiable: any column not listed
here must render byte-identically before and after, and the render non-regression phase asserts
exactly that.

| # | Table | Column / site | Before | After | Guard the cell needs |
|---|---|---|---|---|---|
| 1 | `TaxTransactionsTable.vue` | Total (`:313`) | `€0.00` on `AIRDROP`/`REWARD`/`FEE` and on all four transfer/deposit types; `€0.00` on any unresolved row | resolved valuation, else `—` | **Required.** `formatCurrency(null)` returns `'€0.00'` (`useFormatters.ts:7`), so `{{ formatCurrency(tx.totalEur) }}` would silently re-fabricate the zero. Explicit `tx.totalEur === null ? '—' : formatCurrency(tx.totalEur.toString())`. Load-bearing on **every** row now that no branch forces a zero. |
| 2 | `TaxTransactionsTable.vue` | Price (`:306`) | `€0.00` when `price_fiat` was NULL | value, else `—` | **Required**, same `formatCurrency(null)` trap. |
| 3 | `TaxTransactionsTable.vue` | Quantity (`:301`) | `0` when the defining leg was absent | value, else `—` | **Required**, and it is the *other* formatter: `formatNumber(null)` returns its own `'0'`-shaped fallback, so the guard must precede the call — `tx.amount === null ? '—' : formatNumber(tx.amount.toString())`. |
| — | `TaxTransactionsTable.vue` | *(no fee column exists)* | — | — | `feeEur` renders nowhere; it needs no guard in a component. Its one off-screen trap is `MockDtoSchemas.ts:49`'s `numericField`, which must move to `nullableMoneyField`. |
| 4 | `TaxReportDetailsTable.vue` | Fee (`:286-287`) | `€0.00` on every audit-trail row | `—` on every audit-trail row | **Already present.** The existing `event.saleFeeEur != null ? … : '—'` is loose-equality, so it catches `null` and `undefined` alike (D14 point 3); only the argument gains `.toString()`. |
| 5 | `TaxDerivativesTable.vue` | Amount (`:211-213`) | `---` for absent *and* for a genuine zero | `—` for absent, `0` for a genuine zero | **Required and re-shaped:** the test becomes `tx.amount === null`, never `isZero()`. |
| 6 | `TaxDerivativesTable.vue` | PnL (`:222-238`) | `€0.00`, no icon | `—`, no icon | **Required.** `null` arm first on the icon pair (`:229,:233`) and in `getPnlClass`, before any `isPositive`/`isNegative`. |
| 7 | `TaxDerivativesTable.vue` | Fees/Funding + net impact (`:240-260`) | `€0.00` net impact; breakdown hidden when either is `0` | `—` when either operand is unresolved; breakdown shown for a resolved non-zero | **Required, two guards:** `getNetImpact` returns `null` when either operand is `null` (never summing a `null` as zero), and the `>= 0` class ternary (`:243-247`) takes its null arm **first** — `null >= 0` is `true` in JavaScript. |
| — | `TaxDerivativesTable.vue` | Trade Price (`:215-220`) | `---` on every row | `—` on every row | Not counted: no change in substance, the field has no writer. The gate still becomes an explicit `=== null` so it says why. |

**A note on the wider pattern, so the silence is not read as approval.** The `?? 0` idiom is systemic
in this project's DTO layer — roughly sixty occurrences, the bulk of them in
`CryptoMetricsSchemas.ts`, `ExternalPortfolioSchemas.ts`, `RiskMetricsSchema.ts` and
`MockDtoSchemas.ts`'s portfolio block. Those read portfolio-valuation and metrics figures, not
fiscal magnitudes, and they are **out of scope** here for the same reason `PortfolioEntities` is.
They are not thereby correct; this change fixes the pattern inside the fiscal perimeter only, and the
rest is a known, deliberately deferred debt.

## Risks / Trade-offs

- **A missed call site silently keeps compiling.** → The per-entity migration (D4) is what makes this
  impossible: with no `Money | number` union anywhere, `vue-tsc` reddens every unconverted site at
  once within that entity's commit. Typecheck the frontend with `vue-tsc --build --force`; a bare
  `--noEmit` checks zero files in this repo.
- **A `.toString()` or `.toFixed()` conversion changes rendered characters.** → This is the user's
  hard constraint. `Decimal.toFixed(dp)` matches `Number.toFixed(dp)` for the values in play, and D5
  keeps the two non-grouped sites off `formatNumber`. Component tests that assert rendered text
  (`ExpandedLotsTable.status.spec.ts`, `LotHierarchyTable.spec.ts`, `ConversionStates.spec.ts`) are
  the regression net and must be run per commit, not only at the end.
- **`Money` is truthy, so an existing falsy guard becomes dead.** → `LotEventHistory.vue:175`'s
  `|| 0` is the measured instance and D5 deletes it. Any other `!field` / `field || x` over an
  in-scope field must be re-read against the field's actual optionality when its entity is migrated —
  and a genuinely optional field (`amountIn?`, `amountOut?`) keeps an explicit
  `=== undefined` check, never a truthiness test. Related: `salePrice`/`gainLoss` `null` must never
  collapse to `0` (CLAUDE.md "Nullable is a real state").
- **Two new exports in `shared-types` widen a package every other package depends on.** →
  `compareDecimalStrings` and `preciseAmountFromNumber` are both total functions over the
  `preciseAmountSchema` string contract that package already owns, and both are needed by more than
  one consumer. Neither adds a dependency (`decimal.js` is already declared).
- **`compareTo`/`isZero` on `Money` reach consumers outside `apps/frontend`.** → Additive only; no
  existing signature changes, and `MoneyEntities.ts` gains the same surface it would otherwise
  duplicate.
- **Sorting direction is applied differently after the comparator split (D8).** → A deliberate
  break must be applied to each rewritten comparator and the ascending/descending assertion watched
  go red, per CLAUDE.md working-method rule 3 — a comparator that returns the wrong sign still
  produces a sorted-looking table.
- **The design was wrong twice about what the wire carries, and could be wrong again.** → Once at
  D7's premise (a consumer schema read as a producer, corrected by D0) and once at D15's (an emitter
  measured correctly, then replaced by another change). Every remaining claim about wire content in
  this document cites the *emitter* by file and line (`GetTokenHistoryUseCase`, `ILedgerPort`,
  `SQLiteLedgerAdapter`, `CsvIngestionUseCase`), never the frontend schema. The second failure adds a
  rule the first did not: **before commit 1, re-read `RestTaxAdapter.getFuturesDerivatives` and
  `ILedgerPort.ts:62-80` to confirm `align-derivatives-pnl-contract` actually landed**, exactly as
  steps 3-4 require re-reading `GetTokenHistoryUseCase` for D0.
  Before starting step 3 or 4, re-read `GetTokenHistoryUseCase.ts` to confirm D0 actually landed;
  a step that builds `Money` from a `number` is not a partial win, it is a regression in honesty.
- **`totalEur: Money | null` (D11) changes one table column, on every operation type.** → Deliberate
  and approved, not a regression, and bounded: the "Total" column of `TaxTransactionsTable.vue` only.
  Widened by this revision — the four transfer/deposit branches lost their forced zero, so no row
  type is exempt and a verifier comparing screenshots should expect movement everywhere in that
  column, not in a subset. `totalEur` is display-only (three passthroughs and that one cell), so no
  computed figure moves and no tax base, total or `estimatedIrpf` changes; no taxable disposal is
  created and neither the per-asset tax FIFO nor per-account custody is touched. The mitigation is
  that it lands in step 2 with a test per `switch` branch asserting the passthrough where the emitter
  resolved a figure and `null` where it did not — **no branch asserts `Money('0')` any more** — plus
  one asserting the cell renders `—` and not `€0.00` for `null`, which is the trap, since
  `formatCurrency(null)` returns `€0.00` on its own.
- **D15 proper turns the derivatives table's PnL and net-impact columns into dashes on rows whose
  figures the source never stated.** → New in this revision, and a direct consequence of the emitter
  moving from the `DerivativesPnl` aggregate (all three figures required) to
  `LedgerFuturesTransaction` (all three optional). Three columns of `TaxDerivativesTable.vue` only;
  no computed fiscal figure moves, because nothing in the tax report reads this entity — the AEAT
  bases come from `/report` via `getSpanishTaxReportUseCase`, off the ledger. The traps are
  `formatCurrency(null)` → `€0.00`, `formatNumber(null)` → `'0'`, and `null >= 0` being `true` in the
  net-impact class ternary; each needs an explicit `=== null` gate, and each gate needs its own
  assertion. If the suite or a real import shows *most* rows dashing, that is a genuine
  futures-ingestion finding — `trade_price` has no writer at all — and is worth reporting, not a
  reason to restore the zero.
- **`realizedPnl` becoming nullable makes the entity's primary fiscal figure a three-state value.**
  → Deliberate: `FiscalEntities.ts:52` calls it "the primary taxable figure for AEAT IRPF", and a
  fabricated zero on that field is the worst of the change's fabrications. Every reader must gate on
  `null` before any `Money` method, and the sort comparator needs the explicit null-last rule (D15) —
  a nullable sort key is not covered by D8's comparator split, which assumed non-null operands.
- **Step 1 now depends on a change outside this one.** → `align-derivatives-pnl-contract` must be
  merged before commit 1 starts; the Context banner, D15 and the Migration Plan all say so. Starting
  commit 1 early would retype five fields against an emitter that is being replaced — which is
  precisely how D15's premise failed twice. The cheap pre-flight check is that
  `RestTaxAdapter.getFuturesDerivatives` calls the `futures` client path and that
  `ExternalFuturesSchemas.ts` contains no `price_eur`/`fee_eur` alias; if either is false, stop.
- **D15's audit list turns `amount` into a dash on rows whose defining leg is absent.** → One column
  of `TaxTransactionsTable`, and only for rows the ledger stored without the leg its operation type
  defines — rows that today claim a quantity of zero. `formatNumber(null)` has the same `'0'`-fallback
  trap as `formatCurrency`, so the `—` gate at `:301` is required, not optional. If the suite shows
  *many* such rows, that is a genuine ingestion finding worth reporting, not a reason to restore the
  zero.
- **D14 turns the tax report's whole fee column into dashes.** → Every audit-trail row, because every
  one was showing a hardcoded zero the emitter invented; the column is display-only and no total
  changes. It is a visible admission that the fee is not computed, which is the honest state and the
  point of the decision. Rows on the token-history route already rendered `—`. The risk to watch is
  the opposite one: someone later "fixing" the dashes by restoring a zero instead of computing the
  fee. `GetSpanishTaxReportUseCase.ts:55-60`'s existing comment about a figure "pinned at zero" is
  the argument against that, and after D14 it applies to all three figures in the block rather than
  two of them.
- **D12 deletes wire aliases; a real producer of them would silently start parsing as `undefined`.**
  → Measured on the emitter: nothing in `apps/backend/src` writes `total_eur`, `price_eur` or
  `fee_eur`. The seven fixture uses in `zod-schemas.test.ts` are renamed in the same commit. If the
  suite still reddens somewhere unexpected, that is a producer this measurement missed and D12 must
  be reconsidered before being forced through.
- **D13 deletes eight exports; a dynamic or string-keyed reference would not appear in a grep.** →
  Checked: `grep -rlw` per name across `apps/frontend/src`, plus a review of every
  `from '@/lib/utils'` import in the tree (52 files, all importing only `cn`, `getDeterministicHue`
  or `CSSVars`). `MONETARY_FIELDS` was the plausible candidate for a string-keyed lookup and has no
  reader at all. A `vue-tsc --build --force` plus full suite after the deletion is the confirmation.

## Migration Plan

Seven commits, each green on its own (`pnpm test` and `vue-tsc --build --force` for
`apps/frontend`, `pnpm --filter @kryptofolio/backend test`, plus
`pnpm --filter @kryptofolio/core-domain test` and `pnpm --filter @kryptofolio/shared-types test`).
Node must be the version in `engines` (`>=24.16.0`) for all of them.

0a. **`Money` and the helpers** (packages only). Add `compareTo`, `isNegative`, `isZero`,
   `isPositive`, `toFixed(dp)` to `packages/core-domain/src/value-objects/Money.ts`, extending the
   existing `packages/core-domain/tests/value-objects/Money.spec.ts`. Add
   `packages/shared-types/src/money/compare.ts` with `compareDecimalStrings` and
   `preciseAmountFromNumber`, exported from `packages/shared-types/src/index.ts`. Rewrite all three
   `Number(...)` sign comparisons — `useConvertedAmountDisplay.ts:118`,
   `useTaxCalculations.ts:184`, `TaxReportSummaryCards.vue:53` (D1, D2). Purely additive to
   `FiscalEntities.ts`, so green with no retype.
0b. **Backend phase 0** (D0, D14 point 1). `GetTokenHistoryUseCase`: widen the six wire DTO fields,
   delete the seven `Number(...)` wrappers, move the custody zero filter to `compareDecimalStrings`,
   delete the never-assigned `sale_fee?: number` at `:85`, and update the six numeric assertions in
   `__tests__/GetTokenHistoryUseCase.spec.ts` to exact strings. `GetSpanishTaxReportUseCase`: declare
   `sale_fee: ConvertedAmount | null` (`:63`) and emit `null` (`:190`). Backend-only; the current
   frontend parses both new payloads unchanged (`numericField`/`nullableNumericField` already
   tolerate them). Must precede steps 3 and 4.
1. `TaxDerivativeEntity` + its 9 consumers, **plus D15** (all five fields → `Money | null`, the
   four `TaxDerivativesTable.vue` render gates, `getPnlClass`, `getNetImpact`'s null propagation and
   the null-last sort rule). **Prerequisite outside this change: `align-derivatives-pnl-contract`
   must be merged first** — it is what makes `LedgerFuturesTransaction` this entity's emitter and
   what removes the `price_eur`/`fee_eur` aliases and the five `?? 0` this commit replaces. Verify it
   landed before starting (Risks names the two-line pre-flight check). D0 is *not* a prerequisite
   here: this entity's carriers were already exact strings under either emitter.
2. `TaxTransactionEntity` + its 12 consumers, **plus D11** (`totalEur: Money | null`,
   `nullableNumericField`, the per-branch `switch` decisions) **and D12** (delete the three `*_eur`
   aliases and their `??` chains, rename the seven fixtures in `zod-schemas.test.ts`). D11 and D12
   both rewrite the same `??` expressions at `ExternalTaxSchemas.ts:100,136,150,151`, and both are
   on `TaxTransactionEntity`'s own fields, so splitting them would mean editing those four lines in
   three separate commits.
3. `LotRelocationEntity` + its 8 consumers. Requires 0b.
4. `TaxLotEntity`, `TaxLotHistoryEvent` and `LotCustodyLocation` together + their consumers (13
   non-test files), including `ExternalLotCustodyLocationSchema`'s `qty` construction
   (`ExternalTaxSchemas.ts:284,292`), D7's `ExpandedLotsTable.vue` boundary conversion, D5's
   `toFixed` sites, and **D14 points 2-3** — `saleFeeEur: Money | null` in `ExternalTaxLotHistorySchema`
   (`:219,:254`) and `TaxReportDetailsTable.vue:286-287`, plus the two fixtures at
   `backend-contract.spec.ts:80` and `ExternalTaxSchemas.spec.ts:142`. D14's frontend half belongs
   here because `saleFeeEur` is a `TaxLotHistoryEvent` field and this is that entity's commit.
   Requires 0b.
5. **D13** — delete the eight dead exports from `lib/utils.ts`. Last deliberately: it is the one
   commit that can only be *proved* safe once every fiscal field has been retyped and the full suite
   plus `vue-tsc --build --force` is green, so nothing in steps 1-4 could have reached for them.

TDD per commit, per CLAUDE.md: the failing test first, watched go red for the stated reason, then the
retype. For each entity, the test that must exist before the retype is a precision test the `number`
version cannot pass — e.g. summing many lot `totalCost` values and asserting the exact decimal total,
which is `Scenario: Zero Precision Loss in Aggregation` from the precision spec applied to the
frontend's own entities.

Rollback is per commit and nothing is persisted, so reverting restores the previous behaviour — with
one qualification the earlier revision of this plan got wrong: **the wire format does change**
(`number` → `string` on six token-history fields, D0). It changes compatibly in both directions, since
the frontend's `numericField` accepts either, so 0b can be reverted without reverting a frontend
commit and vice versa. Steps 3 and 4 reverted alone would leave `Money` built from strings, which is
correct; 0b reverted alone would leave them built from `Number()`-truncated values, which is D0's
false precision — so if 0b is reverted, steps 3 and 4 must be reverted with it.

## Open Questions

None. Every decision is resolved. Closed in earlier revisions: the wire-content premise (D0, measured at
the emitter), whether `preciseAmountFromNumber` survives that correction and for what (D7 — yes, one
call site), the null-vs-`0` semantics of every `switch` branch deriving `totalEur` (D11), the fate of
the `*_eur` aliases (D12, deleted), the fate of the dead `lib/utils.ts` cluster (D13, all eight
deleted), `saleFeeEur`'s fabricated zero, its carrier, its two-state shape and its render (D14), and
the five derivative `?? 0` plus the eight further fabrication sites the full sweep found (D15 and its
audit list — including the closest call in the change, whether a missing `amount` should fail the
schema rather than become `null`).

Resolved in this revision (the third): `TaxTransactionEntity.feeEur` is re-decided against its
emitter and inverts to `Money | null` — `resolveFee` is one shared function for spot and futures, and
`fee.amount === null` has three producers of which only one is a zero, none of them declarable by a
`SourceFormatProfile` (D15's audit list); the same re-measurement found that the wire key `fee_fiat`
has no producer at all, so the field is `null` on every row until a denominated fee is exposed, and
repointing it at `fee_amount` is rejected as a unit fabrication. D11's four transfer/deposit branches
are re-decided the same way and also invert to a `total_fiat` passthrough, because
`resolveFiatMagnitudes` runs for every spot row with no `tx_type` branching — which removes the last
`tx_type`-derived structural zero from the presentation layer (CLAUDE.md rule 7). The deliberate
render changes are now enumerated in one per-column table with the guard each cell needs, and the
count stands at four decisions over seven columns of three tables. What would make the `feeEur`
decision reviewable is written into it: a profile-level declaration that an empty fee cell means no
fee, or a ledger that can record an undenominated zero.

Resolved in earlier revisions: the five derivative fields are re-decided against their **new** emitter
(D15 — all five `Money | null`, three of them inverting the previous revision), the derivatives
table's render changes are enumerated per column, and the sequencing dependency on
`align-derivatives-pnl-contract` is stated in the Context banner, in D4's ordering argument, in
Risks and in Migration Plan step 1. `CexFuturesLedgerSchema`'s contract mismatch is no longer
recorded here as a deferral: that change owns and fixes it.

Recorded as **found but deliberately not decided here**, each needing its own change: the ~60 `?? 0`
sites outside the fiscal perimeter (D15's closing note), and two futures-ingestion gaps found while
measuring the new emitter — no writer populates `futures_transactions.trade_price`, and
`SQLiteLedgerAdapter.ts:247-253`'s truthiness gate would conflate an empty-string column with a NULL
(D15). None is an open question for *this* change; all are named so they are not lost.
Closed earlier: `Money | number` (D4), the `Money | null` retype of `salePrice`/`gainLoss` (D1), and
the placement of the comparison surface (D5).
