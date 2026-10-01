## Conventions (apply to every task group)

- Node 24.16.0 on `PATH` for every command, e.g. `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"`.
- A "failing test" task ends with the test run and confirmation that it is red for the stated reason (not a typo or missing import). The next task makes it green.
- A "deliberate break" task mutates production code on a line the test reaches, confirms the specific assertion goes red, then restores the code.
- Any-grep used in checkpoints: `git diff --name-only | xargs grep -nE ': any|as any|<any>|, any>'` over production files only (tests excluded); it must return nothing.
- Do not commit unless explicitly asked.

## 1. Shared foundations (packages/shared-types, backend domain, accounts, catalogue)

- [ ] 1.1 Baseline: run `pnpm test` and `pnpm typecheck` at the root and record the green state before any change
- [ ] 1.2 Write failing test for `ListAccountsUseCase` (non-synthetic accounts only, returns `{ id, name, parentAccountId }`, synthetic `ownwallet-*` filtered by `isSynthetic`); run it and confirm red because the use case does not exist
- [ ] 1.3 Implement `ListAccountsUseCase` in `apps/backend/src/core/application/use-cases/accounts/` constructed with `ILedgerPort`; test green
- [ ] 1.4 Deliberate break: remove the `isSynthetic` filter, confirm the synthetic-row assertion goes red, restore
- [ ] 1.5 Switch `GET /settings/accounts` in `routes/settings.ts` to call `ListAccountsUseCase` (wire `listAccountsUseCase` in `container.ts`); run the existing settings route tests to prove behaviour is preserved, adding an assertion that synthetic rows stay hidden if absent
- [ ] 1.6 Write failing test for `EffectiveSpotTransactionView` exports (`withOverrideView`, `editedFieldsOf`, `SpotTransactionOverrideView` union) imported from `domain/services/EffectiveSpotTransactionView.ts`, including the explicit `fee: '0'` not collapsing into no fee case; confirm red because the exports are missing
- [ ] 1.7 Move `withOverrideView`, `editedFieldsOf` and `SpotTransactionOverrideView` out of `routes/tax.ts` into `EffectiveSpotTransactionView.ts` (pure, no I/O, no external imports); `routes/tax.ts` imports them; new test and existing `GET /tax/transactions/spot` tests green
- [ ] 1.8 Add a domain-purity assertion that `EffectiveSpotTransactionView.ts` imports nothing external (extend the existing domain import-zone test), and a deliberate break (add a `zod` import) that turns it red, then restore
- [ ] 1.9 Write failing tests in `packages/shared-types` for `ADVISOR_TOOL_TIERS` (exhaustive and disjoint partition of `ADVISOR_TOOL_NAMES`; `core` = 14 names and `extended` = 11 names per design D1 at final state) and for `STABLECOIN_SYMBOLS` (closed list `USDT, USDC, DAI, EURC, FDUSD, PYUSD, TUSD, USDE`) and `MetricId` enum; confirm red
- [ ] 1.10 Add `ADVISOR_TOOL_TIERS: Record<AdvisorToolName, 'core' | 'extended'>` with `satisfies`, `STABLECOIN_SYMBOLS` and `MetricId` to shared-types, with the tier map covering only names that exist at this point (new names are added to the names array and tier map together in their own group); add a type-level test with `@ts-expect-error` that an untiered name does not compile, and confirm `typecheck` is configured so `expectTypeOf`/`@ts-expect-error` is not vacuous
- [ ] 1.11 Write failing test for merge-over-defaults in `executionProfilesSettings`: a pre-change stored row (missing new tool keys) parses and gains defaults; a stored override survives the merge; a `PUT` missing a key is still rejected; confirm red for the stated reason
- [ ] 1.12 Implement merge of the stored row over `defaultExecutionProfiles()` per key before validation (read path only; `PUT` stays strict); add metered defaults to `METERED_TOOL_BUDGETS` as each tool lands (design D1 table), starting with a test hook that fails when a name lacks a budget
- [ ] 1.13 Deliberate break: skip the merge (parse the stored row directly), confirm the pre-change-row test goes red, restore
- [ ] 1.14 Write failing test for tool exposure per profile in `toolSurface.spec.ts` / `advisorComposition`: `local` exposes `core` only, `metered` and `mixed` expose everything, no setting toggles a tool; confirm red
- [ ] 1.15 Implement tier-based tool selection in `di/advisorComposition.ts` when building the `taxAnalyst` tools map for the resolved profile; tests green
- [ ] 1.16 Frontend: extend `ExecutionProfilesEditor`/`advisorSettingsModel` tests so the editor renders and submits a budget for every tool name in `ADVISOR_TOOL_NAMES` (including names added later), confirm red against a hard-coded list if one exists, fix to derive from the shared constant
- [ ] 1.17 Checkpoint: `pnpm --filter @kryptofolio/shared-types test && pnpm --filter @kryptofolio/shared-types typecheck`, `pnpm --filter @kryptofolio/backend test && pnpm --filter @kryptofolio/backend typecheck`, `pnpm --filter @kryptofolio/frontend test && pnpm --filter @kryptofolio/frontend exec vue-tsc --build --force` (Node 24.16.0); run the `: any|as any|<any>|, any>` grep over production changes; all clean

