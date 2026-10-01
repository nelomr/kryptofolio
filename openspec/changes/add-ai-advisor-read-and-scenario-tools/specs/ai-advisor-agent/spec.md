## ADDED Requirements
### Requirement: Tool Exposure Follows A Static Tier Per Execution Profile
Every `AdvisorToolName` SHALL be assigned to exactly one tier, `core` or `extended`, in `ADVISOR_TOOL_TIERS: Record<AdvisorToolName, 'core' | 'extended'>` in `packages/shared-types`, checked with `satisfies` so a tool cannot be added without a tier. The `core` tier SHALL be exactly fourteen tools: `portfolio_summary`, `holding_detail`, `account_holdings`, `kpis`, `asset_allocation`, `spanish_tax_report`, `tax_year_comparison`, `fiscal_integrity`, `data_gaps`, `token_history`, `live_prices`, `scenario_position_value`, `breakeven_price`, and `explain_metric`. The `extended` tier SHALL be exactly eleven tools: `fiscal_integrity_rows`, `token_lots`, `risk_metrics`, `drawdown_curve`, `performance_history`, `volatility_heatmap`, `derivatives_pnl`, `custody_locations`, `scenario_portfolio_shock`, `concentration_risk`, and `tx_search`. The `metered` and `mixed` profiles SHALL expose every tool; the `local` profile SHALL expose the `core` tier only. The selection SHALL be static code and SHALL NOT be a user setting. `advisorComposition.ts` SHALL apply it when it builds the `taxAnalyst` tools map for the resolved profile.

#### Scenario: Tier partition is exhaustive and disjoint
- **WHEN** `ADVISOR_TOOL_TIERS` is enumerated
- **THEN** it has exactly twenty-five keys equal to `ADVISOR_TOOL_NAMES`, fourteen map to `core`, and eleven map to `extended`

#### Scenario: A local run exposes only the core tier
- **WHEN** the resolved profile is `local`
- **THEN** the `taxAnalyst` tools map contains exactly the fourteen `core` tools and none of the eleven `extended` tools

#### Scenario: Metered and mixed runs expose every tool
- **WHEN** the resolved profile is `metered` or `mixed`
- **THEN** the `taxAnalyst` tools map contains all twenty-five tools

#### Scenario: A new tool without a tier does not compile
- **WHEN** a name is added to `ADVISOR_TOOL_NAMES` without an entry in `ADVISOR_TOOL_TIERS`
- **THEN** typechecking fails

#### Scenario: No setting toggles a tool
- **WHEN** the settings schemas are inspected
- **THEN** no persisted setting enables or disables an individual advisor tool

### Requirement: Stored Execution Profiles Gain New Tool Budgets By Merge
`executionProfilesSettings` SHALL read a stored `ai_advisor_execution_profiles` row by merging it, key by key, over `defaultExecutionProfiles()` before strict validation, so a row stored before a tool name existed gains that tool at its default budget instead of failing to parse. New tools SHALL have metered defaults in `METERED_TOOL_BUDGETS`. Local budgets SHALL remain derived and SHALL NOT be stored. The settings `PUT` SHALL stay strict and SHALL require every key.

#### Scenario: A pre-change row still parses
- **WHEN** a stored row contains only the thirteen original tool budgets
- **THEN** reading it succeeds and the twelve new tools carry their default metered budgets

#### Scenario: A stored override survives the merge
- **WHEN** a stored row sets `portfolio_summary` to a non-default budget
- **THEN** the merged result keeps that stored value

#### Scenario: A PUT missing a key is rejected
- **WHEN** a client submits an execution-profiles body omitting any `AdvisorToolName` key
- **THEN** `executionProfilesSchema` rejects it and the stored value is unchanged

### Requirement: Group 1 Read Tools Return Typed Outcomes
The tools `holding_detail`, `account_holdings`, `tax_year_comparison`, `derivatives_pnl`, `custody_locations`, `data_gaps`, and `explain_metric` SHALL each return a `kind`-discriminated result and never a boolean flag paired with an optional payload. Lookup misses SHALL be successful tool results, not tool errors.

`holding_detail` SHALL take `{ symbol }` validated by `SYMBOL_REGEX`, read `GetPortfolioSummaryUseCase` for all accounts without the top-N cap, match the symbol exactly after upper-casing, and return `{ kind: 'valued', holding }`, `{ kind: 'unvalued', holding }` (quantity and cost basis, no value), or `{ kind: 'not_held', symbol }`.

