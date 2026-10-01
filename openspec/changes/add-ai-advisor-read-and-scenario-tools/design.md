## Context

The advisor's `taxAnalyst` holds thirteen read-only tools (`ADVISOR_TOOL_NAMES` in
`packages/shared-types/src/advisor-stream.ts`). Each tool is a thin wrapper over an existing use case or
port method, returns `{ kind: 'ok', payload } | { kind: 'truncated', ... }` through `enforceBudget`, and
takes no account id. The core invariant (`docs/ai-advisor.md` §1) is that the LLM never produces a
number. The proposal grows the catalogue to about 27 tools in three groups, implemented in order. After the group-3 gate below, the catalogue has 25.

Facts in the current code that shape this design:

- `IPortfolioAnalyticsPort.getHoldingsSnapshot(accountId?)` filters `l.account_id = $n` exactly. It does
  not roll up children. Under `account-hierarchy`, venue transactions belong to child accounts such as
  `Kraken:spot` and `Kraken:earn`, so asking for the `Kraken` parent id alone returns no holdings.
- `ILedgerPort.getAccounts()` returns `{ id, name, type, parentAccountId, isSynthetic }`.
- `withOverrideView` and `editedFieldsOf` are private functions in `infrastructure/routes/tax.ts`. The
  per-field merge they depend on already lives in the domain (`domain/services/EffectiveSpotTransactionView.ts`).
- `core-domain` `Money` exposes `mul`, `div` (no zero guard), `isZero`, `isNegative`, `isPositive`.
- No stablecoin classification exists anywhere. `fiat-currencies.ts` deliberately treats `USDT` as a
  non-fiat, taxable asset.
- Metered `toolBudgets` is a persisted object keyed by every `AdvisorToolName` (`executionProfilesSchema`).
  `executionProfilesSettings.ts` parses stored JSON strictly, so a row stored before this change would
  fail to parse once new tool names are added.
- Metric descriptions exist only as frontend i18n keys (`*_desc` entries in
  `apps/frontend/src/i18n/dictionaries/{en,es}.ts`).

Stakeholders: the single self-hosting user, who runs local Ollama models (small tool lists are
critical) or metered providers.

## Goals / Non-Goals

**Goals:**

- Answer holding, account, year-over-year, derivatives, custody, data-gap, metric-definition, scenario and
  transaction-search questions with figures produced only by use cases or pure `core-domain` functions.
- Keep every new result a discriminated union with no representable "flag true, payload absent" state.
- Keep the tool list small enough per execution profile for small local models.
- Make the group-3 inclusion decision from real export files, not assumptions.

**Non-Goals:**

- Everything the proposal lists as out of scope: `scenario_sale_pnl`, allocation models, unrealized tax
  exposure, harvesting, IRPF brackets, Modelo 721, cost footer, any write tool.
- Changing FIFO views, custody views, the materializer, or `getHoldingsSnapshot`'s SQL.
- Fixing the cost-basis trust mismatch, which belongs to `unify-holdings-and-kpi-cost-basis-trust`.

## Group-3 gate: real-file measurement

Measured on 2026-10-01 against the real exports in `listadoTransacciones/`. The raw files were read with
scripts. The pipeline output was read from a read-only `.backup` copy of `kryptofolio_ledger.db`, which
is the pipeline's real output for these files: Bit2Me has 706 raw rows and 706 stored rows, and Kraken
spot has 34 raw legs, which become 15 rows after leg merge. The backend was not booted. The declared
conventions come from `packages/core-domain/src/domain/services/sourceProfile/profiles.ts`.