## 2. Group 1 read tools

- [ ] 2.1 Write failing test for `holding_detail` (valued, unvalued, `not_held`, symbol upper-cased, holding outside the top-N found, input `.strict()` with `SYMBOL_REGEX`, no account id); confirm red because the tool does not exist
- [ ] 2.2 Add `holding_detail` to `ADVISOR_TOOL_NAMES` (tier `core`, metered budget 3000) and implement `holdingDetailTool.ts` as a thin projection of `GetPortfolioSummaryUseCase` (uncapped, all accounts) returning the `valued | unvalued | not_held` union through `enforceBudget`; tests green
- [ ] 2.3 Write failing test for pure `resolveAccountByName` in `packages/core-domain` (exact case-insensitive, exact beats prefix, single prefix resolves, multi-prefix `ambiguous` with at most 10 names, `not_found` with at most 20 available top-level names); confirm red
- [ ] 2.4 Implement `resolveAccountByName` (no external imports) returning the `resolved | ambiguous | not_found` union; green
- [ ] 2.5 Write failing test for `account_holdings` (input `{ accountName }` strict, trimmed, 1 to 64 chars, id and out-of-range names rejected; parent rolls up by enumeration with one `GetPortfolioSummaryUseCase` call per account id and no cross-account summation; empty accounts counted in `emptyAccountCount`; `ambiguous` and `not_found` forwarded as successful results; synthetic accounts never resolvable); confirm red
- [ ] 2.6 Add `account_holdings` (tier `core`, budget 5000), expose `listAccounts` on `ToolUseCaseSource`/`ToolUseCases` and `lateBoundToolUseCases` (`get listAccounts()`), and implement the tool receiving only `listAccounts` and `portfolioSummary`; green
- [ ] 2.7 Write failing test for pure `compareTaxSummaries` in `packages/core-domain` (B minus A per field through `Money`, `completeness` union per year, every delta carries `comparability: 'incomplete'` when either year is incomplete, precision beyond float range preserved); confirm red
- [ ] 2.8 Implement `compareTaxSummaries` (arithmetic via `Money` only); green
- [ ] 2.9 Write failing test for `tax_year_comparison` (years at least 2009, distinct, invalid rejected, two concurrent `GetSpanishTaxReportUseCase` calls in EUR for all accounts, no audit trail in the payload, optional `method`); confirm red
- [ ] 2.10 Add `tax_year_comparison` (tier `core`, budget 4000) as a thin wrapper over the report use case plus `compareTaxSummaries`; green
- [ ] 2.11 Write failing test for `GetDerivativesPnlUseCase` and `derivatives_pnl` (wraps `getDerivativesPnl(undefined, baseCurrency)`, ranked by absolute realized PnL, capped at `topNHoldings`, truncation explicit); confirm red
- [ ] 2.12 Implement `GetDerivativesPnlUseCase`, wire it in `container.ts`/`ToolUseCaseSource`, add `derivatives_pnl` (tier `extended`, budget 4000); green
- [ ] 2.13 Write failing test for `GetLotCustodyLocationsUseCase` and `custody_locations` (input `{ symbol? }`, non-synthetic accounts listed, synthetic `ownwallet-*` rows counted not listed, reads custody only, description states no tax effect); confirm red
- [ ] 2.14 Implement `GetLotCustodyLocationsUseCase` over `ITaxCalculatorPort.getLotCustodyLocations`, wire it, add `custody_locations` (tier `extended`, budget 4000); green
- [ ] 2.15 Write failing test for `data_gaps` (unvalued split into `no_price` and `no_rate` using the same predicates as `portfolio_summary`, integrity groups capped at 10 with `totalDefects` and `needsRecalculation`, fixed `nextTools`, no rows); confirm red
- [ ] 2.16 Add `data_gaps` (tier `core`, budget 4000) composing `GetPortfolioSummaryUseCase` and `GetFiscalIntegrityUseCase`; no new SQL; green
- [ ] 2.17 Write failing test for `metricDefinitions` and `explain_metric` (every `MetricId` has non-empty `en` and `es`, requested locale returned, unknown metric rejected, output names the producing tool, no example numbers in text); confirm red
- [ ] 2.18 Implement `infrastructure/ai/metricDefinitions.ts` and `explain_metric` (tier `core`, budget 2000); green
- [ ] 2.19 Write failing test that the Group 1 tools are thin: no `Money`/`decimal.js` import, no numeric coercion or monetary comparison in `infrastructure/ai/**`, and extend the import-zone scan (`advisorSourceScan.ts`) to the whole AI subtree; confirm red against a deliberate violation, then green on real code
- [ ] 2.20 Extend `noModelAccountId.spec.ts` and `toolBudgets.spec.ts` to cover every Group 1 tool (no account id input, per-tool budget enforced, runtime gate replaces an oversized payload)
- [ ] 2.21 Deliberate breaks: (a) make `account_holdings` prefix match beat exact match, (b) drop the incomplete-year `comparability` marker; confirm the targeted assertions go red, restore
- [ ] 2.22 Checkpoint: scoped `pnpm test` and `pnpm typecheck` for `shared-types`, `core-domain`, `backend`, and `frontend` (`vue-tsc --build --force`) with Node 24.16.0; the `: any|as any|<any>|, any>` grep over production changes; all clean