`account_holdings` SHALL take `{ accountName }` (`.strict()`, trimmed, 1 to 64 characters) and never an account id. It SHALL remove synthetic accounts, then resolve the name through `resolveAccountByName` in `core-domain` by case-insensitive exact match on `name` and, only when there is no exact match, by case-insensitive prefix match, returning `resolved`, `ambiguous` (candidate names, at most 10), or `not_found` (non-synthetic top-level names, at most 20). A resolved account SHALL expand to itself plus its non-synthetic descendants, and the tool SHALL call `GetPortfolioSummaryUseCase` once per account id and return one section per account (`accountName`, `metrics`, `ranked`, `omittedCount`, `unvalued`) with `{ kind: 'resolved', sections, emptyAccountCount }`. It SHALL NOT add figures across accounts. Accounts with no holdings SHALL be omitted from the sections and counted in `emptyAccountCount`. `topNHoldings` SHALL apply per section.

`tax_year_comparison` SHALL take `{ yearA, yearB, method? }` with both years at least 2009 and distinct, call `GetSpanishTaxReportUseCase` for each year (EUR, all accounts), and compute each field delta (B minus A) with `compareTaxSummaries` in `core-domain`. Each year SHALL report its `summary`, `unconvertibleCount`, `excludedFlaggedEvents`, `excludedUnresolvedIncomeCount`, and a `completeness` of `{ kind: 'complete' }` or `{ kind: 'incomplete', reasons }`. Each delta SHALL be `{ kind: 'delta', value }`, and when either year is incomplete every delta SHALL also carry `comparability: 'incomplete'`. No audit trail SHALL be returned.

`derivatives_pnl` SHALL wrap `GetDerivativesPnlUseCase`, which calls `getDerivativesPnl(undefined, baseCurrency)`, rank by absolute realized PnL through `rankHoldingsByValue` semantics, and cap the result at `topNHoldings`.

`custody_locations` SHALL wrap `GetLotCustodyLocationsUseCase`, take `{ symbol? }`, and return the quantity held per non-synthetic account, counting synthetic `ownwallet-*` rows without listing them. It SHALL read the custody ledger only.

`data_gaps` SHALL call `GetPortfolioSummaryUseCase` and `GetFiscalIntegrityUseCase` and return `unvalued` (holdings with no current value, split into `no_price` where the cost basis is convertible and `no_rate` where `isConvertible(cost_basis)` is false), `integrity` (at most 10 groups of `qualityFlag`, `severity`, `count`, `pendingReview`, plus `totalDefects` and `needsRecalculation`), and a fixed `nextTools` list. It SHALL return counts and identifiers only, with no rows and no figure other than quantities.

`explain_metric` SHALL take `{ metric: MetricId }` where `MetricId` is a closed enum in shared-types, and return the definition in the request locale (`en` or `es`) plus the tool that produces the metric, from the static table in `infrastructure/ai/metricDefinitions.ts`. Definitions SHALL state formulas in words and SHALL contain no example numbers. Every `MetricId` SHALL have both locales.

#### Scenario: holding_detail finds a holding outside the top-N
- **WHEN** the portfolio has 40 valued holdings and the requested symbol ranks 30th by value
- **THEN** the result is `{ kind: 'valued', holding }` for that symbol

#### Scenario: holding_detail on an unvalued holding
- **WHEN** the requested symbol is held but has no resolved current value
- **THEN** the result is `{ kind: 'unvalued', holding }` carrying quantity and cost basis and no value

#### Scenario: holding_detail on a symbol not held
- **WHEN** the requested symbol is not held
- **THEN** the result is `{ kind: 'not_held', symbol }`, a successful tool result

#### Scenario: holding_detail upper-cases the symbol
- **WHEN** the model sends `btc` and the ledger holds `BTC`
- **THEN** the result is for `BTC`

#### Scenario: account_holdings resolves an exact name case-insensitively
- **WHEN** the model sends `kraken` and a non-synthetic account named `Kraken` exists
- **THEN** the account resolves by exact match

#### Scenario: Exact match wins over a prefix match
- **WHEN** accounts `Kraken` and `Kraken Futures` exist and the model sends `kraken`
- **THEN** the result resolves to `Kraken` and is not `ambiguous`

#### Scenario: A prefix matching one account resolves
- **WHEN** no account name equals `bit2` and exactly one account name starts with `bit2`, case-insensitively
- **THEN** that account resolves