| Source (file, raw rows) | Fees, raw → normalized | Fiat in/out, raw → normalized | Fee verdict | Cash-flow verdict |
|---|---|---|---|---|
| Kraken spot (`kraken_spot.csv`, 34) | 12 non-zero fees, 8 of them in crypto (PUMP, ENA, PLUME, HBAR, SOL, BTC) → 8 of 9 trades carry a fee; one explicit raw `0` became NULL | 7 EUR deposits, 0 withdrawals → 7 DEPOSIT plus 1 WITHDRAWAL (the internal `spottofutures` transfer of -200 EUR, mistyped as a fiat withdrawal) | PARTIAL | PARTIAL |
| Kraken futures (`kraken_futures.csv`, 1100) | 299 trade fees plus 10 liquidation fees, all USD → 269 + 10 stored; about 60 trades and 31 funding rows missing from the copy (unexplained) | none; 314 collateral conversions, 0 `collateral_movements` rows stored | PARTIAL | NO DATA |
| Bitvavo (`bitvavo_spot.csv`, 42) | 12 EUR fees on buys (`FEE_INSIDE_TOTAL`) → 12 of 12; one negative-fee dust buy with NULL `amount_out` | 12 EUR deposits → 12 DEPOSIT; no fiat withdrawals in the file | RELIABLE (EUR) | RELIABLE (deposits only) |
| Bitunix (`bitunix_spot.csv`, 3) | 1 ADA fee → stored; two explicit `0` fees became NULL | none | PARTIAL | NO DATA |
| Bit2Me (`bit2me_spot_{2024,2025,2026}.xlsx`, 706) | 161 non-zero fees, about 95 of them in 12 crypto assets → every row carries a fee asset; the profile notes that EUR on movement rows is a valuation, not the fee paid | 34 EUR deposits and 2 EUR withdrawals → 34 DEPOSIT and 2 WITHDRAWAL on `Bit2Me:bank-transfer` | PARTIAL | RELIABLE |
| Tangem (`tangem_activacion_xrp.csv`, 1) | one zero fee | none | NO DATA | NO DATA |

The gate fails for both tools. **`fees_paid` and `cash_flow_summary` are removed from this change.**

- **`fees_paid`**: only Bitvavo's fees are natively EUR and complete. Every other source charges in
  crypto or USD, so a per-exchange, per-year EUR total needs a dated price per fee asset that the ledger
  row does not carry. That conversion would be new analytical logic, not a wrapper. The explicit-`0`
  versus NULL distinction is also inconsistent across sources (Kraken and Bitunix collapse it, Bit2Me
  and Bitvavo keep it), which is the recurring rule-5 defect shape.
- **`cash_flow_summary`**: Bit2Me (36 of 36) and Bitvavo (12 of 12) are reliable, but a portfolio-wide
  "fiat in / fiat out" figure would include Kraken spot's misclassified internal transfer as a 200 EUR
  withdrawal, and three sources export no fiat movements at all.
- **Partial per-source shipping is rejected.** A total that silently covers two of six sources, or one
  that the model has to qualify per exchange, breaks "every figure comes from a use case and states its
  completeness" more than having no tool does. Both tools come back in a follow-up change once (a)
  Kraken's `spottofutures` subtype is declared as an internal transfer in `profiles.ts` (rule 7, not a
  shared fallback), (b) fee-asset EUR valuation exists as a use case over the price history, and (c)
  explicit-zero fees survive normalization in every profile. The follow-up re-measures with the same
  method.
- Not measured: the extra exports in `~/Downloads` (`account_log_kraken.csv`, `Historial-bitvavo.csv`,
  `kraken_spot_2025-09-16-2026-03-12.csv`). They would not change the verdict, because the blocking
  causes are structural (fee currency, transfer typing), not sample size.

Group 3 therefore ships `tx_search` only. The catalogue grows from 13 to **25** tools.

## Decisions

### D1. Per-profile tool exposure: static, code-declared tool sets

Each tool name is assigned to exactly one **tier** in a code constant in shared-types,
`ADVISOR_TOOL_TIERS: Record<AdvisorToolName, 'core' | 'extended'>`, checked by `satisfies` so a new tool
cannot be added without a tier. Exposure by profile:

| Profile | Tools exposed |
|---|---|
| `metered` and `mixed` | every tool (`core` + `extended`) |
| `local` | `core` only |