## 3. Group 2 scenarios

- [ ] 3.1 Write failing tests in `packages/core-domain` for `positionValueAt` (computed value, delta versus current, implied allocation against `total - current + new`, `not_held`, `unvalued` still returning position value, `empty_portfolio` on zero denominator, zero hypothetical price computed not rejected); confirm red
- [ ] 3.2 Implement `positionValueAt` in `domain/services/portfolioScenarios.ts` through `Money`, every `div` preceded by `isZero`; green
- [ ] 3.3 Write failing tests for `breakevenPrice` (`computed` avg unit cost, `not_held`, `unconvertible_cost_basis`, `zero_quantity`); confirm red, then implement; green
- [ ] 3.4 Write failing tests for `applyShock` (uniform, per-asset with unlisted held at 0%, unknown symbols in `notHeld`, unvalued excluded and listed in `unvaluedSymbols`, `empty_portfolio`, 1 to 25 entries); confirm red, then implement; green
- [ ] 3.5 Write failing tests for `concentrationOf` (HHI single holding = 1, equal split, top-1 and top-3 weights, `all` and `excludingStablecoins` blocks, `stablecoinWeight`, stablecoin-only portfolio typed `empty` for the excluded block, zero valued total typed not thrown, unvalued counted not weighted, unlisted symbol not a stablecoin); confirm red, then implement using `rankHoldingsByValue` and `STABLECOIN_SYMBOLS`; green
- [ ] 3.6 Add a precision test (values beyond float range) and a purity test (no I/O imports, no raw `decimal.js` outside `Money`) for `portfolioScenarios.ts`
- [ ] 3.7 Deliberate breaks: (a) remove the `isZero` guard in one `div`, (b) drop the stablecoin renormalisation; confirm the specific assertions go red for the intended reason, restore
- [ ] 3.8 Write failing tests for input validation schemas (percentage below -100 and above 1000 rejected, boundaries -100 and 1000 accepted, malformed price rejected through `preciseAmountSchema`, quantity and currency fields rejected as unknown keys, shock entries over 25 rejected); confirm red, then implement the schemas in shared-types
- [ ] 3.9 Write failing test for `GetPortfolioScenarioUseCase` (one uncapped summary read for all accounts, no arithmetic in the use case, base currency from request context, one method per scenario delegating to the pure function); confirm red
- [ ] 3.10 Implement `GetPortfolioScenarioUseCase` as a functional sandwich, wire it in `container.ts`/`ToolUseCaseSource`/`lateBoundToolUseCases`; green
- [ ] 3.11 Write failing tests for the four scenario tools (non-`computed` outcomes forwarded as-is, no quantity or currency input, `.strict()` inputs, budgets 1500/1500/4000/2000); confirm red
- [ ] 3.12 Add `scenario_position_value` (core), `breakeven_price` (core), `scenario_portfolio_shock` (extended), `concentration_risk` (extended) as thin projections; update tier map and metered budgets; green
- [ ] 3.13 Extend the AI-subtree import-zone and no-arithmetic scan to cover the scenario tools; confirm it fails on a deliberate `Money` import and passes on real code
- [ ] 3.14 Checkpoint: scoped `pnpm test` and `pnpm typecheck` for `shared-types`, `core-domain`, `backend`, and `frontend` (`vue-tsc --build --force`, since tool names reach the editor) with Node 24.16.0; the `: any|as any|<any>|, any>` grep; all clean