#### Scenario: A prefix matching several accounts is ambiguous
- **WHEN** no exact match exists and two non-synthetic accounts start with the input
- **THEN** the result is `ambiguous` listing those names (at most 10) and no portfolio data

#### Scenario: Unknown account name
- **WHEN** no account matches by exact or prefix
- **THEN** the result is `not_found` listing the available non-synthetic top-level account names (at most 20)

#### Scenario: Synthetic accounts are never resolvable
- **WHEN** the model sends `ownwallet-BTC`
- **THEN** the result is `not_found` and no summary is read for a synthetic account

#### Scenario: Parent account rolls up by enumeration
- **WHEN** `Kraken` holds nothing itself and has non-synthetic children `Kraken:spot` and `Kraken:earn` with holdings
- **THEN** the result has one section per child account, each with that account's own totals, and no section or figure sums across accounts

#### Scenario: Empty accounts are counted
- **WHEN** a resolved account tree contains three accounts and one has no holdings
- **THEN** two sections are returned and `emptyAccountCount` is 1

#### Scenario: account_holdings rejects an account id
- **WHEN** the model supplies an `accountId` field to `account_holdings`
- **THEN** the strict input schema rejects the call

#### Scenario: account_holdings rejects an out-of-range name
- **WHEN** `accountName` is empty after trimming or longer than 64 characters
- **THEN** input validation rejects it

#### Scenario: tax_year_comparison computes deltas in code
- **WHEN** `yearA` and `yearB` are both complete
- **THEN** each delta is `{ kind: 'delta', value }` equal to the B field minus the A field, produced by `compareTaxSummaries`, with no `comparability` field

#### Scenario: An incomplete year marks every delta incomparable
- **WHEN** either year has unconvertible events, excluded flagged events, or excluded unresolved income
- **THEN** that year's `completeness` is `{ kind: 'incomplete', reasons }` with the matching reasons, and every delta carries `comparability: 'incomplete'`

#### Scenario: tax_year_comparison rejects invalid years
- **WHEN** `yearA` equals `yearB`, or either year is below 2009
- **THEN** input validation rejects the call and `GetSpanishTaxReportUseCase` is not invoked

#### Scenario: tax_year_comparison returns no audit trail
- **WHEN** either year has disposal events
- **THEN** the result contains no `audit_trail` rows

#### Scenario: derivatives_pnl is capped
- **WHEN** derivatives PnL has more rows than `topNHoldings`
- **THEN** the result contains the top `topNHoldings` by absolute realized PnL and a correct `omittedCount`

#### Scenario: custody_locations counts synthetic rows without listing them
- **WHEN** the custody ledger contains `ownwallet-BTC` rows for a symbol
- **THEN** the result lists only non-synthetic accounts and reports the synthetic rows as a count

#### Scenario: custody_locations has no tax effect
- **WHEN** the `custody_locations` description and implementation are inspected
- **THEN** the description states that custody location has no effect on taxation, and the implementation adds no ordering or partition by tax FIFO

#### Scenario: data_gaps splits unvalued holdings by cause
- **WHEN** one holding has a convertible cost basis and no price, and another has an unconvertible cost basis
- **THEN** the first is listed under `no_price` and the second under `no_rate`

#### Scenario: data_gaps bounds integrity groups and returns no rows
- **WHEN** fiscal integrity has more than 10 defect groups
- **THEN** `integrity` contains at most 10 groups, `totalDefects` reflects the full set, and no per-transaction row is present

#### Scenario: explain_metric returns the requested locale
- **WHEN** `metric` is `hhi` and the request locale is `es`
- **THEN** the result carries the Spanish definition and the name of the tool that produces the metric

#### Scenario: explain_metric rejects an unknown metric
- **WHEN** `metric` is not a `MetricId`
- **THEN** input validation rejects the call

#### Scenario: Every metric has both locales
- **WHEN** the metric-definition table is enumerated
- **THEN** every `MetricId` has a non-empty `en` and a non-empty `es` definition

### Requirement: Scenario Tools Are Thin Projections Of The Scenario Use Case
`scenario_position_value`, `breakeven_price`, `scenario_portfolio_shock`, and `concentration_risk` SHALL each call one method of `GetPortfolioScenarioUseCase`, project its result into a `.strict()` `outputSchema`, and apply the budget gate. Their inputs SHALL be a symbol and a hypothetical unit price, a symbol, a `{ kind: 'uniform', pct }` or `{ kind: 'per_asset', shocks }` union, and no input respectively. Each result SHALL preserve the use case's `kind` arm, so a non-`computed` outcome reaches the model as a successful result. The AI subtree SHALL import neither `Money` nor `decimal.js`.