`core` (14 tools, used by a small model to answer the common questions): `portfolio_summary`,
`holding_detail`, `account_holdings`, `kpis`, `asset_allocation`, `spanish_tax_report`,
`tax_year_comparison`, `fiscal_integrity`, `data_gaps`, `token_history`, `live_prices`,
`scenario_position_value`, `breakeven_price`, `explain_metric`.

`extended`: `fiscal_integrity_rows`, `token_lots`, `risk_metrics`, `drawdown_curve`,
`performance_history`, `volatility_heatmap`, `derivatives_pnl`, `custody_locations`,
`scenario_portfolio_shock`, `concentration_risk`, `tx_search` (11 tools; 25 in total).

The selection is applied in `advisorComposition.ts` when it builds the `taxAnalyst` tools map for the
resolved profile. `buildTaxAnalystInstructions` lists only the exposed tools, so the prompt never names a
tool the model cannot call. The prefix stays byte-stable per profile.

The selection is static, not user-configurable. A per-tool toggle in Settings would add a persisted
setting, a migration path and a UI for a choice the user cannot judge well. Two fixed tiers are
testable (`toolSurface.spec.ts` asserts the exact set per profile) and can be widened later.

Alternatives considered: (a) expose all ~27 tools to every profile. Rejected because small local models
measurably pick worse with long lists, which is the reason the question was raised. (b) Route by
intent with a classifier before the tool call. Rejected because it costs an extra model call, and
`deterministicDelegation.spec.ts` fixes a normal run at two. (c) A dedicated sub-agent per group.
Rejected for the same call-count reason.

**Persisted budgets.** New tools get metered defaults in `METERED_TOOL_BUDGETS`. The stored
`ai_advisor_execution_profiles` row is read by merging it over `defaultExecutionProfiles()` per key
before validation, so a row stored before this change gains the new tools at their defaults instead of
failing. The `PUT` stays strict: a client must send every key. Local budgets are derived and need no
change.

Metered defaults for the twelve new tools, sized against the existing entries (single-figure results
at 1500 to 2000, ranked or summary lists at 3000 to 4000, row pages and multi-section reports at 5000
to 6000):

| Tool | Metered budget (chars) | Sizing rationale |
|---|---|---|
| `holding_detail` | 3000 | One asset's metrics plus lot summary; like `asset_allocation` |
| `account_holdings` | 5000 | Several per-account sections, each capped by `topNHoldings` |
| `tax_year_comparison` | 4000 | Two years of report totals; smaller than `spanish_tax_report` |
| `data_gaps` | 4000 | A list of gap items; like `fiscal_integrity_rows` |
| `scenario_position_value` | 1500 | One position, one hypothetical price; like `risk_metrics` |
| `breakeven_price` | 1500 | One figure plus its basis; like `risk_metrics` |
| `explain_metric` | 2000 | One static explanation text; like `live_prices` |
| `derivatives_pnl` | 4000 | Per-symbol realized PnL list |
| `custody_locations` | 4000 | Per-account custody split for one asset |
| `scenario_portfolio_shock` | 4000 | Per-asset shocked values; like `portfolio_summary` |
| `concentration_risk` | 2000 | A few concentration ratios and top weights |
| `tx_search` | 5000 | One page of `rowsPageSize` rows (D6) |

Local tier: unchanged mechanism. Every tool exposed to `local` (the `core` set) uses the single derived
`deriveLocalToolBudget(contextWindow)`; `extended` tools are not exposed locally, so they need no local
figure. No per-tool local number is stored or introduced.

### D2. `account_holdings`: name resolution and child roll-up as enumeration

Input: `{ accountName: string }`, `.strict()`, trimmed, 1 to 64 characters. Still no account id.