## 4. Group 3 tx_search

- [ ] 4.1 Write failing tests in `packages/core-domain` for the display-ordering helper (timestamp descending then `id_hash`, stable tiebreak) added next to `displayOrdering.ts`; confirm red, then implement; green
- [ ] 4.2 Write failing tests for `SearchSpotTransactionsUseCase` filters on effective post-edit values (edited type and date searched as edited, inclusive date bounds, symbol matches either side, empty `types` array and unknown type rejected, no filters returns all); confirm red
- [ ] 4.3 Implement `SearchSpotTransactionsUseCase` (reads `getSpotTransactions` and `getSpotTransactionOverrides`, applies `withOverrideView`, filters, orders; writes nothing); filter tests green
- [ ] 4.4 Write failing tests for paging as a discriminated union (`{ kind: 'all' }` vs paged arm, totals describe the filtered set, partial last page, past-the-end page returns empty rows with true totals, `page` below 1 rejected, zero matches give `totalCount: 0` and `totalPages: 0`); confirm red, then implement; green
- [ ] 4.5 Write failing tests for row edit state as a union derived from the override arm (edited flagged, unedited flagged, explicit `fee: '0'` preserved, `original` row omitted from tool rows); confirm red, then implement; green
- [ ] 4.6 Switch `GET /tax/transactions/spot` to the use case with the `all` arm; existing route tests prove the response shape is unchanged
- [ ] 4.7 Write failing tests for the `tx_search` tool (page size from profile `rowsPageSize`, `token_lots` paging shape, over-budget page returns `truncated`, totals present, strict input); confirm red
- [ ] 4.8 Add `tx_search` (tier `extended`, budget 5000), wire the use case and tool; green; assert `fees_paid` and `cash_flow_summary` are absent from `ADVISOR_TOOL_NAMES`
- [ ] 4.9 Deliberate breaks: (a) filter on the original (pre-edit) type, (b) clamp past-the-end pages; confirm the targeted assertions go red, restore
- [ ] 4.10 Checkpoint: scoped `pnpm test` and `pnpm typecheck` for `shared-types`, `core-domain`, `backend`, and `frontend` (`vue-tsc --build --force`) with Node 24.16.0; the `: any|as any|<any>|, any>` grep; all clean

## 5. Instructions, tool surface count, docs

- [ ] 5.1 Write failing tests in `buildTaxAnalystInstructions.spec.ts` (never-compute rule text present, scenario and `tax_year_comparison` routing, typed non-`computed` outcomes stated as they are, `local` never names an extended tool, `metered` names every tool, prefix byte-stable per profile); confirm red
- [ ] 5.2 Update `buildTaxAnalystInstructions(profile)` to list only the exposed tool set and add the fixed arithmetic-forbidden rules (design D12); green
- [ ] 5.3 Update `toolSurface.spec.ts` to assert `ADVISOR_TOOL_NAMES.length === 25` and the exact tool set per profile (`core` 14 for `local`, all 25 for `metered` and `mixed`); confirm it is red before the final count is reached and green now
- [ ] 5.4 Update `docs/ai-advisor.md` (tool catalogue, tiers per execution profile, currency rules, §9 written against the post-`performance-history-display-currency` text, the group-3 gate outcome and follow-up conditions for `fees_paid`/`cash_flow_summary`); load the `technical-documentation` skill first
- [ ] 5.5 Final verification: root `pnpm typecheck && pnpm test`, frontend `vue-tsc --build --force`, the `: any|as any|<any>|, any>` grep (and `, any>` separately) over all production changes, `openspec validate add-ai-advisor-read-and-scenario-tools`; all clean