#### Scenario: A non-computed outcome is forwarded as it is
- **WHEN** the use case returns `unconvertible_cost_basis` for `breakeven_price`
- **THEN** the tool result is `{ kind: 'unconvertible_cost_basis', ... }` and is not a tool error

#### Scenario: Scenario tools carry no quantity or currency input
- **WHEN** the `inputSchema` of the four scenario tools is inspected
- **THEN** none declares `quantity`, `currency`, `targetCurrency`, or `accountId`

#### Scenario: Import zone is enforced across the AI subtree
- **WHEN** the import-zone test runs over `infrastructure/ai/**`
- **THEN** it fails on any import of `Money` or `decimal.js`

### Requirement: tx_search Pages Effective Spot Transactions Within A Budget
`tx_search` SHALL wrap `SearchSpotTransactionsUseCase` with the request `{ symbol?, from?, to?, types?, page }`, use the resolved execution profile's `rowsPageSize` (25 metered, 100 local) as the page size, and return the `token_lots` paging shape (`page`, `pageSize`, `totalPages`, `totalCount`). Each row SHALL carry `edited: boolean` and SHALL omit the pre-edit `original` row. Its metered budget SHALL be 5000 characters. A page over budget SHALL be returned as `truncated`, and the instructions SHALL tell the model to request a narrower filter.

#### Scenario: Page size follows the profile
- **WHEN** `tx_search` runs under the metered profile and under the local profile
- **THEN** its `pageSize` is 25 and 100 respectively

#### Scenario: Original row is not returned
- **WHEN** a returned transaction has an override
- **THEN** the row has `edited: true`, carries effective values, and contains no pre-edit `original` field

#### Scenario: A past-the-end page is empty with true totals
- **WHEN** `tx_search` is called with a `page` greater than `totalPages`
- **THEN** it returns `kind: 'ok'` with no rows and the true `page`, `pageSize`, `totalPages`, and `totalCount`

#### Scenario: An over-budget page is truncated
- **WHEN** the serialized page exceeds the `tx_search` character budget
- **THEN** `enforceBudget` returns `{ kind: 'truncated', ... }` and the oversized page is never returned to the model

#### Scenario: Totals are present
- **WHEN** `tx_search` returns a page
- **THEN** `totalPages` and `totalCount` are computed from the full filtered set

### Requirement: Instructions Forbid Arithmetic And Name Only Exposed Tools
`buildTaxAnalystInstructions(profile)` SHALL contain a fixed rule that the model never computes, converts, sums, subtracts, or estimates a figure; that a hypothetical price or percentage goes to a scenario tool; that a comparison across years goes to `tax_year_comparison`; and that a typed non-`computed` outcome is stated to the user as it is. The tool list in the instructions SHALL be exactly the tools the profile exposes, and the instructions SHALL NOT name a tool the model cannot call. The stable prefix SHALL be byte-identical across requests for the same profile.

#### Scenario: Rule text is present
- **WHEN** the instructions are built for any profile
- **THEN** they contain the no-arithmetic rule and direct hypothetical prices and percentages to the scenario tools that profile exposes

#### Scenario: A local profile never names an extended tool
- **WHEN** the instructions are built for the `local` profile
- **THEN** none of the eleven `extended` tool names appears in them

#### Scenario: A metered profile names every tool
- **WHEN** the instructions are built for the `metered` profile
- **THEN** every one of the twenty-five tool names appears in them

#### Scenario: Prefix is stable per profile
- **WHEN** two requests resolve the same profile with different locales
- **THEN** the instruction prefix is byte-identical

## MODIFIED Requirements

### Requirement: Read-Only By Construction
In Phase 0, `taxAnalyst` — the one sub-agent registered on `advisor` (see the supervisor-topology requirement below) — SHALL define exactly twenty-five tools, of which each resolved execution profile exposes the subset its tier allows: `portfolio_summary`, `fiscal_integrity`, `token_history`, `asset_allocation`, `risk_metrics`, `drawdown_curve`, `performance_history`, `kpis`, `volatility_heatmap`, `spanish_tax_report`, `live_prices`, `fiscal_integrity_rows`, `token_lots`, `holding_detail`, `account_holdings`, `tax_year_comparison`, `derivatives_pnl`, `custody_locations`, `data_gaps`, `explain_metric`, `scenario_position_value`, `breakeven_price`, `scenario_portfolio_shock`, `concentration_risk`, and `tx_search`. Across every agent and sub-agent reachable from `advisor`, including the declared-but-inactive `investmentAnalyst`, no tool capable of writing, updating, or deleting any data SHALL be defined. The read-only guarantee MUST hold by the absence of a write tool, never by an instruction in a prompt.