Account source. No use case lists accounts today: `GET /settings/accounts` (`routes/settings.ts`) and
`SetTransferDestinationUseCase` both call `ledgerPort.getAccounts()` directly. Tool factories must not
receive `ILedgerPort`, so this change adds `ListAccountsUseCase` (`application/use-cases/accounts/`),
constructed with `ILedgerPort`, whose `execute()` returns the non-synthetic accounts
(`{ id, name, parentAccountId }`, synthetic rows filtered by `isSynthetic`). The settings route is
changed to call it as well, so the synthetic filter lives in one place. It is built in `container.ts`
as `listAccountsUseCase`, exposed on `ToolUseCaseSource` as `listAccountsUseCase:
ToolUseCases['listAccounts']`, and mapped in `lateBoundToolUseCases` with
`get listAccounts() { return source.listAccountsUseCase; }`, like every other tool dependency.
`account_holdings` receives `listAccounts` and `portfolioSummary`, nothing else.

Resolution, in a pure function `resolveAccountByName` in `core-domain`, over the accounts returned by
`ListAccountsUseCase` (already non-synthetic):

1. Case-insensitive exact match on `name`.
2. If there is no exact match, a case-insensitive prefix match.
3. Result union:
   - `{ kind: 'resolved', account }`
   - `{ kind: 'ambiguous', candidates: string[] }` (names only, at most 10)
   - `{ kind: 'not_found', available: string[] }` (non-synthetic top-level names, at most 20)

**Roll-up: yes, by enumeration, not by summation.** A resolved account expands to itself plus its
non-synthetic descendants. The tool calls `GetPortfolioSummaryUseCase` once per account id and returns
one section per account (`{ accountName, metrics, ranked, omittedCount, unvalued }`), each with that
account's own totals. It does not add figures across accounts. This answers "what do I have in Kraken"
correctly under `account-hierarchy`, where the parent holds nothing itself. It also needs no arithmetic
in the AI subtree and no change to `getHoldingsSnapshot`, whose SQL the cost-basis trust change is about
to touch. Accounts with no holdings are omitted from the sections and counted in `emptyAccountCount`.
`topNHoldings` applies per section, and the whole result is budget-gated as usual.

Tool output: `ok` with `{ kind: 'resolved', sections, emptyAccountCount }`, or the `ambiguous` and
`not_found` arms. These are successful tool results, not tool errors, so the model can ask the user
which account they meant.

Alternatives considered: (a) a summed venue total. Rejected because it needs either a multi-id port
filter (a signature change that collides with the pending cost-basis change) or Money arithmetic that
merges average prices across accounts. Per-account sections already answer the question. (b) Exact
match only. Rejected because users type "kraken" for "Kraken".

### D3. `holding_detail`

Input `{ symbol }` (SYMBOL_REGEX). Calls `GetPortfolioSummaryUseCase` for all accounts with no top-N cap
and selects by symbol. The result is a union: `{ kind: 'valued', holding }`, `{ kind: 'unvalued', holding }`
(quantity and cost basis, no value), or `{ kind: 'not_held', symbol }`. Symbol matching is exact after
upper-casing.

### D4. `concentration_risk`: stablecoins reported separately, HHI on all valued holdings

A closed list, `STABLECOIN_SYMBOLS`, is added to shared-types (`USDT`, `USDC`, `DAI`, `EURC`, `FDUSD`,
`PYUSD`, `TUSD`, `USDE`). An unlisted symbol is not a stablecoin. That is the conservative direction:
a misclassified risky asset still counts toward concentration. The list is display classification only
and is never read by tax or FIFO code.

Definitions, computed by a pure `core-domain` function through `Money` over valued holdings only
(unvalued holdings are excluded and counted, never weighted as zero):

- weight of holding *i* = value_i / total_valued_value
- `top1Weight`, `top3Weight` = largest and sum of the three largest weights (ranking through the existing
  `rankHoldingsByValue`)
- HHI = sum of weight_i squared, on a 0 to 1 scale (not 0 to 10000), returned as a `PreciseAmount` string
  with `effectiveHoldings` = 1 / HHI

The result carries two blocks: `all` (every valued holding, stablecoins included) and `excludingStablecoins`
(weights renormalised over non-stable holdings), plus `stablecoinWeight` (share of the total in
stablecoins). Each block is a union: `{ kind: 'computed', ... }` or `{ kind: 'empty' }` when its valued
total is zero. That is the division-by-zero case and is typed, not thrown.

