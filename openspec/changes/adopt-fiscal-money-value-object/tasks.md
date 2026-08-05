## 1. Extend `Money`

- [ ] 1.1 Write the failing tests first, in `packages/core-domain`'s existing `Money` test file: `isNegative`, `isZero`, `isPositive` for a positive/negative/zero amount; `compareTo` returning `-1`/`0`/`1` for less/equal/greater, including a case where the two amounts differ only past the 2-decimal display boundary (proving the comparison is exact, not display-rounded)
- [ ] 1.2 Implement the four methods on `Money`. No getter for the private `Decimal` is added
- [ ] 1.3 Grep `packages/core-domain` and `apps/frontend` for any new `as any`/`as unknown as Decimal` introduced by this task; confirm zero

## 2. The DTO construction site

- [ ] 2.1 Write the failing test: `ExternalTaxSchemas.ts`'s transform for the fields named in `proposal.md` constructs `Money` from the wire string directly, and a malformed decimal string fails Zod validation before `Money`'s own constructor would throw
- [ ] 2.2 Implement: change the transform to build `Money` instead of `Number(...)`/`parseFloat(...)`
- [ ] 2.3 At this point `FiscalEntities.ts`'s fields are still typed `number`; add a temporary `Money | number` union on exactly the fields DTO construction now produces as `Money`, so the DTO layer's own tests can go green without every consumer breaking at once (per `design.md`'s migration-order decision)

## 3. `useTaxCalculations.ts`

- [ ] 3.1 Write the failing tests: every comparison and formatting call this composable makes against a `Money`-typed field uses `compareTo`/`isNegative`/`toString()` instead of a native operator, on both a normal and a boundary-equal case
- [ ] 3.2 Implement. Remove the field's `Money | number` union once this file's own tests, and every test currently passing a raw `number` fixture into it, are converted to construct `Money` instead

## 4. `TaxReportDetailsTable.vue`, `TaxTransactionsTable.vue`, `TaxDerivativesTable.vue`

- [ ] 4.1 Write the failing component tests: each table renders a `Money`-typed cell via `formatCurrency(field.toString())` and sorts/colors by `compareTo`/`isNegative` rather than the native operator
- [ ] 4.2 Implement, one component at a time so each lands as an independently green commit

## 5. `ExpandedLotsTable.vue`, `LotEventHistory.vue`

- [ ] 5.1 Write the failing tests. These two carry the `getEventVariant`-style nullable branch (CLAUDE.md's own named example) — assert the `null` branch is checked before any `Money` method is called, and that a deliberate break removing the `null` check fails the test for that reason, not a type error masking it
- [ ] 5.2 Implement

## 6. `TokenSalesHistory.vue`, `TokenActiveLots.vue`, `CryptoKpiCards.vue`

- [ ] 6.1 Write the failing tests for the remaining three consumers
- [ ] 6.2 Implement

## 7. Retype `FiscalEntities.ts` and close out

- [ ] 7.1 Remove every temporary `Money | number` union added in task 2.3; every field named in `proposal.md` is `Money` (or `Money | null` for `salePriceEur`/`gainLossEur`) with no fallback type
- [ ] 7.2 Grep the touched files for `: number` on a field named in `proposal.md`; confirm zero, and confirm the genuinely-integer fields (`year`, `count`, `pendingReview`, and the rest named in `proposal.md`'s "leave alone" list) are unchanged
- [ ] 7.3 Grep the touched files for `: any`, `as any`, `<any>`, `, any>`; confirm zero
- [ ] 7.4 Run `pnpm --filter @kryptofolio/core-domain test && pnpm --filter @kryptofolio/core-domain typecheck` and `pnpm --filter @kryptofolio/frontend test && pnpm --filter @kryptofolio/frontend typecheck`; record before/after counts
- [ ] 7.5 Take a deliberate break on each of the four new `Money` comparison methods (invert the sign check, swap `>`/`<` in `compareTo`) and confirm each fails the specific test written for it in 1.1, restoring from a copy rather than `git checkout`
- [ ] 7.6 Add a changeset describing the retype as a non-breaking internal refactor (no wire contract changes)