#### Scenario: Tool registry contains no write tool
- **WHEN** every tool reachable from `advisor` (via `taxAnalyst`, and any registered sub-agent) is enumerated
- **THEN** it contains exactly the twenty-five read tools named above, and no tool whose `execute` performs an insert, update, or delete against any store

#### Scenario: A request to change a holding cannot mutate state
- **WHEN** a user asks the advisor to change, delete, or add an asset quantity or value
- **THEN** the run terminates with a terminal event and every asset quantity, cost basis, and fiscal figure in the ledger is byte-identical to its value before the run

### Requirement: No Figure Originates In The AI Layer
Every numeric or monetary figure reaching the model SHALL originate from a use case or read path the tool catalogue wraps, or from a pure `packages/core-domain` function applied to a use case's output: `GetPortfolioSummaryUseCase`, `GetFiscalIntegrityUseCase`, `GetTokenHistoryUseCase`, `GetAssetAllocationUseCase`, `GetRiskMetricsUseCase`, `GetDrawdownCurveUseCase`, `GetPerformanceHistoryUseCase`, `GetKpisUseCase`, `GetVolatilityHeatmapUseCase`, `GetSpanishTaxReportUseCase`, `GetDerivativesPnlUseCase`, `GetLotCustodyLocationsUseCase`, `GetPortfolioScenarioUseCase`, `SearchSpotTransactionsUseCase`, `compareTaxSummaries`, `resolveAccountByName`, or `IPriceHistoryPort.getLatest` (for `live_prices`). The AI subtree SHALL contain no arithmetic on monetary values, no comparison of monetary values, no SQL, no `ORDER BY`, and no `PARTITION BY`. Any monetary comparison SHALL be delegated to `Money` in `packages/core-domain`; any time-series downsampling SHALL be delegated to `downsampleSeries` in `packages/core-domain`, which selects points by index and never by comparing a value.

#### Scenario: Tool wrappers are thin
- **WHEN** a tool's `execute` runs
- **THEN** it validates its input, calls only the injected use cases and pure `core-domain` functions its contract names (one use case for every tool except `account_holdings`, which calls `GetPortfolioSummaryUseCase` once per resolved account, `tax_year_comparison`, which calls `GetSpanishTaxReportUseCase` once per year, and `data_gaps`, which calls `GetPortfolioSummaryUseCase` and `GetFiscalIntegrityUseCase`), projects the response into its `outputSchema` shape, and performs no computation that changes any figure's value

#### Scenario: No numeric coercion of money in the AI subtree
- **WHEN** the AI subtree is searched for `Number(`, `parseFloat`, `toFixed`, `Intl.NumberFormat`, and `decimal.js`
- **THEN** there are zero occurrences

#### Scenario: No monetary comparison in the AI subtree
- **WHEN** the AI subtree's handling of monetary fields is reviewed
- **THEN** no monetary value is compared, sorted, added, or subtracted there; every such operation is delegated to `Money` in `packages/core-domain`, and the AI subtree only reads the result

#### Scenario: Monetary values cross as validated strings
- **WHEN** a monetary figure is placed into a tool result
- **THEN** it is the exact string the use case returned — the source use cases return plain strings, not branded values — validated by `preciseAmountSchema` at the tool boundary, and never passed through `number`

#### Scenario: A string that is not a valid amount fails at the boundary
- **WHEN** a use-case response carries a monetary string that `preciseAmountSchema` rejects
- **THEN** the tool surfaces a tool error rather than forwarding the value or coercing it

#### Scenario: Only integer counts may be number-typed
- **WHEN** a tool `outputSchema` declares a `z.number()` field
- **THEN** that field is an integer count (such as `omittedCount`, `totalDefects`, or a token count) or a non-monetary percentage or ratio (`allocationPct`, `roiPct`, `winRatePercent`, `averageR`, `totalRoiPercent`), and never a monetary amount