Alternatives: counting stablecoins only would make a 90% USDC portfolio look "concentrated" in a way
the user rarely means. Excluding them only would hide that most of the portfolio is cash-like. Reporting
both is the only option that never misleads, and the model picks the block that fits the question.

### D5. Scenario use case: where it lives, Money, and outcomes

Two layers:

- **Pure math** in `packages/core-domain/src/domain/services/portfolioScenarios.ts`:
  `positionValueAt`, `breakevenPrice`, `applyShock`, `concentrationOf`. Inputs and outputs are
  `PreciseAmount` strings. Arithmetic goes through `Money` (`mul`, `div`, `add`, `sub`). Every `div` is
  preceded by an `isZero` check that returns a typed arm. These functions have no I/O.
- **Use case** `GetPortfolioScenarioUseCase` in `apps/backend/src/core/application/use-cases/`. It is a
  functional sandwich: read `GetPortfolioSummaryUseCase` (base currency, live prices, all accounts),
  apply the pure function, return the result. The four scenario tools are thin wrappers over this one
  use case, with one method per scenario. The AI subtree imports no `Money` and no `decimal.js`. It only
  projects and budget-gates.

Inputs from the model are a symbol, a hypothetical unit price, or a percentage. Each one is parsed with
`preciseAmountSchema`, and percentages are bounded to between -100 and 1000. Quantity, cost basis and current
value always come from the ledger read.

Per-scenario outcome unions (the `kind` values are fixed names, and the spec delta pins them):

| Scenario | Outcomes |
|---|---|
| `scenario_position_value` | `computed` (positionValue, deltaVsCurrent, impliedAllocationPct) · `not_held` · `unvalued` (holding has no current value, so delta and allocation cannot be computed; positionValue is still returned) · `empty_portfolio` (allocation denominator zero) |
| `breakeven_price` | `computed` (avgUnitCost) · `not_held` · `unconvertible_cost_basis` (`isConvertible(cost_basis)` false) · `zero_quantity` |
| `scenario_portfolio_shock` | `computed` (per-asset shocked values, totalBefore, totalAfter, delta, `unvaluedSymbols`) · `empty_portfolio`. Input is a union `{ kind: 'uniform', pct }` or `{ kind: 'per_asset', shocks: [{ symbol, pct }] }` (1 to 25 entries). In `per_asset`, unlisted assets are held at 0% and unknown symbols are returned in `notHeld`. |
| `concentration_risk` | as in D4 |

Implied allocation for a hypothetical price uses the new position value against
(total valued equity − current position value + new position value). Base currency comes from
`advisorRequestContext`, exactly like `portfolio_summary`.

Alternatives: putting the math in the tool files (rejected by rule 3 and the proposal), or in backend
`domain/services` (rejected because backend domain code may not import `Money`'s decimal library, while
core-domain encapsulates it).

### D6. `tx_search`: filters, pagination, budget

New use case `SearchSpotTransactionsUseCase` (capability `spot-transaction-search`). It reads
`getSpotTransactions()` and `getSpotTransactionOverrides()`, applies the override view, filters, orders
by `timestamp` descending then `id_hash` (display only, through a `core-domain` ordering helper), and
paginates.

Request: `{ symbol?, from?, to?, types?, page }`. `from` and `to` are ISO dates (inclusive, compared on
the effective post-edit timestamp). `types` is a non-empty subset of the existing spot `tx_type`
enum. `symbol` matches either side of the row. All filters apply to effective values, so an edited
type or date is searched as edited.

Tool: page size is the profile's `rowsPageSize` (25 metered, 100 local). The result uses the
`token_lots` paging shape (`page`, `pageSize`, `totalPages`, `totalCount`). Each row carries only what
an answer needs: date, type, assets and amounts in and out, `price_fiat`, `total_fiat`, fee as its
existing union, exchange or account name, and `edited: boolean` derived from the override arm. The
pre-edit `original` row is omitted. The metered budget is 5000 characters. A page over budget is
`truncated`, and the instructions tell the model to request a narrower filter.

