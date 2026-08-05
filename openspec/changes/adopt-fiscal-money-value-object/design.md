## Context

`openspec/specs/domain-financial-precision/spec.md` already requires every financial amount to be
represented and computed as a precision value object, never a native `number`. `FiscalEntities.ts`
predates that requirement being enforced against the frontend's own domain models and has never been
brought into line with it. `packages/core-domain/src/value-objects/Money.ts` is the value object named
by the spec's own wording (`Money` or `PreciseAmount`) and is already proven in production use in
`apps/frontend` (`views/Settings/components/CurrencySettings.vue`).

Measured before deciding anything below:

- `Money`'s current surface (`packages/core-domain/src/value-objects/Money.ts`, 41 lines) is exactly
  `constructor(string | Decimal)`, `toString()`, `add`, `sub`, `mul`, `div`, `equals`. No comparison
  (`isNegative`, `isZero`, `greaterThan`), no numeric escape hatch.
- `apps/frontend/src/composables/useFormatters.ts`'s `formatCurrency`/`formatPercent`/`formatNumber`
  already accept `number | string | undefined | null` and internally call `parseFloat` on a string
  input. They do not need to change signature to accept `Money.toString()`.
- Grepping the ~8 consumers named in `proposal.md` for `>`, `<`, `>=`, `<=` against a `FiscalEntities`
  numeric field found real usages — e.g. a gain/loss sign check to color a row profit or loss. `Money`
  cannot support this today.

## Decisions

### `Money` gains a minimal comparison surface; the raw `Decimal` is never exposed

`isNegative(): boolean`, `isZero(): boolean`, `isPositive(): boolean`, and `compareTo(other: Money):
-1 | 0 | 1` are added to `Money`. Every comparison a consumer needs — sign checks, sorting, "is this
lot fully closed" — reduces to one of these four. A getter returning the private `Decimal` is
explicitly rejected: it would let a call site fall back to comparing `.valueOf()` as a number, silently
reopening the precision hole this change closes. `compareTo` returning a tri-state rather than a
boolean is deliberate, matching this project's existing rule against boolean-plus-payload shapes
(CLAUDE.md rule 5) — `a.compareTo(b) > 0` reads the same as today's `a > b` at every call site, so the
rewrite is mechanical.

*Rejected:* adding `toNumber()`. Every consumer measured so far needs either a comparison (served by
the four methods above) or a display string (served by `toString()`, already accepted by
`useFormatters.ts`). A `toNumber()` would be an unguarded invitation to compute with the lossy value
instead of the exact one, the same failure mode `PreciseAmount` was branded specifically to prevent on
the backend.

### Formatting stays in `useFormatters.ts`, unchanged, called with `Money.toString()`

`formatCurrency`/`formatPercent`/`formatNumber` already accept a string and `parseFloat` it once, at
the terminal point of rendering. That is a bounded, non-compounding read — unlike arithmetic performed
directly on a `number`-typed entity field, a single `parseFloat` immediately before `Intl.NumberFormat`
renders has nowhere for its rounding to accumulate. No change to that module is needed; every call site
changes from passing `entity.field` (a `number`) to `entity.field.toString()` (a `Money`).

*Rejected:* adding a `Money`-aware overload to `useFormatters.ts`. It would duplicate
`parseFloat(value.toString())` behind a different signature for no behavioural difference.

### Nullable fields become `Money | null`, not `Money` with a sentinel

`salePriceEur` and `gainLossEur` are `number | null` today, a distinction `fix-fifo-transfer-
traceability` deliberately introduced (D26, group 2/10) so an unresolved disposal is never confused
with a `0`-value one. `Money` has no representation for "unknown," so the field type becomes
`Money | null` and every consumer's existing `=== null` branch (already required by
`getEventVariant` in `useTaxCalculations.ts`, per CLAUDE.md's own nullable-is-a-real-state rule)
continues to gate before any `Money` method is called. No new null-handling pattern is introduced;
the existing one is preserved through the retype.

### Migration order: leaf consumers first, `FiscalEntities.ts` last

Retyping `FiscalEntities.ts` first would leave every consumer red simultaneously with no way to land a
reviewable, working commit in between. The `tasks.md` order instead updates the DTO construction site
and one consumer group at a time behind a temporary dual-read (`Money`-or-`number`) union on the
in-progress fields, removing the union only once every consumer of that field is converted. This is
slower than a single big-bang retype but is the only ordering that keeps `pnpm test`/`typecheck` green
at every commit, which this project's working method requires.

## Open Questions

- Whether `Money`'s new comparison methods belong on `Money` itself or on a separate, purely-frontend
  wrapper, since `packages/core-domain` is shared with contexts beyond the tax report. Working
  assumption: on `Money` itself — a monetary comparison is not fiscal-domain-specific, and every future
  consumer of `Money` will eventually want the same four methods. Revisit if a consumer of `Money`
  outside `apps/frontend` objects to the added surface.