### Requirement: No Path From The AI Layer To The FIFO Engine
Tool factories SHALL receive only the constructed use-case instances they wrap, and SHALL be given no access to `ILedgerPort`, `ITaxCalculatorPort`, `IDatabasePort`, or any DuckDB connection. Reading accounts for `account_holdings`, derivatives PnL, lot custody locations, and spot transactions SHALL go through injected use cases, never through those ports. This change SHALL introduce no new ordering, partitioning, or disposal-generating code in the AI subtree, and `custody_locations` and `tax_year_comparison` SHALL remain separate tools that never combine the custody ordering with the tax FIFO ordering.

#### Scenario: Tool factory dependency set is minimal
- **WHEN** each tool factory's constructor parameters are inspected
- **THEN** the only injected dependencies are the use case it wraps and pure configuration, with no ledger port, tax calculator port, or database port present

#### Scenario: Custody and tax orderings are untouched
- **WHEN** the change's diff is inspected
- **THEN** it modifies no DuckDB view, no FIFO materializer, and no custody ledger allocation, and adds no `PARTITION BY` or `ORDER BY` clause anywhere

#### Scenario: New read use cases keep the ports out of the tools
- **WHEN** the factories for `account_holdings`, `derivatives_pnl`, `custody_locations`, and `tx_search` are inspected
- **THEN** each receives only use-case instances and pure configuration, with no `ILedgerPort`, `ITaxCalculatorPort`, or `IDatabasePort`

### Requirement: Tool Results Are Budgeted And Truncation Is Explicit
Each tool SHALL declare both a Zod `inputSchema` and a `.strict()` `outputSchema` that is fixed-arity and top-N truncated, and each tool result SHALL additionally pass a hard runtime character gate before being returned to the model.

#### Scenario: Portfolio summary is top-N bounded
- **WHEN** the portfolio summary tool runs against a portfolio of 40 holdings that all have a resolved value
- **THEN** the result contains the top 15 by value plus an `omittedCount` of 25 and an `unvaluedCount` of 0

#### Scenario: Unvalued holdings are counted separately, not omitted silently
- **WHEN** the portfolio summary tool runs against 40 holdings of which 6 have no resolved value
- **THEN** the result contains the top 15 of the 34 valued holdings, an `omittedCount` of 19, and an `unvaluedCount` of 6

#### Scenario: Integrity tool returns no per-transaction rows
- **WHEN** the fiscal integrity tool runs against a report exercising every FIFO quality flag
- **THEN** the result contains per-flag counts and at most the top N defect groups, and contains no per-transaction row

#### Scenario: Runtime gate replaces an oversized payload
- **WHEN** `JSON.stringify(payload).length` exceeds the tool's character budget
- **THEN** `enforceBudget` returns a `{ kind: 'truncated', … }` result naming what was dropped, and the oversized payload is never returned to the model

#### Scenario: Budget is measured in characters
- **WHEN** `enforceBudget` evaluates a payload
- **THEN** it compares character length against a per-tool constant and invokes no tokenizer, giving a deterministic result independent of provider

#### Scenario: Per-tool budgets are enforced
- **WHEN** each tool's configured budget is read for the `metered` execution profile
- **THEN** the portfolio summary budget is 4000 characters, fiscal integrity 6000, token history 6000, asset allocation 3000, risk metrics 1500, drawdown curve 4000, performance history 4000, kpis 3000, volatility heatmap 4000, spanish tax report 5000, live prices 2000, fiscal integrity rows 4000, and token lots 4000, and `tx_search` 5000, with every other tool in the twenty-five-tool catalogue having a metered default in `METERED_TOOL_BUDGETS`

#### Scenario: Local budgets are derived from the resolved model's context window, not stored
- **WHEN** the resolved model chain is all-local and its entry declares a `contextWindow`
- **THEN** each tool's local budget is `floor(contextWindow * 4 * 0.15)`, the run-wide cap across all tool results in that run is `floor(contextWindow * 4 * 0.6)`, and no local per-tool budget is read from a stored setting

#### Scenario: Widening a DTO fails validation
- **WHEN** a field not declared in a tool's `outputSchema` is added to its payload
- **THEN** the `.strict()` schema rejects it rather than emitting a silently larger payload

### Requirement: The Model Is Untrusted Input
Each tool's `inputSchema` SHALL act as an anti-corruption layer between the model and the use cases. A model-supplied value SHALL be validated and, where applicable, parsed to its branded type before reaching any use case.

#### Scenario: Malformed symbol is rejected before the use case
- **WHEN** the model calls the token history tool with a symbol that fails the schema's regex
- **THEN** the tool emits a tool error and `GetTokenHistoryUseCase` is never invoked

