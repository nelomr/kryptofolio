# ai-advisor-agent Specification

## Purpose
TBD - created by archiving change add-ai-portfolio-advisor. Update Purpose after archive.
## Requirements
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

### Requirement: Ranking By Value Is Delegated To A Pure Domain Service
The portfolio snapshot arrives unordered and a holding's value may be absent or unconvertible, so the top-N selection SHALL be performed by `rankHoldingsByValue` in `packages/core-domain`, which compares through the `Money` value object. The AI subtree SHALL perform no sort and no comparison of its own. `Money` SHALL gain a `compare(other: Money): -1 | 0 | 1` method for this purpose.

#### Scenario: The tool does not rank
- **WHEN** the portfolio summary tool's implementation is inspected
- **THEN** it calls `rankHoldingsByValue` and contains no `.sort(`, no comparison operator applied to a monetary value, and no `decimal.js` import

#### Scenario: Ranking is by descending value
- **WHEN** `rankHoldingsByValue` is given holdings whose values differ only in decimal places beyond float precision
- **THEN** the returned order is correct by exact decimal comparison, because `Money.compareTo` is used rather than float arithmetic

#### Scenario: Unvalued holdings are a third list, never sorted as zero
- **WHEN** a holding has no resolved `current_value_fiat`, or its `cost_basis` is `UNCONVERTIBLE`
- **THEN** it is returned in the service's `unvalued` list, is absent from `ranked`, is not counted in `omittedCount`, and is never compared as if its value were `'0'`

#### Scenario: The value accessor forces the absent case to be handled
- **WHEN** `rankHoldingsByValue`'s signature is inspected
- **THEN** its value accessor returns `string | undefined`, so a caller cannot pass a value type that hides the absent case