Past-the-end page: a `page` greater than `totalPages` is not an error. It returns `kind: 'ok'` with
`rows: []` and the true `page`, `pageSize`, `totalPages` and `totalCount`, so the model can see the
valid range and correct itself. `page` is validated as an integer `>= 1`; `page: 0` or negative is a
schema error. Zero matches give `totalCount: 0`, `totalPages: 0` and an empty page 1. Alternative
rejected: clamping to the last page, which would return rows the model did not ask for and hide its
paging mistake.

The route `GET /tax/transactions/spot` calls the same use case with no filters and no pagination
(`{ kind: 'all' }` paging arm), so its response shape is unchanged.

### D7. Where `withOverrideView` goes

`withOverrideView`, `editedFieldsOf` and the `SpotTransactionOverrideView` union move to
`apps/backend/src/core/domain/services/EffectiveSpotTransactionView.ts`, next to
`toEffectiveSpotTransaction`. They are pure, have no I/O, and are the read-model half of the same rule.
`SearchSpotTransactionsUseCase` calls them, and `routes/tax.ts` calls the use case. Leaving them in the route
would force the tool to depend on a route file. A separate application-layer helper would split one
domain rule across two layers.

### D8. `explain_metric`: one backend source, the frontend keeps its own copy for now

Definitions live in a backend static table, `infrastructure/ai/metricDefinitions.ts`:
`Record<MetricId, { en: string; es: string }>`. `MetricId` is a closed enum in shared-types (equity,
cost basis, realized and unrealized PnL, max drawdown, annualised volatility, Sharpe, alpha, beta, HHI,
top-N weight, breakeven price, `ratesIncomplete`, `pricesIncomplete`, unvalued, IRPF savings base,
net patrimonial result). Input is `{ metric: MetricId }`. Output is the definition in the request
locale plus the tool that produces the metric. The text is written for the advisor and states formulas
in words, never with example numbers.

The frontend i18n `*_desc` strings stay where they are. Making the frontend read definitions from the
backend would add a request to static UI copy. Moving UI copy into shared-types would put
prose in a schema package. The drift risk is accepted and mitigated by a test that every `MetricId`
has both locales. Making the i18n strings derive from this table is not part of this change.

Alternative: read the frontend dictionaries from the backend. Rejected because it is a layering
inversion (the backend would depend on a frontend file).

### D9. `data_gaps` composition

No new SQL and no new use case. The tool calls `GetPortfolioSummaryUseCase` and `GetFiscalIntegrityUseCase` and
returns:

- `unvalued`: holdings with no current value, split into `no_price` (cost basis convertible) and
  `no_rate` (`isConvertible(cost_basis)` false). These are the same predicates `portfolio_summary` uses.
- `integrity`: the `fiscal_integrity` group summary (`qualityFlag`, `severity`, `count`,
  `pendingReview`), at most 10 groups, plus `totalDefects` and `needsRecalculation`.
- `nextTools`: a fixed list of which tool to call for detail (`fiscal_integrity_rows`, `holding_detail`).

It returns counts and identifiers only. It has no rows and no figures besides quantities.

### D10. `tax_year_comparison`: deltas computed by code

Input `{ yearA, yearB, method? }` (both at least 2009, distinct). The tool calls `GetSpanishTaxReportUseCase`
twice (EUR, all accounts). A pure `core-domain` function `compareTaxSummaries` subtracts each
`TaxReportSummaryDto` field (B − A) through `Money` and returns:

- per year: `summary`, `unconvertibleCount`, `excludedFlaggedEvents`, `excludedUnresolvedIncomeCount`,
  and a `completeness` union of `{ kind: 'complete' }` or `{ kind: 'incomplete', reasons: [...] }`
  (unconvertible events, excluded flagged events, excluded unresolved income)
- `deltas`: per field, `{ kind: 'delta', value }`. If either year is incomplete, every delta also carries
  `comparability: 'incomplete'`. The model has to say so, and is told so in the instructions.