#### Scenario: No tool accepts an account id
- **WHEN** the `inputSchema` of any of the twenty-five tools is inspected, or the model supplies an `accountId` to any of them
- **THEN** none declares an `accountId` field and the `.strict()` schema rejects the call; every tool except `account_holdings` calls its wrapped use case without an account filter so it covers every account, and `account_holdings` accepts only an account name that it resolves server-side; the instructions forbid asking the user for an account id or any other internal identifier

### Requirement: Supervisor Agent With Phased Sub-Agents
The advisor SHALL be a single supervisor `Agent` (`advisor`) declared with an `agents` map of sub-agents exposed as tools, never a deprecated agent network. In Phase 0, `agents` SHALL contain only `taxAnalyst`, which holds the read-only tools its resolved execution profile exposes (the tiered twenty-five-tool catalogue; design D14/D16); `investmentAnalyst` SHALL be declared with its own instructions and contract but SHALL NOT be present in `advisor`'s `agents` map and SHALL hold no tools. Only `advisor` SHALL be constructed with `Memory`; a sub-agent SHALL never be invoked directly by `AskAdvisorUC` or a route.

#### Scenario: Phase 0 topology
- **WHEN** the composition root is inspected
- **THEN** `advisor` is constructed with `agents: { taxAnalyst }`, `investmentAnalyst` exists as a separate declared agent absent from that map, and only `advisor` holds a `Memory` instance

#### Scenario: No agent network
- **WHEN** the advisor's construction is inspected
- **THEN** no `.network()` call exists anywhere in the AI subtree

#### Scenario: Deterministic delegation with one active sub-agent
- **WHEN** a request is answerable only through `taxAnalyst`'s tools and `investmentAnalyst` is not yet registered
- **THEN** the supervisor delegates to `taxAnalyst` without an additional model call dedicated to choosing among sub-agents

#### Scenario: Step budget is explicit, from the resolved profile
- **WHEN** any `advisor.stream(...)` or `advisor.generate(...)` call is inspected
- **THEN** it passes `maxSteps` explicitly, resolved from the run's execution profile (its `maxSteps`, never left to the library default), rather than a bare literal

### Requirement: Tool Inputs Exclude Server-Resolved And Injected Values
The `portfolio_summary` tool's `inputSchema` SHALL accept no input at all, and in particular no `accountId`: the account scope is always every account, because a model cannot know an account id and taxation is per asset, never per account. `targetCurrency` SHALL be resolved server-side from the base-currency setting via request context, and `livePrices` SHALL be injected by the tool factory. Neither SHALL be a model-suppliable tool input. The same rule applies to every other tool that reads currency or price data (`asset_allocation`, `risk_metrics`, `drawdown_curve`, `performance_history`, `kpis`, `volatility_heatmap`, `spanish_tax_report`, `live_prices`, `holding_detail`, `account_holdings`, `tax_year_comparison`, `derivatives_pnl`, `custody_locations`, `data_gaps`, `scenario_position_value`, `breakeven_price`, `scenario_portfolio_shock`, `concentration_risk`, `tx_search`): a currency is never a tool input. `holding_detail`, `account_holdings`, `data_gaps`, and the four scenario tools read the base currency from request context through `GetPortfolioSummaryUseCase`; `derivatives_pnl` passes the base currency from request context to its use case; `tax_year_comparison` is EUR, as `spanish_tax_report` is. `asset_allocation` and `kpis` read the base currency from request context and pass it to their use case, whose adapter converts to it per valuation date; a holding the rate ledger cannot convert is reported as unvalued, never relabelled. `risk_metrics` returns only ratios and percentages and carries no currency. `spanish_tax_report` resolves its own default, because IRPF figures are EUR. `performance_history` reads the base currency from request context and passes it to its use case, whose adapter converts each point to it at that point's own date; a point the rate ledger cannot convert carries a `null` `portfolioValue`, never an EUR value or `0`, and the result SHALL declare the request's base currency in its `currency` field. `drawdown_curve` and `volatility_heatmap` return percentages and a volatility statistic, which carry no currency.

#### Scenario: Extra fields are rejected
- **WHEN** the model calls `portfolio_summary` with a `targetCurrency` or `livePrices` field in its input
- **THEN** the `.strict()` `inputSchema` rejects the call, and the values actually used come from request context and server-side injection regardless