### Requirement: Incompleteness Signals Reach The Model With The Figures
A tool result carrying portfolio figures SHALL also carry the incompleteness signals — `ratesIncomplete`, `pricesIncomplete` (for `portfolio_summary`, derived from the holdings the tool emits and, for `ratesIncomplete`, the use case's own flag), and the count of unvalued holdings — and the agent's instructions SHALL require an incomplete total to be reported as incomplete.

#### Scenario: Flags are passed through, not dropped
- **WHEN** a convertible holding in the `GetPortfolioSummaryUseCase` response has no resolved value
- **THEN** the tool result carries `pricesIncomplete: true` and the count of unvalued holdings, rather than presenting the total as complete

#### Scenario: An absent figure is never defaulted
- **WHEN** a monetary field is absent or unconvertible in the use-case response
- **THEN** the tool result represents it as unvalued and never substitutes `'0'`, `null`, or an empty string that reads as a value

#### Scenario: Instructions require the caveat
- **WHEN** the instruction string is inspected
- **THEN** it directs the agent to state that a total is partial whenever a tool result reports an incompleteness signal

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

### Requirement: Hexagonal Isolation Of The LLM SDK
`IAdvisorPort` SHALL be declared in the backend domain and SHALL import nothing external — no `@mastra/*`, no Zod, no `decimal.js`, no web-stream or HTTP type. `@mastra/*` SHALL be importable only from `core/infrastructure/ai/**` and `MastraAdvisorAdapter.ts` — the Mastra zone — and from no domain, application, or route file.

#### Scenario: Port signature is dependency-free
- **WHEN** `core/domain/ports/IAdvisorPort.ts` is inspected
- **THEN** it declares `ask(request: AdvisorRequest): AsyncIterable<AdvisorEvent>` and its only imports are `import type` from sibling domain modules

#### Scenario: Mastra imports stay inside the zone
- **WHEN** the repository is searched for imports of `@mastra/`
- **THEN** every hit resolves to `core/infrastructure/ai/**` or `MastraAdvisorAdapter.ts`

#### Scenario: The audit write goes through its own port
- **WHEN** `AskAdvisorUC` is inspected
- **THEN** it persists the run receipt through `IAdvisorRunLogPort` and contains no SQL, no `IDatabasePort`, and no direct SQLite access

#### Scenario: The run-log port is domain-pure
- **WHEN** `core/domain/ports/IAdvisorRunLogPort.ts` is inspected
- **THEN** its only imports are `import type` from sibling domain modules, and its methods return `Promise<…>`

### Requirement: Domain Advisor Events Carry The Run Receipt
`AdvisorEvent` SHALL be a `kind`-discriminated union whose terminal members are `completed`, `refused`, and `failed`, each carrying an `AdvisorRunReceipt` (provider used, model used, ordered tool names, token counts, resolved execution profile, steps used, and max steps). Every member, terminal or not, SHALL carry the `runId` assigned when the run started, and `completed` SHALL additionally carry `disclaimer` and `figuresIncomplete` booleans. There SHALL be no second channel for run metadata.

#### Scenario: Terminal event includes the receipt
- **WHEN** a run reaches any terminal event
- **THEN** that event carries an `AdvisorRunReceipt` and the consumer needs no additional call to learn which model and tools were used

#### Scenario: No flag-plus-optional-payload shape
- **WHEN** `AdvisorEvent`, `AdvisorRunReceipt`, and the truncation result type are inspected
- **THEN** each is a `kind`-discriminated union and none is a boolean flag paired with an optional payload

### Requirement: The Receipt Is Accumulated During The Run
The adapter SHALL maintain an `AdvisorRunReceiptDraft` filled as facts become known — `runId` at the start, provider and model when a chain entry is chosen, each tool name as its call completes, token counts at finish — and a terminal event SHALL carry a frozen receipt built from that draft. A cancelled run produces no terminal event, so the draft SHALL be what makes an `aborted` audit row possible.

#### Scenario: Draft is populated before any terminal event exists
- **WHEN** a run has called one tool and streamed tokens but has not finished
- **THEN** the draft already names the provider, the model, and that tool

#### Scenario: Cancelled run still has a receipt to persist
- **WHEN** the consumer stops iterating mid-run
- **THEN** an `ai_advisor_runs` row is persisted with `outcome = 'aborted'` under the run's real `runId`, and no terminal event is emitted

#### Scenario: Persistence is idempotent per run
- **WHEN** both the terminal-event path and the cancellation path could fire for the same `runId`
- **THEN** exactly one `ai_advisor_runs` row exists for that run, because the write is keyed on `runId`

### Requirement: Cancellation Through Ceasing Iteration
Cancellation SHALL be expressed by the consumer ceasing to iterate the returned `AsyncIterable`; `AdvisorRequest` and `IAdvisorPort.ask` SHALL NOT accept an `AbortSignal`. The adapter's generator `finally` block SHALL tear down the underlying model call.

#### Scenario: Breaking out of iteration aborts the model call
- **WHEN** a consumer `break`s out of `for await` over `ask(...)`, or calls `.return()` on the iterator
- **THEN** the adapter's `finally` block runs and the underlying model call is aborted

#### Scenario: No AbortSignal in the port
- **WHEN** `IAdvisorPort` and `AdvisorRequest` are inspected
- **THEN** neither mentions `AbortSignal`

### Requirement: Use Case Orchestrates As A Functional Sandwich
`AskAdvisorUC.execute()` SHALL resolve request context impurely (locale and base currency via `IUserSettingsPort`, model chain per the model-routing capability), then yield events through `IAdvisorPort`, then persist the run receipt impurely through `IAdvisorRunLogPort` — on the terminal event, or from a `finally` around the delegation when the consumer stopped iterating. Persistence SHALL NOT depend on a terminal event being observed.

#### Scenario: Context is resolved before the model is called
- **WHEN** `execute()` runs with `language` and `base_currency` set in user settings
- **THEN** both values are read via `IUserSettingsPort` and reach the adapter's request context before any model call is made

#### Scenario: Receipt is persisted on the terminal event
- **WHEN** a run yields `completed`, `refused`, or `failed`
- **THEN** exactly one `ai_advisor_runs` row is written for that run with the matching `outcome`

#### Scenario: Persistence survives a consumer that never reaches the terminal event
- **WHEN** the consumer abandons iteration before any terminal event
- **THEN** the use case's `finally` still writes exactly one row, with `outcome = 'aborted'`

### Requirement: Dynamic Instructions From Request Context
The advisor's user-facing agent (`advisor`) SHALL have `instructions` as a function of request context (locale and base currency), not N duplicated prompts per provider; each declared sub-agent (`taxAnalyst`, and later `investmentAnalyst`) has its own role-scoped instructions per D14, but neither duplicates per model provider. No verbosity input SHALL be introduced in this phase, because no setting or control exists to supply one. The system prefix SHALL be stable across requests so prompt caching applies; volatile portfolio data SHALL appear only inside tool results.

#### Scenario: Locale changes only the volatile suffix
- **WHEN** two runs are made with `language` set to different values
- **THEN** the produced instruction strings share an identical stable prefix and differ only in the context-derived section

#### Scenario: The model reports each tool's declared currency, never the base currency by assumption
- **WHEN** the instruction string is inspected
- **THEN** it tells the model to state the currency each tool result declares, never to convert or relabel a figure, and its stable prefix makes no promise that every figure is in the base currency; the base currency appears only in the volatile suffix, as information

#### Scenario: No portfolio data in the prompt
- **WHEN** the instruction string produced for any request context is inspected
- **THEN** it contains no asset symbol, quantity, balance, or fiscal figure

#### Scenario: Figures are echoed verbatim and marked
- **WHEN** the instructions for any request context are inspected
- **THEN** they direct the model to repeat each figure exactly as the tool returned it, wrapped in inline code, without rounding, reformatting, or computing a new one

### Requirement: No Telemetry Leaves The Machine
Mastra tracing SHALL be unconfigured — no `Mastra` instance is constructed and no observability exporter package is installed or registered.

#### Scenario: No exporter
- **WHEN** the composition root is inspected
- **THEN** no Mastra observability exporter is registered and no outbound request other than to the resolved model provider is made during a run

### Requirement: Investment Claims Are Grounded, Disclosed, Not Refused
The advisor MAY produce price forecasts, asset allocations, and market-timing commentary; these SHALL NOT be refused outright. Every such claim SHALL be grounded in a tool result produced in the current run, enforced by a deterministic output processor (Spanish and English), and every answer whose content touches an investment category SHALL carry a structural "not financial advice" disclaimer appended by a separate output processor, never a sentence the model must remember to write. Tax-evasion strategy requests SHALL always be refused, unconditionally, with no grounding check applicable.

#### Scenario: An ungrounded investment claim is retried once, then refused
- **WHEN** the model states a forecast, allocation, or timing claim with no corresponding tool call in the current run
- **THEN** the grounding detector calls `abort(reason, { retry: true })` once, and if the regenerated output is still ungrounded the run terminates `refused`, carrying the tripping `processorId` and a reason, with the withheld answer not delivered

#### Scenario: A grounded investment claim is answered, not refused
- **WHEN** the model states a forecast, allocation, or timing claim that cites a tool result produced in the current run
- **THEN** the run terminates `completed`, the disclaimer processor attaches the "not financial advice" disclaimer to the run's terminal chunk (surfaced as `disclaimer: true` on the `completed` event, never inserted into the answer text), and no `refused` event is emitted

#### Scenario: The disclaimer cannot be argued away
- **WHEN** a user instructs the advisor to ignore its disclaimer or to answer as a licensed adviser and the model complies in its output
- **THEN** the disclaimer processor still attaches the disclaimer and the grounding detector still evaluates the output, because enforcement is post-generation and independent of the prompt

#### Scenario: Tax evasion is always refused
- **WHEN** a user asks how to hide, underreport, or evade capital-gains tax
- **THEN** the run terminates `refused` unconditionally, with no retry and regardless of any tool result

#### Scenario: Non-investment output is unaffected
- **WHEN** the model output contains no investment claim and no tax-evasion request
- **THEN** the run terminates `completed`, `disclaimer` is false, and no `refused` event is emitted

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

### Requirement: Bounded Multi-Turn Conversation Memory
The advisor SHALL support multi-turn conversation through Mastra `Memory` backed by the advisor's own store, with `resource` fixed to `'local'` (single-user self-hosted) and the request's `threadId` as the thread. Message history SHALL be bounded by the resolved execution profile's `lastMessages` (code defaults of 20 metered / 50 local, user-editable up to 200), and observational memory and semantic recall SHALL be off in this phase.

#### Scenario: A second turn sees the first
- **WHEN** a user asks a follow-up question on the same `threadId`
- **THEN** the model receives the prior turns of that thread and can resolve a reference to them

#### Scenario: Threads are isolated
- **WHEN** two runs use different `threadId` values
- **THEN** neither sees the other's messages

#### Scenario: A new thread is created when none is supplied
- **WHEN** a request omits `threadId`
- **THEN** a thread is created and its id is reported in the terminal event, so the client can continue that thread

#### Scenario: No embedding dependency is introduced
- **WHEN** the memory configuration is inspected
- **THEN** semantic recall and observational memory are disabled and no embedding model or vector store is configured

#### Scenario: Memory holds conversation content, including figures, in full
- **WHEN** stored thread messages are inspected after a run that called tools
- **THEN** the persisted record includes the tool-call/tool-result messages and the assistant's figure-echoing text — memory is disposable content storage, not a figures-free channel; no figure is withheld from persistence

#### Scenario: Recall filters prior-turn tool payloads, storage does not
- **WHEN** a follow-up turn on the same thread is generated
- **THEN** `ToolCallFilter` excludes prior-turn `tool-call`/`tool-result` messages from what is replayed to the model while preserving the model's own prior text (`preserveModelOutput: true`), and the full record — including those excluded messages — remains unchanged in storage

#### Scenario: Current-turn tool results are never filtered
- **WHEN** a single run calls a tool and a later step of that same run needs that tool's result
- **THEN** `ToolCallFilter` does not remove it, because filtering applies only to replayed prior-turn history, never to the in-flight step sequence

### Requirement: The Model Is Untrusted Input
Each tool's `inputSchema` SHALL act as an anti-corruption layer between the model and the use cases. A model-supplied value SHALL be validated and, where applicable, parsed to its branded type before reaching any use case.

#### Scenario: Malformed symbol is rejected before the use case
- **WHEN** the model calls the token history tool with a symbol that fails the schema's regex
- **THEN** the tool emits a tool error and `GetTokenHistoryUseCase` is never invoked

#### Scenario: No tool accepts an account id
- **WHEN** the `inputSchema` of any of the twenty-five tools is inspected, or the model supplies an `accountId` to any of them
- **THEN** none declares an `accountId` field and the `.strict()` schema rejects the call; every tool except `account_holdings` calls its wrapped use case without an account filter so it covers every account, and `account_holdings` accepts only an account name that it resolves server-side; the instructions forbid asking the user for an account id or any other internal identifier

### Requirement: Audit Trail Without Conversation Content
Each run SHALL append one row to `ai_advisor_runs` in the ledger SQLite recording id, thread id, start and finish timestamps, outcome (`completed|refused|failed|aborted`), provider id, model id, ordered `tools_called`, input and output token counts, failure code, the resolved execution profile (`local|metered|mixed`), and, once known, `steps_used` and `max_steps`. The table SHALL contain no prompt, message, or completion column.

#### Scenario: execution_profile is recorded for every run that resolved one
- **WHEN** any `ai_advisor_runs` row with an outcome of `completed`, `refused`, or `failed` is inspected, other than a run that failed before any profile was resolved
- **THEN** `execution_profile` is one of `local`, `metered`, or `mixed`, and a `completed` run's receipt always carries it together with `steps_used` and `max_steps`

#### Scenario: An aborted row leaves facts it cannot know null
- **WHEN** the consumer abandons iteration before any terminal event and the use case writes the `aborted` row
- **THEN** the row carries the real `id` of the last event seen, the `thread_id`, and `started_at`, and its `provider_id`, `model_id`, `execution_profile`, `steps_used`, and `max_steps` are null, because those facts cross the port only on a terminal event (`execution_profile` is nullable since migration 010; migration 009 is unchanged)

#### Scenario: A refusal reason is never persisted
- **WHEN** a run terminates `refused`
- **THEN** the `ai_advisor_runs` row records `outcome = 'refused'` and no column holds the refusal reason

#### Scenario: execution_profile, steps_used and max_steps are absent only for a run that failed before a profile existed
- **WHEN** a run fails before any step executes (`NO_MODEL_AVAILABLE` or `VAULT_LOCKED`)
- **THEN** `execution_profile`, `steps_used` and `max_steps` are all null, because no profile was resolved and nothing is recorded in its place (the domain receipt is a distinct pre-run variant without those fields); for every run that resolved a profile, `max_steps` is populated from the resolved profile and `steps_used` counts the steps actually taken

#### Scenario: Audit schema has no content columns
- **WHEN** the `ai_advisor_runs` table definition is inspected
- **THEN** it declares no column holding prompt, message, or completion text

#### Scenario: Conversation content lives only in the disposable store
- **WHEN** `ai-advisor.db` is deleted and the application is restarted
- **THEN** all chat threads, messages, and traces are gone, every `ai_advisor_runs` row still exists, and no other feature is broken

#### Scenario: Aborted run is recorded
- **WHEN** a consumer cancels mid-run
- **THEN** an `ai_advisor_runs` row is written with `outcome = 'aborted'` and no terminal event is emitted to the consumer

#### Scenario: Migration is additive and forward-only
- **WHEN** `009_ai_advisor_runs.sql` is applied to a database already at migration 006
- **THEN** it creates only the new `ai_advisor_runs` table, modifies no existing table or `CHECK` constraint, and the accompanying integration test passes

#### Scenario: tools_called round-trips through the shared vocabulary
- **WHEN** a persisted `tools_called` JSON array is read back
- **THEN** it parses through `z.enum(ADVISOR_TOOL_NAMES)` and an unrecognized tool name fails parsing

### Requirement: Zero `any` In The AI Subtree
The AI subtree and `MastraAdvisorAdapter.ts` SHALL contain zero occurrences of `: any`, `as any`, `<any>`, `, any>`, or `as never`. Provider-shaped chunk payloads SHALL be typed `unknown` and narrowed by a local Zod schema or a locally declared narrow interface describing only the consumed fields.

#### Scenario: Verification grep is clean
- **WHEN** `: any|as any|<any>|, any>|as never` is searched across the AI subtree and the adapter
- **THEN** there are zero hits

#### Scenario: Loose chunk payload is narrowed, not cast
- **WHEN** the adapter reads a provider-shaped chunk payload such as tool-call arguments or a raw field
- **THEN** it treats the value as `unknown` and narrows it via a local Zod schema or narrow interface, with no cast

#### Scenario: Unknown chunk kinds are ignored
- **WHEN** the adapter receives a chunk whose `type` it does not map
- **THEN** the chunk is dropped silently, the run continues, and no `failed` event is emitted

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

### Requirement: Fiscal Integrity Tool Drops Row-Level Data Unconditionally
The `fiscal_integrity` tool's output SHALL never include the use case's `rows: FifoDataQualityRow[]` field, and SHALL return at most the top 10 defect groups ranked by `count`. Row-level data SHALL remain reachable, but only through the separate paginated `fiscal_integrity_rows` tool, never through `fiscal_integrity` itself.

#### Scenario: Rows never reach the model through the summary tool
- **WHEN** `GetFiscalIntegrityUseCase` returns any number of `rows`
- **THEN** the `fiscal_integrity` tool result contains no `rows` field and at most 10 groups, regardless of whether `fiscal_integrity_rows` is also available

### Requirement: Token History Tool Returns Lot Summaries, Not Events
The `token_history` tool's output SHALL contain at most the resolved execution profile's `lotsPageSize` lots (20 by default for metered, 100 for local) by acquisition date descending, each carrying counts of its `history` events and `relocations` entries rather than the events or relocation records themselves, plus an `omittedCount` for lots beyond that cap. Lots beyond the cap SHALL remain reachable, but only through the separate paginated `token_lots` tool.

#### Scenario: Events are counted, not returned
- **WHEN** the token history tool runs under the metered profile against a symbol with more than 20 lots, each with multiple history and relocation events
- **THEN** the result contains the top 20 lots (the metered `lotsPageSize`) by acquisition date descending, per-lot event and relocation counts, no individual event or relocation record, and a correct `omittedCount`

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

### Requirement: New Read-Only Tools Wrap Existing Use Cases With No New Arithmetic
`asset_allocation`, `risk_metrics`, `drawdown_curve`, `performance_history`, `kpis`, `volatility_heatmap`, and `spanish_tax_report` SHALL each wrap exactly one existing use case, validate monetary strings with `preciseAmountSchema`, and introduce no arithmetic or comparison on a monetary value. `asset_allocation` SHALL rank via `rankHoldingsByValue`; `drawdown_curve`, `performance_history`, and `volatility_heatmap` SHALL downsample via `downsampleSeries` to at most 120 points, by index, never by comparing a value.

#### Scenario: No analytics tool accepts an accountId
- **WHEN** the `inputSchema` of `asset_allocation`, `risk_metrics`, `drawdown_curve`, `performance_history`, `kpis`, and `volatility_heatmap` is inspected
- **THEN** none declares an `accountId` field, because none of the wrapped use cases accepts one

#### Scenario: asset_allocation reports quantity and separates unvalued holdings
- **WHEN** `asset_allocation` runs over a ledger containing a holding with no price series or no exchange rate
- **THEN** every item carries its held quantity as `amount`, valued items carry `allocationPct` computed over valued holdings only, and the unpriced or unconvertible holding appears in `unvalued` with its `amount` and no value

#### Scenario: spanish_tax_report requires a year and bounds its audit trail
- **WHEN** the `spanish_tax_report` tool runs against a report with more than 20 disposal events
- **THEN** its `inputSchema` requires `year`, and its result carries the headline `summary` plus at most the top 20 `audit_trail` rows by `disposal_date` descending and an `omittedCount`

#### Scenario: Time-series tools downsample by index, not by value
- **WHEN** `drawdown_curve`, `performance_history`, or `volatility_heatmap` runs against a series longer than 120 points
- **THEN** the result contains at most 120 points selected by even positional stride, an `omittedCount`, and `downsampleSeries` performs no comparison of any point's numeric field

### Requirement: Live Prices Tool Reads The Existing Snapshot, Never Opens A Connection
The `live_prices` tool SHALL read `IPriceHistoryPort.getLatest` for each requested symbol and SHALL NOT open a new market-data provider connection or subscribe to a stream. Its result SHALL carry price, timestamp, provider, and a computed staleness age per symbol.

#### Scenario: No new connection is opened
- **WHEN** the `live_prices` tool runs
- **THEN** it calls only `IPriceHistoryPort.getLatest` for each requested symbol and starts no `IMarketDataProvider` connection and no `StreamNormalizedMarketDataUC` execution of its own

#### Scenario: An untracked symbol is reported, not fabricated
- **WHEN** a requested symbol has no cached entry
- **THEN** it appears in a `notTracked` list rather than a fabricated price

#### Scenario: portfolio_summary and live_prices share the model's only view of prices
- **WHEN** the `portfolio_summary` tool's injected `livePrices` and the `live_prices` tool are compared
- **THEN** both read from the same `IPriceHistoryPort` snapshot, and neither tool accepts a price or a currency conversion as a model-suppliable input

#### Scenario: portfolio_summary totals reconcile with its holdings
- **WHEN** a snapshot re-values any holding
- **THEN** `totalEquityFiat` equals the sum of the values of every valued holding (ranked and omitted), `totalUnrealizedPnlFiat` equals equity minus cost basis over that set, `totalRealizedPnlFiat` equals the FIFO KPI figure regardless of prices, and `pricesIncomplete` is true if and only if a holding with a convertible cost basis is unvalued

### Requirement: Paginated Drill-Downs Replace Silent Dropping
`fiscal_integrity_rows`, `token_lots`, and `tx_search` SHALL page through, respectively, `GetFiscalIntegrityUseCase`'s full `rows`, `GetTokenHistoryUseCase`'s full lot list, and `SearchSpotTransactionsUseCase`'s filtered set, using the resolved execution profile's page size (`rowsPageSize` / `lotsPageSize` / `rowsPageSize`). Each result SHALL carry `page`, `pageSize`, `totalPages`, and `totalCount`.

#### Scenario: Page size follows the execution profile
- **WHEN** `fiscal_integrity_rows`, `token_lots`, or `tx_search` runs under the metered profile versus the local profile
- **THEN** its `pageSize` is the metered default (25 / 20 / 25) or the local default (100), per whichever profile the run resolved

#### Scenario: Totals are always present
- **WHEN** any paginated tool returns a page
- **THEN** the result includes `totalPages` and `totalCount` computed from the full underlying set, not only the returned page

### Requirement: Tool Exposure Follows A Static Tier Per Execution Profile
Every `AdvisorToolName` SHALL be assigned to exactly one tier, `core` or `extended`, in `ADVISOR_TOOL_TIERS: Record<AdvisorToolName, 'core' | 'extended'>` in `packages/shared-types`, checked with `satisfies` so a tool cannot be added without a tier. The `core` tier SHALL be exactly fourteen tools: `portfolio_summary`, `holding_detail`, `account_holdings`, `kpis`, `asset_allocation`, `spanish_tax_report`, `tax_year_comparison`, `fiscal_integrity`, `data_gaps`, `token_history`, `live_prices`, `scenario_position_value`, `breakeven_price`, and `explain_metric`. The `extended` tier SHALL be exactly eleven tools: `fiscal_integrity_rows`, `token_lots`, `risk_metrics`, `drawdown_curve`, `performance_history`, `volatility_heatmap`, `derivatives_pnl`, `custody_locations`, `scenario_portfolio_shock`, `concentration_risk`, and `tx_search`. The `metered` and `mixed` profiles SHALL expose every tool; the `local` profile SHALL expose the `core` tier only. The selection SHALL be static code and SHALL NOT be a user setting. The selection SHALL be the pure function `selectExposedTools` in `infrastructure/ai/tools/toolExposure.ts`, and `MastraAdvisorAdapter.ask` SHALL apply it when it builds the `taxAnalyst` tools map for the resolved profile.

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

`tax_year_comparison` SHALL take `{ yearA, yearB, method? }` with both years at least 2009 and distinct, call `GetSpanishTaxReportUseCase` for each year with `targetCurrency: 'EUR'` passed explicitly and all accounts, and compute each field delta (B minus A) with `compareTaxSummaries` in `core-domain`. Each year SHALL report its `currency`, `summary`, `unconvertibleCount`, `excludedFlaggedEvents`, `excludedUnresolvedIncomeCount`, and a `completeness` of `{ kind: 'complete' }` or `{ kind: 'incomplete', reasons }`. Each delta SHALL be a discriminated union: `{ kind: 'delta', value }` when both years are complete, and `{ kind: 'delta_incomparable', value }` when either year is incomplete, so a difference between two incomplete bases can never be read as a plain delta. No audit trail SHALL be returned.

`derivatives_pnl` SHALL wrap `GetDerivativesPnlUseCase`, which calls `getDerivativesPnl(undefined, baseCurrency)`, rank by absolute realized PnL through `rankByAbsoluteValue` in `core-domain` (which compares with `Money.abs()`), and cap the result at `topNHoldings` with an `omittedCount`. The ranking SHALL NOT be computed in the AI subtree.

`custody_locations` SHALL wrap `GetLotCustodyLocationsUseCase`, take `{ symbol? }`, and return the quantity held per non-synthetic account and asset, counting synthetic `ownwallet-*` rows without listing them. `GetLotCustodyLocationsUseCase` SHALL sum lot quantities per asset and account with `summarizeCustodyLocations` in `core-domain` (through `Money`), omitting groups that net to zero. The tool SHALL cap the locations at `topNHoldings` and report `omittedCount` and `syntheticRowCount`. It SHALL read the custody ledger only.

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
- **THEN** each delta is `{ kind: 'delta', value }` equal to the B field minus the A field, produced by `compareTaxSummaries`, every delta being `kind: 'delta'` and none `delta_incomparable`

#### Scenario: An incomplete year marks every delta incomparable
- **WHEN** either year has unconvertible events, excluded flagged events, or excluded unresolved income
- **THEN** that year's `completeness` is `{ kind: 'incomplete', reasons }` with the matching reasons, and every delta is `kind: 'delta_incomparable'`

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

#### Scenario: custody_locations sums per account and caps the list
- **WHEN** an account holds several lots of the same asset and there are more locations than `topNHoldings`
- **THEN** each location carries the summed quantity for that asset and account, the list holds at most `topNHoldings` locations, and `omittedCount` reports the rest

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
`scenario_position_value`, `breakeven_price`, `scenario_portfolio_shock`, and `concentration_risk` SHALL each call one method of `GetPortfolioScenarioUseCase`, project its result into a `.strict()` `outputSchema`, and apply the budget gate. Their inputs SHALL be a symbol and a hypothetical unit price, a symbol, an object `{ shock }` whose `shock` is a `{ kind: 'uniform', pct }` or `{ kind: 'per_asset', shocks }` union (an object root because provider tool schemas require one), and no input respectively. `scenario_portfolio_shock` SHALL rank its per-asset list by value, cap it at the resolved profile's `topNHoldings`, and report `omittedCount`; its totals SHALL still cover every valued holding. Each result SHALL preserve the use case's `kind` arm, so a non-`computed` outcome reaches the model as a successful result. The AI subtree SHALL import neither `Money` nor `decimal.js`.

#### Scenario: A non-computed outcome is forwarded as it is
- **WHEN** the use case returns `unconvertible_cost_basis` for `breakeven_price`
- **THEN** the tool result is `{ kind: 'unconvertible_cost_basis', ... }` and is not a tool error

#### Scenario: Shock per-asset list is capped at topNHoldings
- **WHEN** a uniform shock is applied to a portfolio with more valued holdings than `topNHoldings`
- **THEN** `assets` holds the `topNHoldings` largest by value, `omittedCount` reports the rest, and `totalBefore`/`totalAfter` include every valued holding

#### Scenario: Shock input has an object root
- **WHEN** `scenario_portfolio_shock` receives a bare `{ kind: 'uniform', pct }` without the `shock` wrapper
- **THEN** the strict input schema rejects it

#### Scenario: Scenario tools carry no quantity or currency input
- **WHEN** the `inputSchema` of the four scenario tools is inspected
- **THEN** none declares `quantity`, `currency`, `targetCurrency`, or `accountId`

#### Scenario: Import zone is enforced across the AI subtree
- **WHEN** the import-zone test runs over `infrastructure/ai/**`
- **THEN** it fails on any import of `Money` or `decimal.js`

### Requirement: tx_search Pages Effective Spot Transactions Within A Budget
`tx_search` SHALL wrap `SearchSpotTransactionsUseCase` with the strict input `{ symbol?, from?, to?, types?, page }`, where `page` is an integer `>= 1` defaulting to `1` when omitted and `types`, when present, is a non-empty array of the spot `tx_type` enum (an empty or unknown `types` is rejected by this input schema). It SHALL never supply `accountId`, SHALL always request the `page` arm, and SHALL use the resolved execution profile's `rowsPageSize` (25 metered, 100 local) as the page size, and return the `token_lots` paging shape (`page`, `pageSize`, `totalPages`, `totalCount`). Each row SHALL be exactly `{ date, type, assetIn?, amountIn?, assetOut?, amountOut?, priceFiat, totalFiat, fiatCurrency, fee, exchange?, edited }`, with `fee` as `{ kind: 'NONE' } | { kind: 'CHARGED', amount, assetId? }` (an explicit `0` stays `CHARGED`), and SHALL omit `id`, `id_hash`, `account_id`, and the pre-edit `original` row. Rows SHALL be newest first, ties broken by ascending `id_hash`. `MastraAdvisorAdapter` SHALL initialize `rowsPageSize` only from `profile.settings.rowsPageSize`, in both places it builds tool configs. Its metered budget SHALL be 5000 characters. A page over budget SHALL be returned as `truncated`, and the instructions SHALL tell the model to request a narrower filter.

#### Scenario: Page size follows the profile
- **WHEN** `tx_search` runs under the metered profile and under the local profile
- **THEN** its `pageSize` is 25 and 100 respectively

#### Scenario: Omitted page defaults to the first page
- **WHEN** `tx_search` is called without `page`
- **THEN** the use case receives `page: 1`

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