No audit trail is returned. The model never subtracts.

### D11. `derivatives_pnl` and `custody_locations`

`derivatives_pnl` wraps `getDerivativesPnl(undefined, baseCurrency)` behind a small new
`GetDerivativesPnlUseCase`. Tools never call ports directly except for the existing `live_prices`. It is
ranked by absolute realized PnL through `rankHoldingsByValue` semantics and capped at `topNHoldings`.

`custody_locations` wraps `getLotCustodyLocations()` behind `GetLotCustodyLocationsUseCase`. Input is
`{ symbol? }`. Output is the quantity held per non-synthetic account (synthetic `ownwallet-*` rows are
counted, not listed). It reads the custody ledger only. It is a separate tool from `token_history` and
`spanish_tax_report`, and nothing in it orders or partitions by tax FIFO. Its description tells
the model that custody location has no effect on taxation.

### D12. Instructions

`buildTaxAnalystInstructions(profile)` gains a fixed rule: never compute, convert, sum, subtract or
estimate a figure. A hypothetical price or percentage goes to a scenario tool. A comparison across years
goes to `tax_year_comparison`. A typed non-`computed` outcome is stated to the user as it is.
The tool list in the prompt is the profile's exposed set (D1).

### D13. Rule compliance

- **Rule 4.** Money crosses every boundary as a `PreciseAmount` string. `Money` exists only inside
  `core-domain` pure functions. No tool or backend domain file imports `decimal.js` or `Money`. That
  is asserted by extending the existing import-zone test to `infrastructure/ai/**`.
- **Rule 5.** Every new result (D2 to D11) is a `kind` union. No `found: boolean` + optional payload.
- **Rule 6.** `custody_locations` reads custody. `tax_year_comparison` reads tax FIFO through the
  report use case. No tool combines both orderings or introduces a partition.
- **Rule 7.** The fee and cash-flow tools are excluded because they failed the per-source measurement.
  No cross-source fallback is added anywhere.

### D14. Ordering against pending changes

- `performance-history-display-currency` lands first. It only changes `performance_history`, which this
  change does not edit. This change's doc update (§9 currency rules) is written against the
  post-change text.
- `unify-holdings-and-kpi-cost-basis-trust` is a pre-proposal, not a change. This change does **not**
  wait for it. `holding_detail`, `breakeven_price` and the scenarios read cost basis through
  `GetPortfolioSummaryUseCase` and inherit whatever trust rule that change later sets. The `breakeven_price`
  description states that cost basis is the holdings figure, which can differ from `kpis`
  (the D14 caveat already accepted for `portfolio_summary`). If that change introduces a "cost basis
  incomplete" state, `breakeven_price`'s `unconvertible_cost_basis` arm is extended there and not
  pre-empted here.

## Risks / Trade-offs

- [Static tiers may hide a tool a local user needs] → the instructions say a detail tool exists in
  larger profiles, and the tier map is one constant to adjust.
- [Prefix matching resolves the wrong account] → a prefix that matches more than one account returns
  `ambiguous`, never a guess.
- [Stablecoin list goes stale] → unlisted means non-stable, the conservative side. The list is one
  constant and has a test.
- [`explain_metric` text drifts from UI copy] → accepted for now, with a completeness test.
  Unifying them is a separate change.
- [Two report calls in `tax_year_comparison` are slow] → both are read paths over materialised views,
  so they run concurrently.
- [Stored metered profile lacks new keys] → merge-over-defaults on read (D1).

## Migration Plan

No schema migration. The persisted execution-profile row is upgraded on read by merging it over
defaults. The groups ship in order (1, then 2, then 3), each one independently revertible by removing
its names from `ADVISOR_TOOL_NAMES` and the tier map. The route refactor in D7 is behaviour-preserving
and is covered by the existing `GET /tax/transactions/spot` tests.

## Open Questions

None. The proposal's four questions are resolved: account roll-up (D2), stablecoins (D4), per-profile
exposure (D1), and the group-3 gate (gate section).
