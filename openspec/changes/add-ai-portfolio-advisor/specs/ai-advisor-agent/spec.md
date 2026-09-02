# ai-advisor-agent Specification (delta)

## ADDED Requirements

### Requirement: Read-Only By Construction
The advisor SHALL expose exactly three tools — a portfolio summary tool, a fiscal integrity tool, and a token history tool — and SHALL define no tool capable of writing, updating, or deleting any data. The read-only guarantee MUST hold by the absence of a write tool, never by an instruction in a prompt.

#### Scenario: Tool registry contains no write tool
- **WHEN** the advisor agent's registered tool set is enumerated
- **THEN** it contains exactly the three read tools, and no tool whose `execute` performs an insert, update, or delete against any store

#### Scenario: A request to change a holding cannot mutate state
- **WHEN** a user asks the advisor to change, delete, or add an asset quantity or value
- **THEN** the run terminates with a terminal event and every asset quantity, cost basis, and fiscal figure in the ledger is byte-identical to its value before the run

### Requirement: No Figure Originates In The AI Layer
Every numeric or monetary figure reaching the model SHALL originate from `GetPortfolioSummaryUseCase`, `GetFiscalIntegrityUseCase`, or `GetTokenHistoryUseCase`. The AI subtree SHALL contain no arithmetic on monetary values, no comparison of monetary values, no SQL, no `ORDER BY`, and no `PARTITION BY`. Any monetary comparison SHALL be delegated to `Money` in `packages/core-domain`.

#### Scenario: Tool wrappers are thin
- **WHEN** a tool's `execute` runs
- **THEN** it validates its input, calls exactly one injected use case, projects the response into its `outputSchema` shape, and performs no computation that changes any figure's value

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
- **THEN** that field is an integer count (such as `omittedCount`, `totalDefects`, or a token count) and never a monetary amount

### Requirement: Ranking By Value Is Delegated To A Pure Domain Service
The portfolio snapshot arrives unordered and a holding's value may be absent or unconvertible, so the top-N selection SHALL be performed by `rankHoldingsByValue` in `packages/core-domain`, which compares through the `Money` value object. The AI subtree SHALL perform no sort and no comparison of its own. `Money` SHALL gain a `compare(other: Money): -1 | 0 | 1` method for this purpose.

#### Scenario: The tool does not rank
- **WHEN** the portfolio summary tool's implementation is inspected
- **THEN** it calls `rankHoldingsByValue` and contains no `.sort(`, no comparison operator applied to a monetary value, and no `decimal.js` import

#### Scenario: Ranking is by descending value
- **WHEN** `rankHoldingsByValue` is given holdings whose values differ only in decimal places beyond float precision
- **THEN** the returned order is correct by exact decimal comparison, because `Money.compare` is used rather than float arithmetic

#### Scenario: Unvalued holdings are a third list, never sorted as zero
- **WHEN** a holding has no resolved `current_value_fiat`, or its `cost_basis` is `UNCONVERTIBLE`
- **THEN** it is returned in the service's `unvalued` list, is absent from `ranked`, is not counted in `omittedCount`, and is never compared as if its value were `'0'`

#### Scenario: The value accessor forces the absent case to be handled
- **WHEN** `rankHoldingsByValue`'s signature is inspected
- **THEN** its value accessor returns `string | undefined`, so a caller cannot pass a value type that hides the absent case

### Requirement: Incompleteness Signals Reach The Model With The Figures
A tool result carrying portfolio figures SHALL also carry the incompleteness signals the use case already computed — `ratesIncomplete`, `pricesIncomplete`, and the count of unvalued holdings — and the agent's instructions SHALL require an incomplete total to be reported as incomplete.

#### Scenario: Flags are passed through, not dropped
- **WHEN** `GetPortfolioSummaryUseCase` returns `prices_incomplete: true`
- **THEN** the tool result carries that signal and the count of unvalued holdings, rather than presenting the total as complete

#### Scenario: An absent figure is never defaulted
- **WHEN** a monetary field is absent or unconvertible in the use-case response
- **THEN** the tool result represents it as unvalued and never substitutes `'0'`, `null`, or an empty string that reads as a value

#### Scenario: Instructions require the caveat
- **WHEN** the instruction string is inspected
- **THEN** it directs the agent to state that a total is partial whenever a tool result reports an incompleteness signal

### Requirement: No Path From The AI Layer To The FIFO Engine
Tool factories SHALL receive only the constructed use-case instances they wrap, and SHALL be given no access to `ILedgerPort`, `ITaxCalculatorPort`, `IDatabasePort`, or any DuckDB connection. This change SHALL introduce no new ordering, partitioning, or disposal-generating code.

#### Scenario: Tool factory dependency set is minimal
- **WHEN** each tool factory's constructor parameters are inspected
- **THEN** the only injected dependencies are the use case it wraps and pure configuration, with no ledger port, tax calculator port, or database port present

#### Scenario: Custody and tax orderings are untouched
- **WHEN** the change's diff is inspected
- **THEN** it modifies no DuckDB view, no FIFO materializer, and no custody ledger allocation, and adds no `PARTITION BY` or `ORDER BY` clause anywhere