#### Scenario: Converting tools receive the request's base currency
- **WHEN** `asset_allocation` or `kpis` executes for a request whose base currency is not EUR
- **THEN** its use case is called with that base currency, taken from request context and never from tool input

#### Scenario: Performance history is requested in the base currency
- **WHEN** `performance_history` executes for a request whose base currency is not EUR
- **THEN** its use case is called with that base currency, taken from request context and never from tool input
- **AND** the result's `currency` field states that base currency

#### Scenario: An unconvertible point is reported as unvalued
- **WHEN** `performance_history` returns a series containing a point no stored rate covers
- **THEN** that point's `portfolioValue` is `null` in the result
- **AND** it is neither the EUR value nor `0`, and the `currency` field is not relabelled to EUR

#### Scenario: No tool accepts a currency parameter
- **WHEN** the `inputSchema` of any tool that resolves a monetary or price figure is inspected
- **THEN** none declares a `targetCurrency`, `currency`, or `livePrices` field

### Requirement: Execution Profile Governs Limits, Derived Never Toggled
Each resolved model-chain entry SHALL be classified as `local` (provider `ollama` with a model id ending neither `:cloud` nor `-cloud`) or `metered` (every other case). Classification SHALL be a pure function of the entry, never a field the user sets directly. Per-profile limits (`maxSteps`, `lastMessages`, `topNHoldings`, `lotsPageSize`, `rowsPageSize`, and per-tool character budgets) SHALL be user-editable in Settings up to hard ceilings the schema enforces (`maxSteps` ≤ 30, `lastMessages` ≤ 200), which guard against a runaway loop, not against cost. When the resolved chain mixes local and metered entries, or is entirely metered, the run SHALL use the metered profile's limits; only an entirely local chain SHALL use the local profile. The resolved profile SHALL also select which tools are exposed, per the tool-tier requirement.

#### Scenario: A cloud model id is never classified as local
- **WHEN** a chain entry has `providerId: 'ollama'` and a `modelId` ending `:cloud` or `-cloud`
- **THEN** it is classified `metered`, even though no vault credential exists for it

#### Scenario: A mixed chain runs under metered limits
- **WHEN** the resolved chain contains at least one local entry and at least one metered entry
- **THEN** the run's `maxSteps`, `lastMessages`, and per-tool budgets are the metered profile's values, and the audit row records `execution_profile = 'mixed'`

#### Scenario: An all-local chain runs under local limits
- **WHEN** every entry in the resolved chain is classified `local`
- **THEN** the run's limits are the local profile's values and the audit row records `execution_profile = 'local'`

#### Scenario: Ceilings cannot be exceeded by a settings write
- **WHEN** a client submits `maxSteps: 31` or `lastMessages: 201` for either profile
- **THEN** `executionProfilesSchema` rejects the write and the stored value is unchanged

#### Scenario: A local entry requires a declared context window
- **WHEN** a model-chain entry has `providerId: 'ollama'` and a `modelId` ending neither `:cloud` nor `-cloud`
- **THEN** `modelChainEntrySchema` requires a positive integer `contextWindow`, and an entry with `providerId` anything else, or an `ollama` entry ending `:cloud` or `-cloud`, is rejected if it carries one

#### Scenario: contextWindow reaches Ollama as num_ctx
- **WHEN** a local chain entry is resolved for a run
- **THEN** its `contextWindow` is passed as `providerOptions: { ollama: { options: { num_ctx: contextWindow } } }`

### Requirement: Paginated Drill-Downs Replace Silent Dropping
`fiscal_integrity_rows`, `token_lots`, and `tx_search` SHALL page through, respectively, `GetFiscalIntegrityUseCase`'s full `rows`, `GetTokenHistoryUseCase`'s full lot list, and `SearchSpotTransactionsUseCase`'s filtered set, using the resolved execution profile's page size (`rowsPageSize` / `lotsPageSize` / `rowsPageSize`). Each result SHALL carry `page`, `pageSize`, `totalPages`, and `totalCount`.

#### Scenario: Page size follows the execution profile
- **WHEN** `fiscal_integrity_rows`, `token_lots`, or `tx_search` runs under the metered profile versus the local profile
- **THEN** its `pageSize` is the metered default (25 / 20 / 25) or the local default (100), per whichever profile the run resolved

#### Scenario: Totals are always present
- **WHEN** any paginated tool returns a page
- **THEN** the result includes `totalPages` and `totalCount` computed from the full underlying set, not only the returned page