### Requirement: Hexagonal Isolation Of The LLM SDK
`IAdvisorPort` SHALL be declared in the backend domain and SHALL import nothing external — no `@mastra/*`, no Zod, no `decimal.js`, no web-stream or HTTP type. `MastraAdvisorAdapter.ts` SHALL be the only file in the repository that imports `@mastra/*`.

#### Scenario: Port signature is dependency-free
- **WHEN** `core/domain/ports/IAdvisorPort.ts` is inspected
- **THEN** it declares `ask(request: AdvisorRequest): AsyncIterable<AdvisorEvent>` and its only imports are `import type` from sibling domain modules

#### Scenario: Single Mastra import site
- **WHEN** the repository is searched for imports of `@mastra/`
- **THEN** every hit is inside `MastraAdvisorAdapter.ts`

#### Scenario: The audit write goes through its own port
- **WHEN** `AskAdvisorUC` is inspected
- **THEN** it persists the run receipt through `IAdvisorRunLogPort` and contains no SQL, no `IDatabasePort`, and no direct SQLite access

#### Scenario: The run-log port is domain-pure
- **WHEN** `core/domain/ports/IAdvisorRunLogPort.ts` is inspected
- **THEN** its only imports are `import type` from sibling domain modules, and its methods return `Promise<…>`

### Requirement: Domain Advisor Events Carry The Run Receipt
`AdvisorEvent` SHALL be a `kind`-discriminated union whose terminal members are `completed`, `refused`, and `failed`, each carrying an `AdvisorRunReceipt` (provider used, model used, ordered tool names, token counts). There SHALL be no second channel for run metadata.

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
- **THEN** the accumulated draft is persisted with `outcome = 'aborted'`, and no terminal event is emitted

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
The advisor SHALL be a single agent whose `instructions` is a function of request context (locale and base currency), not N duplicated prompts. No verbosity input SHALL be introduced in this phase, because no setting or control exists to supply one. The system prefix SHALL be stable across requests so prompt caching applies; volatile portfolio data SHALL appear only inside tool results.

#### Scenario: Locale changes only the volatile suffix
- **WHEN** two runs are made with `language` set to different values
- **THEN** the produced instruction strings share an identical stable prefix and differ only in the context-derived section

#### Scenario: No portfolio data in the prompt
- **WHEN** the instruction string produced for any request context is inspected
- **THEN** it contains no asset symbol, quantity, balance, or fiscal figure

### Requirement: Guardrail Enforced By An Output Processor
The "not financial advice" guardrail SHALL be implemented as a Mastra output processor, not as a sentence in the prompt. When the processor trips, the run SHALL terminate as `refused` carrying the processor id and reason.

#### Scenario: Guardrail trips
- **WHEN** the model output triggers the output processor's abort
- **THEN** the run terminates with `refused`, carrying the tripping `processorId` and a reason, and the withheld answer is not delivered

#### Scenario: The guardrail cannot be argued away
- **WHEN** a user instructs the advisor to ignore its disclaimer or to answer as a licensed adviser and the model complies in its output
- **THEN** the output processor still evaluates that output and still trips, because enforcement is post-generation and independent of the prompt

#### Scenario: Compliant output is unaffected
- **WHEN** the model output does not trigger the processor
- **THEN** the run terminates with `completed` and no `refused` event is emitted

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
- **WHEN** each tool's configured budget is read
- **THEN** the portfolio summary budget is 4000 characters, fiscal integrity 6000, and token history 6000

#### Scenario: Widening a DTO fails validation
- **WHEN** a field not declared in a tool's `outputSchema` is added to its payload
- **THEN** the `.strict()` schema rejects it rather than emitting a silently larger payload

### Requirement: Bounded Multi-Turn Conversation Memory
The advisor SHALL support multi-turn conversation through Mastra `Memory` backed by the advisor's own store, with `resource` fixed to `'local'` (single-user self-hosted) and the request's `threadId` as the thread. Message history SHALL be bounded, and observational memory and semantic recall SHALL be off in this phase.

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

#### Scenario: Memory holds no portfolio figures
- **WHEN** stored thread messages are inspected after a run that called tools
- **THEN** portfolio figures appear only as part of the conversation the model produced, and no tool result is written into working memory as structured user data

### Requirement: The Model Is Untrusted Input
Each tool's `inputSchema` SHALL act as an anti-corruption layer between the model and the use cases. A model-supplied value SHALL be validated and, where applicable, parsed to its branded type before reaching any use case.

#### Scenario: Malformed symbol is rejected before the use case
- **WHEN** the model calls the token history tool with a symbol that fails the schema's regex
- **THEN** the tool emits a tool error and `GetTokenHistoryUseCase` is never invoked

#### Scenario: Account id is branded before use
- **WHEN** the model supplies an `accountId`
- **THEN** it is parsed to its branded domain type at the tool boundary, not cast

### Requirement: Audit Trail Without Conversation Content
Each run SHALL append one row to `ai_advisor_runs` in the ledger SQLite recording id, thread id, start and finish timestamps, outcome (`completed|refused|failed|aborted`), provider id, model id, ordered `tools_called`, input and output token counts, and failure code. The table SHALL contain no prompt, message, or completion column.

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
- **WHEN** `007_ai_advisor_runs.sql` is applied to a database already at migration 006
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
