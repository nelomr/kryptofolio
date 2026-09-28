# Design — add-ai-portfolio-advisor (Phase 0)

## Context

`proposal.md` establishes the motivation and the Capabilities contract (`ai-advisor-agent`,
`ai-model-routing`, `ai-advisor-chat`, plus modifications to `api-gateway` and
`dynamic-vault-registry`). This document resolves the technical decisions that must be settled
*before* implementation, per CLAUDE.md working method rule 1.

Current state relevant to this change, verified against the repository:

- **Ports** live in `apps/backend/src/core/domain/ports/` (16 today). House style: `I*Port.ts`,
  every method `Promise<…>`, no `Result<T,E>` type anywhere, `import type` only, `.js` extensions
  (NodeNext ESM), branded types from `../value-objects/PreciseAmount.js`, vocabularies as
  `import type` from `@kryptofolio/shared-types`. `ILedgerPort.ts` carries the explicit
  "DOMAIN ISOLATION RULE: No external library imports allowed here" header.
- **The three source use cases** already exist with the signatures the tools will wrap:
  - `GetPortfolioSummaryUseCase.execute(req: GetPortfolioSummaryRequest = {}): Promise<PortfolioSummaryResponse>`
  - `GetFiscalIntegrityUseCase.execute(request: GetFiscalIntegrityRequest): Promise<FiscalIntegrityReport>`
  - `GetTokenHistoryUseCase.execute(req: GetTokenHistoryRequest): Promise<GetTokenHistoryResponse>`
  Their request/response types are declared in the same file as the use case.
- **Their response shapes, measured rather than assumed** (working-method rule 5):
  `PortfolioHoldingDto` fields are **snake_case plain `string`**, not branded `PreciseAmount`;
  `live_price`, `current_value_fiat` and `unrealized_pnl_fiat` are **optional**; `cost_basis` is a
  `ConvertedAmount` — a `kind` union with a genuine `UNCONVERTIBLE` arm; and
  `PortfolioSummaryMetricsDto` carries `rates_incomplete` / `prices_incomplete`. A figure can
  therefore be *absent* or *unconvertible*, which is a third state, not a zero.
- **`holdings` arrives unordered.** `DuckDbPortfolioAnalyticsAdapter.getHoldingsSnapshot` has no
  final `ORDER BY` — the only `ORDER BY`s in that query are inside window functions — so no caller
  may assume a ranking it did not perform itself. This is what forces Decision 9.
- **`FiscalIntegrityGroup` already carries an integer `count`**, so ranking defect groups needs no
  monetary comparison.
- **Six further read-only use cases exist and were measured for D16's tool catalogue, all with no
  write-port call anywhere in their bodies**: `GetAssetAllocationUseCase.execute(targetCurrency?):
  Promise<AssetAllocationItem[]>` (`{ assetId, symbol, color?, allocationPct, valueFiat, currency }`,
  unordered, plain strings); `GetRiskMetricsUseCase.execute(targetCurrency?): Promise<RiskMetrics>`
  (`{ maxDrawdownPct, annualizedVolatility, sharpeRatio, alpha, beta, currency }`, fixed shape);
  `GetDrawdownCurveUseCase.execute(days?, targetCurrency?): Promise<DrawdownPoint[]>` (`{ date,
  drawdownPct }`); `GetPerformanceHistoryUseCase.execute(days?, targetCurrency?):
  Promise<PerformanceHistoryPoint[]>` (`{ date, portfolioValue, btcValue?, drawdownPct }`);
  `GetKpisUseCase.execute(targetCurrency?): Promise<MetricsKpis>` (a large fixed-shape DTO — its own
  doc comment says it exists only to host the `ensureFresh()` freshness gate that the route used to
  skip); `GetVolatilityHeatmapUseCase.execute(year?, targetCurrency?):
  Promise<VolatilityHeatmapCell[]>` (`{ date, volatility }`). **None of these six accepts an
  `accountId`** — unlike the three source use cases above. A seventh,
  `GetSpanishTaxReportUseCase.execute({ year, method?, accountId?, targetCurrency? }):
  Promise<SpanishTaxReportResponse>`, does accept `accountId`, requires `year`, and returns a headline
  `summary` plus a per-disposal `audit_trail` array. Full contracts and D16's derived tool schemas are
  in D16.
- **The latest live price snapshot is a cache, not a use case**: `IPriceHistoryPort` (`save`,
  `getLatest(symbol, currency)`, `getHistory`, `getTrackedSymbols`), implemented in-memory by
  `InMemoryPriceHistoryAdapter` as a per-symbol ring buffer (1440 entries, 24h at 1-minute resolution).
  `MarketDataOrchestrator` throttles broadcast to 5s per symbol and `routes/market.ts`'s
  `broadcastPrice` both fans out over SSE and calls `priceHistoryPort.save(price)`; `getLatest` returns
  the buffer's last `AssetPrice` (`{ symbol, currency, price, change24hPercent, provider, timestamp }`)
  or `null`. `StreamNormalizedMarketDataUC.execute(rawPrice): Promise<AssetPrice>` is the pure
  currency-normalization step run per incoming provider tick — it is not itself a read port and is not
  wrapped as a tool; D16's `live_prices` tool reads `IPriceHistoryPort.getLatest` directly, never
  invoking that use case or opening a provider connection of its own.
- **The Ollama context-window option, confirmed against the installed package's published types**
  (`ollama-ai-provider-v2@4.0.1`): the option is `num_ctx`, nested under `options`, passed as
  `providerOptions: { ollama: { options: { num_ctx } } }` per the Vercel AI SDK's per-call
  provider-options convention — not a top-level `contextWindow` field and not a provider constructor
  option.
- **`Money` (`packages/core-domain/src/value-objects/Money.ts`) wraps `decimal.js` privately but
  already exposes `compareTo(other: Money): -1 | 0 | 1`** (`Money.ts:45`), backed by `Decimal.comparedTo`.
  Ranking reuses it; no new method is added (Decision 9).
- **A frontend streaming precedent already exists, and it is port-shaped**:
  `IMarketDataPort.subscribeToStream` declares the stream in the frontend *domain port*;
  `BffMarketDataAdapter` owns the transport and reports validation failures to the `errorBus`; the
  composable holds only reactive state. Decision 11 follows it rather than inventing a second
  pattern.
- **Error convention** is thrown typed errors plus `SCREAMING_SNAKE_CODE` strings in responses
  (i18n keys, never prose). There is no `Result` type and none is introduced here.
- **SSE precedent exists**: `routes/market.ts` `GET /api/market/stream` uses `streamSSE` from
  `hono/streaming`, `stream.writeSSE({ data, event })`, and `stream.onAbort(...)`. Hono is pinned in the
  workspace catalog as `^4.12.34`. No `ReadableStream` consumer exists on the frontend yet.
- **AppType** is composed fluently in `apps/backend/src/app.ts`; chained `.route()` calls are
  mandatory for inference.
- **The "dynamic vault registry" is not data-driven**: it is a hardcoded `VaultProvider[]` returned
  by `GetAvailableProvidersUseCase`, and `POST /api/credentials/vault/:service` rejects anything not
  in that list with `UNKNOWN_PROVIDER`. `VaultProvider` has no `kind`/category field. Storage
  (`system_credentials.service_identifier TEXT UNIQUE`) is generic, so no migration is needed to
  add AI providers.
- **Settings** are a generic KV: `IUserSettingsPort.getSetting(key)` / `setSetting(key, value)`
  over `user_settings`. Known keys include `language` and `base_currency`.
- **`audit_log`** exists (trigger-fed, per-table row diffs). There is no run-log / job-telemetry
  table. Migrations are `packages/database/migrations/sqlite/00N_*.sql`, applied forward-only by
  `applyMigrations`, and each new migration ships with an integration test.
- **No AI dependency is installed**: no `@mastra/*`, no `ai`, no `@ai-sdk/*`, no `libsql`. Note that
  `Memory` ships in the separate `@mastra/memory` package, so Phase 0 installs four packages, not three. The
  Mastra type analysis in Decision 6 is therefore drawn from Mastra's published type reference, and
  is flagged for re-verification immediately after install.
- **Environment**: root `engines.node` is `>=24.16.0`; the developer's default shell node is
  `v20.20.0`. Every command — `pnpm install`, `pnpm test`, `pnpm typecheck`, and `git commit`
  (whose Husky hook runs under whatever node is first on `PATH`) — needs an explicit `PATH` prefix
  pointing at Node 24.

## Goals / Non-Goals

**Goals:**

1. Prove the full seam end to end: domain port → use case → one adapter → typed Hono route →
   streaming UI, with zero business logic in the AI layer.
2. Make "the LLM never produces a number" structural, not aspirational.
3. Make "the advisor cannot write" structural: no write tool is defined at all.
4. Settle the SSE wire contract, the port signature, fallback resolution, the audit schema, the
   token-budget mechanism, and the Zod boundary — completely, with no TBD.
5. Keep `hc<AppType>` intact and zero `any` in the AI subtree.

**Non-Goals:**

- Everything `proposal.md` lists as out of scope for Phase 0 (`structuredOutput` reports,
  `requireApproval` write flows, RAG, rebalancing, scorers, PII redaction).
- A new workspace package. Backend code lands in `apps/backend`, and the only work in existing
  shared packages is one `shared-types` module (Decision 1) and additive `core-domain` services —
  `rankHoldingsByValue` (Decision 9) and `downsampleSeries` (D16).
- Any change to `IDatabasePort`, the ledger schema's existing tables, DuckDB views, or the FIFO
  engine.
- Multi-user scoping. Single-user self-hosted; `resource` is the constant `'local'`.

## Decisions

### D1 — The SSE wire contract, and how it stays type-safe across an untyped boundary

**Decided.** SSE is not a typed RPC response: `hc<AppType>` will type the *path* and the request
body of the stream route, but its response is an opaque `text/event-stream`. Pretending otherwise
is the trap. The contract is therefore carried by a **Zod schema shared by both sides**, not by
inference.

`packages/shared-types/src/advisor-stream.ts` (new) exports `advisorStreamEventSchema` and
`export type AdvisorStreamEvent = z.infer<typeof advisorStreamEventSchema>` — a
`kind`-discriminated union (rule 5), never a flag plus optional payload:

| `kind` | payload | meaning |
|---|---|---|
| `token` | `text: string` | one text delta to append |
| `tool-start` | `callId: string`, `tool: AdvisorToolName` | a tool call began |
| `tool-result` | `callId`, `tool` | that call returned successfully |
| `tool-error` | `callId`, `tool`, `code: AdvisorToolErrorCode` | that call failed; the run may still continue |
| `done` | `runId`, `providerId`, `modelId`, `usage: { inputTokens, outputTokens }`, `toolsCalled: AdvisorToolName[]`, `executionProfile: 'local' \| 'metered' \| 'mixed'`, `stepsUsed`, `maxSteps` | terminal, success |
| `refused` | `runId`, `reason: string`, `processorId: string` | terminal, guardrail tripwire |
| `failed` | `runId`, `code: AdvisorFailureCode` | terminal, server-side failure |

`AdvisorToolName`, `AdvisorFailureCode` and `AdvisorToolErrorCode` are shared const tuples fed to
`z.enum(...)`, mirroring the existing `z.enum(FIFO_QUALITY_FLAGS)` convention, so an unknown
vocabulary cannot cross the wire in either direction. **All three are enumerated closed here**, so
no failure reaches the wire as an unnamed string:

```ts
export const ADVISOR_TOOL_NAMES = [ // the full read-only catalogue, D16
  'portfolio_summary', 'fiscal_integrity', 'token_history',
  'asset_allocation', 'risk_metrics', 'drawdown_curve', 'performance_history', 'kpis',
  'volatility_heatmap', 'spanish_tax_report', 'live_prices',
  'fiscal_integrity_rows', 'token_lots',
] as const;
export const ADVISOR_FAILURE_CODES = [
  'NO_MODEL_AVAILABLE',   // the resolved chain was empty
  'VAULT_LOCKED',         // the chain was non-empty but no key could be decrypted
  'ALL_PROVIDERS_FAILED', // every entry exhausted its retries
  'INTERNAL_ERROR',       // the run-wrapping catch: an otherwise unnamed throw
] as const;
export const ADVISOR_TOOL_ERROR_CODES = ['INVALID_TOOL_INPUT', 'USE_CASE_FAILED'] as const;
```

`INTERNAL_ERROR` exists so that "even an unexpected throw emits `failed` before closing" is
expressible without widening the code to `string`.

Framing: one SSE frame per event, `event: <kind>` and `data: <JSON of the event>`, written with the
existing `streamSSE` helper. Keep-alives are SSE **comment** lines (`: keep-alive`) every 15s, so
they can never be mistaken for an event by the parser.

**Guardrail abort vs transport failure — the discriminator is a protocol invariant, not a heuristic.**
Exactly one of `done | refused | failed` is emitted, always, as the last frame; the server wraps the
whole run so that even an unexpected throw emits `failed` before closing. Consequently:

- a `refused` frame is a guardrail tripwire — the run completed, the answer was withheld;
- a `failed` frame is a named server-side failure with a code;
- **a stream that closes with no terminal frame is a transport failure**, and the frontend
  synthesizes a local `{ kind: 'transport-lost' }` state itself. `transport-lost` deliberately does
  **not** exist in the wire schema — it is unrepresentable on the wire, which is what makes the
  distinction sound.

Cancellation: the frontend holds an `AbortController` and calls `abort()`; that aborts the `fetch`,
Hono fires `stream.onAbort`, and the adapter's cleanup path (D2) tears down the model call. The run
is recorded with outcome `aborted` (D4) and **no terminal frame is sent** — nobody is listening.

Validation runs on both sides: the route `advisorStreamEventSchema.parse(...)`s every frame before
writing it (so a malformed frame is a server-side test failure, not a client mystery), and the
frontend `parseOrFail`s every frame through the same schema. A round-trip contract test in
`packages/shared-types` asserts every variant survives serialize → parse.

*Alternatives considered.* **`EventSource`** — rejected: it cannot POST a body, cannot set headers,
and reconnects automatically, which would silently re-run and re-bill a completed LLM call.
**WebSocket** — rejected: bidirectional machinery and a second protocol for a one-way token stream.
**Mastra's `toUIMessageStreamResponse()` / the Vercel AI SDK data-stream protocol** — rejected: it
would make a third-party wire format our public contract and pull an `ai`-SDK-shaped dependency into
the frontend, defeating the "Mastra as a library" decision.

### D2 — `IAdvisorPort`

**Decided.** The port expresses the stream as an **`AsyncIterable`**, which is a TypeScript/ECMAScript
language construct rather than an external dependency — so the domain stays clean of HTTP,
Mastra, and web streams (rule 3):

```ts
// core/domain/ports/IAdvisorPort.ts
import type { AdvisorEvent } from "../models/AdvisorEvent.js";
import type { AdvisorRequest } from "../models/AdvisorRequest.js";

export interface IAdvisorPort {
  ask(request: AdvisorRequest): AsyncIterable<AdvisorEvent>;
}
```

Three consequences, each deliberate:

1. **No `AbortSignal` in the domain.** Cancellation is expressed by the consumer ceasing to iterate
   (`break` out of `for await`, or the route's `onAbort` calling `.return()` on the iterator). The
   async generator's `finally` block in the adapter is what aborts the Mastra call. `AbortSignal` is
   a platform global, not a library type, but keeping it out of the port means the domain contract
   describes *iteration*, and only the adapter knows there is a network call to cancel.
2. **No `Promise` wrapper and no `ReadableStream`.** `ask` returns the iterable directly; nothing
   in the signature hints at web streams or SSE.
3. **The terminal event carries the receipt.** `AdvisorEvent` is a `kind` union whose terminal
   members (`completed`, `refused`, `failed`) carry an `AdvisorRunReceipt` — model actually used,
   ordered tool names, token counts, and, since D16, the resolved `executionProfile` plus
   `stepsUsed`/`maxSteps`. There is no separate "and also return metadata" channel, which
   would otherwise be impossible to express in a bare iterable.

**The receipt is accumulated during the run, not assembled at its end** — otherwise the one outcome
that must be audited most, cancellation, could not be audited at all. A cancelled run produces no
terminal event by definition (D1), so "persist on the terminal event" cannot express the `aborted`
row that D4 requires. The mechanism:

- the adapter maintains an `AdvisorRunReceiptDraft` and fills it as facts become known — `runId` at
  the start, `providerId`/`modelId` the moment a chain entry is chosen, each `AdvisorToolName` as its
  call completes, token counts on `finish`;
- a terminal event carries a **frozen `AdvisorRunReceipt` built from that draft**;
- `AskAdvisorUC` delegates with `yield*` and wraps the delegation in `try/finally`. On normal
  termination it observes the terminal event and persists that outcome. On cancellation the `finally`
  runs — the consumer stopped iterating — and persists the draft with `outcome: 'aborted'`.

Persistence is idempotent per `runId`: `ai_advisor_runs.id` is the primary key and the port's write
is an upsert on it, so the two paths can never double-write. Exactly one row per run, including the
cancelled one.

Persistence goes through a **second domain port, `IAdvisorRunLogPort`**
(`appendRun(receipt: AdvisorRunReceipt | AdvisorRunReceiptDraft, outcome: AdvisorRunOutcome): Promise<void>`).
The use case must not touch SQLite directly (rule 2), and a receipt is domain data, so the port
belongs in `core/domain/ports/` beside `IAdvisorPort` and its adapter beside the other
`*Adapter.ts` files.

`AdvisorEvent` (domain) and `AdvisorStreamEvent` (wire, D1) are **deliberately distinct**. The
domain vocabulary is semantic and may carry branded types; the wire type is the serialized
projection, Zod-validated. `infrastructure/dtos/advisor.ts` owns the single mapping function
`toWireEvent(event: AdvisorEvent): AdvisorStreamEvent`, which is exactly the existing
anti-corruption convention (routes already `schema.parse(...)` outbound, e.g.
`fiscalIntegrityReportSchema.parse(report)`).

`AskAdvisorUC.execute()` is the Functional Sandwich at stream scale: resolve context impurely
(locale + base currency via `IUserSettingsPort`, model chain via D3), then yield through the port,
then persist the receipt impurely via `IAdvisorRunLogPort` — on the terminal event, or in the
`finally` when the run was cancelled (D4).

**Domain and wire vocabularies do not share names, and the mapping is fixed here** so no document or
test drifts between them. `AdvisorEvent.kind` → `AdvisorStreamEvent.kind`:

| domain | wire |
|---|---|
| `completed` | `done` |
| `refused` | `refused` |
| `failed` | `failed` |

Everything below the route — port, use case, adapter, model chain — speaks the **domain** names;
only the SSE contract and the frontend speak the wire names. A requirement about adapter or
routing behaviour therefore says `completed`, never `done`.

*Alternatives considered.* **`ask(query, sink: (e: AdvisorEvent) => void): Promise<AdvisorRunReceipt>`**
(observer) — rejected: it inverts control, gives the consumer no backpressure, and makes
cancellation an extra out-of-band parameter. **Returning a `ReadableStream<AdvisorEvent>`** —
rejected outright: a web-platform streaming type in a domain port is exactly the leak rule 3 exists
to prevent. **Returning Mastra's `MastraModelOutput`** — rejected: that is the adapter's type and
would make the port a re-export of the vendor SDK.

### D3 — Model chain configuration, resolution, and total failure

**Decided.** Mastra natively supports a fallback array with per-entry retry
(`model: [{ model: 'openai/…', maxRetries: 3 }, { model: 'anthropic/…', maxRetries: 2 }]`), retrying
on 5xx / 429 / timeout and moving to the next entry when retries are exhausted. We use it rather
than writing our own retry loop.

- **Where the ordered list lives: user settings, not config.** A new `user_settings` key
  `ai_advisor_model_chain` holds a JSON array of `{ providerId, modelId }`, validated by
  `modelChainSchema` (D7). Settings, because the user must be able to reorder providers and swap
  models without a rebuild — a TS constant would make that a code change.
- **Resolution happens per request**, inside `MastraAdvisorAdapter`, through Mastra's dynamic
  `model: ({ requestContext }) => […]` form. One agent, one instructions function, no duplicated
  agents per provider.
- **Keys are always passed explicitly** as a router config object, decrypted at request time through
  `IVaultCredentialsPort.getCredential(providerId)` + `ICryptographyPort.decrypt`. Mastra's
  environment-variable auto-detection is never relied upon, because plaintext keys in `.env` are
  precisely what this change removes. The documented shape is Mastra's `OpenAICompatibleConfig`
  (`{ id: 'openai/gpt-…', apiKey, url?, headers? }`); every published example pairs `apiKey` with
  `url`, so task 1.5 confirms against the installed `.d.ts` that a built-in router id accepts
  `apiKey` without `url`.
- **`ollama` and `ollama-cloud` are two distinct provider ids, not one, because they are two distinct
  trust boundaries.** `ollama` is the local daemon: `createOllama({ baseURL })` from
  `ollama-ai-provider-v2`, no key in the vault, no key required. When the local daemon is itself
  signed in to an Ollama account, it also accepts `:cloud`-suffixed model ids (e.g. `qwen3:cloud`)
  and proxies them to Ollama Cloud over `localhost:11434` — the daemon holds that auth, not us, and no
  vault entry exists for it. **Any model id ending `:cloud` requested through the `ollama` provider
  therefore still leaves the machine**, even though no key was ever stored, and D13's badge treats it
  as cloud, not local, for exactly that reason. `ollama-cloud` is the second, separate provider id:
  the direct API at `https://ollama.com/api`, authenticated with `Authorization: Bearer <key>`
  (https://docs.ollama.com/cloud), and its key **is** a vault entry like any other cloud provider —
  resolved and filtered the same way as `openai`/`anthropic`/`google`/`opencode` above. Ollama's
  documented free tier is monthly starter credits, starter models only, and **one concurrent request**
  (https://ollama.com/pricing) — the same constraint D14 cites as the reason Phase 0 avoids an extra
  LLM-mediated routing hop.
- Both Ollama entries sit in the same fallback array as the router-based providers: `ollama` is a
  model instance (no router id), `ollama-cloud` is a router-config entry (`{ id:
  'ollama-cloud/<model>', apiKey }`) like the others.

  ```ts
  // infrastructure/ai/models/resolveModelChain.ts — illustrative shape, not final code
  model: ({ requestContext }) =>
    requestContext.get('modelChain').map((entry) =>
      entry.providerId === 'ollama'
        ? { model: ollama(entry.modelId), maxRetries: 1 }
        : { model: { id: `${entry.providerId}/${entry.modelId}`, apiKey: entry.apiKey }, maxRetries: 2 },
    ),
  ```
- **A missing or unusable key removes the entry from the chain *before* Mastra sees it.** If the
  vault has no credential for a provider, or the vault is locked, that entry is filtered out. This
  matters: handing Mastra an entry with an empty `apiKey` produces a provider-side `401`, which is a
  non-retryable 4xx and therefore does **not** trigger fallback — the chain would abort instead of
  degrading. Ollama requires no key and so is never filtered.
- **Empty resolved chain → no model is called at all.** The run terminates immediately with
  `failed` / `NO_MODEL_AVAILABLE` (or `VAULT_LOCKED` when that is the reason), and the chat panel
  renders a call to action pointing at credential settings. There is no default cloud provider that
  quietly works without a key.
- **Every provider failed → `failed` / `ALL_PROVIDERS_FAILED`.** The audit row records the last
  provider error code. The stream never terminates with `done` on a partial or empty answer, and
  tokens already streamed are kept visible with the failure appended — silently discarding them
  would hide that a fallback was attempted.
- **AI providers enter the existing vault registry.** `VaultProvider` is widened with a
  discriminated `category: { kind: 'exchange' } | { kind: 'market-data' } | { kind: 'ai-model' }`
  so the credentials UI can group them and the advisor can enumerate only AI entries. No storage
  migration: `system_credentials.service_identifier` is already generic.

*Alternatives considered.* **Our own loop over single-model agents** — rejected: it reimplements
Mastra's retryable-error classification (429 vs 4xx) that we would then have to keep correct.
**Chain in `config/` or env** — rejected: not user-reorderable at runtime. **Silently skipping to the
next provider on a 401** — rejected as a design goal but achieved differently: filtering before the
call is deterministic, whereas relying on fallback-on-auth-error depends on vendor status codes.

### D4 — Audit-trail record: schema, home, and the privacy consequence

**Decided.** The audit trail lives in the **ledger SQLite**, as a new forward-only migration
`packages/database/migrations/sqlite/009_ai_advisor_runs.sql`, and it contains **no conversation
content whatsoever**.

```sql
CREATE TABLE IF NOT EXISTS ai_advisor_runs (
    id                TEXT PRIMARY KEY,
    thread_id         TEXT NOT NULL,
    started_at        TEXT NOT NULL,
    finished_at       TEXT,
    outcome           TEXT NOT NULL CHECK (outcome IN ('completed','refused','failed','aborted')),
    provider_id       TEXT,
    model_id          TEXT,
    tools_called      TEXT NOT NULL DEFAULT '[]',
    input_tokens      INTEGER,
    output_tokens     INTEGER,
    failure_code      TEXT,
    execution_profile TEXT NOT NULL CHECK (execution_profile IN ('local','metered','mixed')),
    steps_used        INTEGER,
    max_steps         INTEGER
) STRICT;
```

`009_ai_advisor_runs.sql` is not yet shipped (Phase 0 is pre-implementation), so `execution_profile`,
`steps_used`, and `max_steps` are added to **this migration's own definition**, not a follow-up
migration — there is nothing to alter yet. `execution_profile` is `NOT NULL` because D16 always
resolves one of the three values before a model is ever called; `steps_used`/`max_steps` are nullable
because a run that fails before any step executes (`NO_MODEL_AVAILABLE`, `VAULT_LOCKED`) never reaches
a step count. `execution_profile = 'mixed'` records that the resolved chain mixed local and metered
entries and therefore ran under D16's metered limits — distinct from a chain that was purely metered by
configuration, so an operator can tell the two apart in the audit trail.

- **Why not the advisor's own libsql store.** `ai-advisor.db` is declared disposable and
  re-creatable in the same sense DuckDB is — deleting it must be a safe, supported action. An audit
  trail that vanishes when you clear chat history is not an audit trail. It also keeps us off
  Mastra's observability schema, which is theirs to evolve.
- **Why no prompt/completion columns.** The trail answers "which model saw my portfolio, when,
  through which tools, at what token cost" — a provenance question. It does not need the text, and
  omitting the columns makes leaking it impossible rather than merely unlikely.
- **Retention / privacy consequence, stated plainly.** Conversation content (threads, messages,
  Mastra traces) exists **only** in `ai-advisor.db`; deleting that file erases all content and
  breaks nothing. Non-content metadata in `ai_advisor_runs` is append-only and persists across such
  a wipe, deliberately. Phase 0 ships no UI to purge `ai_advisor_runs`; a settings action for it is
  named in Open Questions.
- `outcome` plus nullable columns is a flag-shaped row, which is unavoidable in SQL. Rule 5 governs
  *types*: the domain `AdvisorRunReceipt` is a `kind` union, and the adapter projects it onto this
  row. The row is a projection, never the model the code reasons with.
- `tools_called` is a JSON array of `AdvisorToolName`, parsed back through `z.enum(ADVISOR_TOOL_NAMES)`.
- Because the runner is forward-only and a `CHECK` constraint cannot be `ALTER`ed, `009` is
  additive-only (a brand-new table, no modification to existing constraints) and ships with an
  integration test alongside the existing `migration_00N_*.spec.ts` files.

### D5 — Enforcing the token budget on tool results

**Decided, budgets now sourced from the resolved execution profile (D16), not a bare constant.**
"Compact pre-aggregated DTO" is enforced by three mechanisms in series, so it cannot degrade into an
intention:

1. **Narrow-by-construction `outputSchema`.** Every tool declares a Zod `outputSchema` that is
   fixed-arity and top-N truncated — e.g. the portfolio summary returns at most the top 15 (metered) or
   50 (local) holdings by value plus `omittedCount: z.number().int().nonnegative()`; the integrity tool
   returns per-flag counts and at most the top N defect groups, never per-transaction rows (the raw rows
   are reachable separately, page by page, through `fiscal_integrity_rows` — D16). Schemas use
   `.strict()`, so a future contributor widening the DTO gets a validation failure rather than a
   silently larger payload.
2. **A hard runtime gate.** `enforceBudget(payload, maxChars)` in
   `infrastructure/ai/tools/enforceBudget.ts` measures `JSON.stringify(payload).length` against a
   per-tool character budget and, when exceeded, returns a `{ kind: 'truncated', … }` result naming
   what was dropped — never the oversized payload. Characters, not tokens, on purpose: deterministic,
   no tokenizer dependency, no per-provider variance. The ~4-chars-per-token ratio is used only to
   pick the constants. **`maxChars` is no longer a bare constant: it is `resolveBudget(toolName,
   executionProfile)` (D16)** — the metered column of D16's per-tool budget table for a metered
   profile, or a value derived from the resolved chain entry's declared `contextWindow` for a local
   profile. `enforceBudget` itself is unchanged; only what calls it with which number changed.
3. **Tests measured against real data, not fixtures alone.** Per working-method rule 5, the budget
   tests use worst-case shapes derived from the real ledger (a 40-asset portfolio; an integrity
   report exercising every `FIFO_QUALITY_FLAG`), because a hand-written fixture will always fit.

Mastra's token-limiting output processor (published as `TokenLimiterProcessor`; its export name is
re-verified in task 1.5, as the current processor reference page no longer lists it) is explicitly
**not** the mechanism here — it bounds the model's
*output*, not tool results. Noted so nobody later mistakes one for the other.

### D6 — Rule 1: does Mastra force an `any`?

**Decided, with the escape hatch named.** Checked against Mastra's published type reference (the
packages are not yet installed, so this is re-verified as the first implementation task):

- `Processor<TId extends string = string, TTripwireMetadata = unknown>` — generics are defaulted and
  bounded; `abort: (reason?: string, options?: { retry?: boolean; metadata?: unknown }) => never`.
  `unknown`, not `any`. The disclaimer and grounding-detector output processors (D15) are clean.
- `createTool` infers its generics from the Zod `inputSchema` / `outputSchema`, and `execute`
  receives the validated input plus a typed context (`requestContext`, `abortSignal`, …). Clean, on
  the condition that **both** schemas are always supplied — omitting `outputSchema` is what
  collapses the result type and invites a cast. Both are mandatory here anyway (D5).
- `Agent.stream(messages, options?: AgentExecutionOptions<Output, Format>)` returns
  `MastraModelOutput<Output>`, whose `fullStream` yields `ChunkType` — a large union discriminated
  on `type`, including `text-delta`, `tool-call`, `tool-result`, `tool-error`, `tripwire`, `error`,
  `abort`, `finish`, and many more.

Two real risks and their resolutions:

- **Loose chunk payloads.** `tool-call.args`, `tool-result.result`, and `raw` are inherently
  provider-shaped JSON. Where a payload is not usefully typed, the adapter treats it as `unknown`
  and parses it with a local Zod schema, or reads it through a **narrow locally-declared interface**
  in `infrastructure/ai/mastraChunk.ts` describing only the fields we consume. Never `any`, never
  `as any`, never `as never`.
- **The switch over `ChunkType` is intentionally non-exhaustive.** We map only the eight kinds above
  and `default:` ignores the rest. An exhaustive `never` check would break on every Mastra minor
  release that adds a chunk type — that is a version-coupling bug disguised as type rigour.

Enforcement: the verification grep for this change runs
`: any|as any|<any>|, any>|as never` over the AI subtree and the adapter (note `, any>` — the
`Record<string, any>` case the narrower pattern misses), and zero hits is an acceptance criterion,
not a review discovery.

**One further concrete risk to record: the zod version.** The workspace catalog pins
`zod@^3.25.76` (resolved `3.25.76`, which does ship the `zod/v4` subpath), and `zod@4.4.3` is
already present transitively. Mastra 1.x tooling is compiled against a specific zod schema
identity, and a v3-vs-v4 mismatch surfaces as
`Type 'ZodObject<…>' is not assignable to …` on `inputSchema` — historically the single most common
reason a developer reaches for `as any` in this exact integration. Mitigation: keep every schema in
the AI subtree importing from one zod entrypoint, run `pnpm typecheck` immediately after install
before any other work, and if a mismatch appears, align the catalog version rather than cast.

### D7 — Where the Zod DTO boundary sits, and what is validated

**Decided.** `apps/backend/src/core/infrastructure/dtos/advisor.ts`, following the existing
convention (private nested schemas, exported top-level schema plus `z.infer` type, `z.enum` over
shared const tuples). There are **two** boundaries, not one, because the model is also untrusted
input.

Boundary A — HTTP:

- Inbound `askAdvisorRequestSchema`: `{ message: z.string().min(1).max(4000), threadId: z.string().uuid().optional() }`,
  applied with `zValidator('json', …)`. The length cap is a boundary guard against unbounded input,
  not a prompt-engineering rule.
- Inbound `modelChainSchema` for the config route: an array of
  `{ providerId: z.enum(AI_PROVIDER_IDS), modelId: z.string().min(1) }`, non-empty, so an unknown
  provider id cannot reach the adapter.
- **`AI_PROVIDER_IDS` is defined here, once**, in `packages/shared-types/src/advisor-stream.ts`
  beside the other advisor vocabularies, because both the backend routes and the frontend config UI
  consume it. Phase 0's closed set is
  `['openai', 'anthropic', 'google', 'opencode', 'ollama', 'ollama-cloud'] as const` (six ids, per the
  provider split in D3), and the same six ids are the
  `category: { kind: 'ai-model' }` entries added to the vault registry, so a provider cannot exist in
  the chain schema and be absent from the registry. `modelId` stays a free `string`: provider model
  catalogues change weekly and pinning them in a tuple would make every new model a code change —
  the wrong end of rule 8's "change the call site" trade.
- Outbound `advisorConfigSchema`: the chain plus, per provider, a discriminated credential state
  `{ kind: 'present' } | { kind: 'absent' } | { kind: 'locked' }` — not `hasKey: boolean` with an
  optional detail (rule 5).
- Outbound `advisorAnswerSchema` for the non-streaming ask route (D12): the drained run as
  `{ text, receipt, outcome }` under the same discriminated shape as the terminal event, so the two
  routes cannot disagree about what a finished run is.
- Outbound stream: every frame `advisorStreamEventSchema.parse(...)`d before `writeSSE` and
  `parseOrFail`d on the frontend (D1). This is the *only* thing standing in for RPC typing on the
  SSE channel, which is why it is validated on both ends rather than one.

Boundary B — the LLM:

Each tool's `inputSchema` is an anti-corruption layer between the model and our use cases. A symbol
argument is `z.string().regex(…)`-validated before it can reach `GetTokenHistoryUseCase`; an
`accountId` is parsed to its branded type. The model cannot hand a use case an unvalidated value,
and `outputSchema` bounds what flows back (D5).

### D9 — Ranking holdings by value without arithmetic in the AI layer

**Decided.** The `holdings` array arrives unordered and `current_value_fiat` is optional, so "the top
15 holdings by value" is a ranking somebody must actually perform. Three constraints collide: the AI
subtree may not do arithmetic on money and may not import `decimal.js`; the tools must not be
allowed to invent a figure; and an absent or unconvertible value is a third state, not a zero.

**A pure domain service does the ranking, and it lives in `packages/core-domain`:**

```ts
// packages/core-domain/src/domain/services/holdingRanking.ts
export function rankHoldingsByValue<T>(
  holdings: readonly T[],
  valueOf: (h: T) => string | undefined,
  topN: number,
): HoldingRanking<T>;

export type HoldingRanking<T> = {
  ranked: readonly T[];      // at most topN, descending by value
  omittedCount: number;      // valued holdings that did not make the cut
  unvalued: readonly T[];    // no resolved value — never ranked, never treated as 0
};
```

- It compares through `Money`, which already wraps `decimal.js` privately — that is precisely what
  the value object exists for (rule 4). It uses the existing `Money.compareTo(other): -1 | 0 | 1`;
  **no new method is added to `Money`**, so the tax path's value object is untouched.
  `core-domain/domain/services/` importing a sibling value object is not an external import; the
  convention there is already "internal only", and no `decimal.js` import appears in the service.
- **The AI subtree stays literally arithmetic-free**: the tool calls `rankHoldingsByValue`, receives
  three lists, and projects them. It performs no comparison, no sort, and no `Number(...)`.
- **`unvalued` is a first-class output, not a filtered-away remainder.** A holding whose
  `current_value_fiat` is absent, or whose `cost_basis` is `UNCONVERTIBLE`, appears in the tool result
  as an explicitly unvalued entry. `null >= 0` being `true` in JavaScript is a bug this project has
  already shipped once; a comparator that silently sorted absent values as zero would reintroduce it
  in the one place where the consumer is a model that will then state the wrong figure confidently.
- **The incompleteness signals travel with the figures.** The tool result carries
  `ratesIncomplete` and `pricesIncomplete` straight from `PortfolioSummaryMetricsDto`, plus
  `unvaluedCount`. The agent's instructions require that an incomplete total be reported as
  incomplete. Dropping flags the use case already computed would let the advisor present a partial
  total as authoritative — the failure mode that matters most for a tax tool.

*Alternatives considered.* **An `ORDER BY` in the holdings query** — rejected: it changes an existing
capability and a query the frontend already consumes, for the benefit of one new caller.
**Sorting inside the tool with `decimal.js`** — rejected: it puts money arithmetic in the AI subtree,
the one place this change forbids it. **No ranking at all** — rejected: `enforceBudget` would then
truncate arbitrarily, and "which positions matter" is exactly what the model needs.

### D10 — Conversation memory

**Decided.** Phase 0 is multi-turn, because a chat panel that forgets the previous message is not a
walking skeleton of a chat. `threadId` in `askAdvisorRequestSchema` therefore has real meaning.

- Mastra `Memory` (from `@mastra/memory`) is configured on
  `new LibSQLStore({ id: 'ai-advisor', url: 'file:<dataDir>/ai-advisor.db' })` — `id` is part of the
  current constructor, not only `url` — with `lastMessages` bounded **from the resolved execution
  profile (D16): 20 for metered, 50 for local, both user-editable up to the schema's ceiling of 200** —
  `workingMemory` off, and **observational memory and semantic recall both off** — the latter would
  pull in an embedding model and a vector store, which the proposal puts out of scope.
- `resource` is the constant `'local'` (single-user self-hosted, per the Non-Goals). `thread` is the
  request's `threadId`; when absent the adapter creates one and the first `token` frame's run is
  reported with that id in the terminal event, so the client can continue the thread.
- **Memory does hold figures; the privacy line is content vs. provenance, not figures vs.
  no figures.** Mastra `Memory` persists
  `tool-call`/`tool-result` messages by default, and those results carry the exact monetary strings
  the tools returned; the assistant's own text also echoes figures verbatim (per the agent spec's
  "echo verbatim" instruction). `ai-advisor.db` **does** contain figures, in both the tool-result JSON
  and the rendered prose, for as long as a thread exists. The line D4 actually draws is **content vs.
  provenance**: `ai-advisor.db` is the disposable store of *what was said*, including every figure
  restated inside it; `ai_advisor_runs` is the durable store of *that a run happened* — model, tools,
  token counts — and holds no content, no figure, and no prose, ever. Deleting `ai-advisor.db` wipes
  every figure that ever appeared in a conversation along with the rest of it; `ai_advisor_runs` is
  unaffected and still has no content. See D14 for what is persisted vs. replayed on a later turn
  (`ToolCallFilter` filters recall, never storage) — the disposability guarantee in D4 still holds
  because nothing survives outside `ai-advisor.db`, not because nothing was written to it.
- **No telemetry leaves the machine.** Mastra tracing is either not configured or set to its
  never-sample strategy, and no exporter is registered — exporters are opt-in. For a privacy-first
  tax tool, a default that ships prompts to a hosted observability backend is not acceptable, and
  the audit need is already met by `ai_advisor_runs` (D4).
- The disposability guarantee is unchanged and now has teeth: deleting `ai-advisor.db` erases every
  thread and message, leaves `ai_advisor_runs` intact, and breaks nothing.

*Alternatives considered.* **Dropping `threadId` from Phase 0** — rejected: it would have to come
back in the next phase together with a wire-contract migration, and the panel would be a
one-shot question box. **Observational memory on** — rejected for Phase 0: it introduces a second
background model call per run, which is cost and latency before any evidence it is needed.

### D11 — The frontend stream lives behind a port, like every other transport here

**Decided.** The transport belongs in the adapter, not the composable. The existing precedent in
this repository is unambiguous: `IMarketDataPort.subscribeToStream` declares streaming **in the
frontend domain port**, `BffMarketDataAdapter` owns the connection and reports validation failures to
the `errorBus`, and the composable only holds reactive state.

```ts
// apps/frontend/src/core/domain/ports/IAdvisorPort.ts
export interface IAdvisorPort {
  ask(request: AskAdvisorRequest, signal: AbortSignal): AsyncIterable<AdvisorStreamEvent>;
  getConfig(): Promise<AdvisorConfig>;
  setModelChain(chain: ModelChain): Promise<void>;
}
```

- `RestAdvisorAdapter` owns the `fetch` POST, the `ReadableStream` reader, the SSE frame parser
  (including ignoring `:` comment lines), and `parseOrFail` through `advisorStreamEventSchema`. A
  frame that fails validation is reported to the `errorBus` — the same controlled-error path every
  other `Rest*Adapter` uses — and surfaces as an error state, never as a token.
- The composable `useAdvisorChat` consumes that `AsyncIterable`, appends tokens to reactive state,
  keeps the per-`callId` tool-activity map, owns the `AbortController`, and synthesizes
  `transport-lost` when iteration ends with no terminal event. It contains no `fetch`, no parsing,
  and no knowledge of SSE.
- `AbortSignal` **is** in the frontend port, unlike the backend one (D2). The asymmetry is
  deliberate: the frontend port is consumed by UI code that holds the controller, and there is no
  `finally`-in-a-generator on this side to hook cleanup onto.
- The advisor config stays on Pinia Colada through the same port, as non-streaming server state.
- Rejecting `EventSource` (D1) is a decision about *which API*, not about *where* it lives; the
  market-data adapter uses `EventSource` because a GET stream can, and this one cannot.

*Alternatives considered.* **`fetch` and frame parsing inside the composable** — rejected: it puts
raw transport and wire-format parsing in the UI layer, bypasses the port the change already defines
for config, and would make this the only transport in the app not reachable through a port.

### D12 — The non-streaming ask route

**Decided.** Kept, and fully specified — a run that cannot be observed without an SSE client is
hard to script, hard to test from a shell, and hard to debug when the stream itself is suspect.

- The route drains `IAdvisorPort.ask(...)` to its terminal event and returns
  `advisorAnswerSchema`-validated JSON: `{ text, outcome, receipt }`, where `outcome` is the same
  `completed | refused | failed` discriminant as the terminal event and `text` is the concatenation of
  the `token` events. `refused` returns the reason and no text; `failed` returns the code and no text.
- **It shares the use case, not just the shape.** Both routes call `AskAdvisorUC`; the only
  difference is that one forwards events through `toWireEvent` and the other folds them. There is no
  second orchestration path that could drift.
- It has no cancellation semantics of its own: the client either receives the answer or the request
  fails. Cancellation is a streaming concern.
- Its audit row is written by the same `finally` as the streaming route, so a client that hangs up
  mid-request still produces an `aborted` row.

*Alternatives considered.* **Dropping it from Phase 0** — reasonable, and rejected only because the
cost is one folding function over an already-specified event stream, while the debugging value
during the first Mastra integration is highest exactly now.

### D13 — Visual design of the chat panel

**Decided.** The panel is designed, not assembled: it follows `DESIGN.md` literally and reuses the
techniques the app already uses, so it reads as part of the same institutional terminal as
`AppHeader.vue` rather than as an embedded third-party chat widget.

- **Shell.** A right-side sheet, 420px wide on desktop and full-width below `md`, mounted once in
  `apps/frontend/src/App.vue` next to `<AppHeader>` and `<Toaster>`. It is opened from an icon button
  in `AppHeader.vue` (`lucide-vue-next`, e.g. `Sparkles` or `MessageSquareText`), plus a keyboard
  shortcut, and it does not navigate. Surface `bg-surface`, a `border-border-soft` left edge, and
  `--shadow-modal` — the shadow `DESIGN.md` reserves for modals and drawers. The header strip copies
  `AppHeader`'s 56px (`h-14`) rhythm: title, the active model as a muted mono `Badge`, a
  new-conversation button, and close. Next to the model `Badge`, a second small `Badge` reads
  "cloud" or "local", driven by `classifyExecutionProfile` (D16) rather than restated ad hoc logic: a
  model id ending `:cloud`, or any provider other than `ollama`, renders "cloud"; a plain `ollama`
  provider with a non-`:cloud` model id renders "local" — the distinction D3 draws between the local
  daemon and Ollama Cloud (whether reached directly or proxied through a signed-in local daemon),
  surfaced where the user is about to send a message. A third, optional footer line — muted,
  `text-xs` mono, below the answer once a run's terminal event carries the receipt — shows
  `stepsUsed / maxSteps` from D16's resolved profile, so a user curious why a run stopped early (or
  never came close to the ceiling) has the number without opening the audit trail; it renders only
  once a receipt exists, never during streaming.
- **Primitives to add.** The repo has no `sheet`, `scroll-area` or `textarea` under
  `apps/frontend/src/components/ui/`. They are added through the shadcn-vue CLI, as the existing
  primitives were, and are the only new generic components. Everything specific to the advisor lives
  in a feature folder (`components/advisor/`, because it belongs to no single view).
- **Messages.** User turns are right-aligned on `bg-surface-3` with `rounded-xl`; assistant turns are
  full-width text on the surface, not bubbles, which keeps long answers readable. Body `text-sm`
  (13px) Inter, `--fg`; secondary information `--muted`.
- **Numbers are mono, including inside prose.** `DESIGN.md` allows no exception: numeric data is
  JetBrains Mono with `tabular-nums`. Streamed prose cannot be parsed back into figures reliably, so
  the instructions (agent spec) direct the model to wrap every figure it echoes from a tool result in
  inline code, and the renderer styles inline `code` as `font-mono tabular-nums` with no background
  pill. This also keeps the rule "the frontend formats, the model echoes the exact string" visible:
  the model never reformats a figure.
- **Markdown rendering is safe by construction.** Answers are rendered with `markdown-it` configured
  `html: false` (raw HTML is escaped, never injected), `linkify: false`, and links limited to
  in-app routes; no `v-html` of unsanitised output anywhere. Rendering is incremental on each token,
  throttled to one pass per animation frame.
- **Tool activity is a quiet status line, not a chat message.** Each `callId` renders a compact row
  above the answer — icon, the i18n name of the tool, and a state: a `Skeleton`-style shimmer while
  running, `--profit` check when finished, `--warning` for `tool-error`. Same shimmer the TaxReport
  tables use (`views/TaxReport/components/*`), so loading looks the same everywhere.
- **States map to semantic tokens, never to raw colours.**

  | State | Presentation |
  |---|---|
  | empty | three suggested first questions as outline buttons (e.g. "What should I review first?") |
  | streaming | blinking caret after the last token; Send becomes Stop |
  | `refused` | `Alert` on `--info-soft`: answer withheld, with the reason |
  | `failed` / `NO_MODEL_AVAILABLE`, `VAULT_LOCKED` | `Alert` on `--warning-soft` with a button to credential settings |
  | `failed` / other codes | `Alert` on `--loss-soft` with retry |
  | `transport-lost` | `--loss-soft` inline note under the partial answer, with retry |
  | user-aborted | partial answer kept, `--muted` "Stopped" label; no alert |
  | incomplete figures | `--warning` inline badge when a tool result carried `ratesIncomplete`/`pricesIncomplete` |

  `--brand` is used only for the Send button and focus rings, in line with the "saturated and
  resting" brand rule. `--profit`/`--loss` are never used to colour prose about gains or losses; the
  panel is not a P&L view.
- **Errors reach toasts through the existing bus.** Frame-validation failures go to `errorBus`, and
  `App.vue` already turns those into `vue-sonner` toasts with deduplicated ids; the panel shows the
  in-line state, the toast is not duplicated inside it.
- **Copy is i18n.** Every string, including suggested questions and tool names, goes through
  `useI18n()` with keys in `apps/frontend/src/i18n/dictionaries/`. The advisor answers in the Settings
  locale, which is the same value the dictionaries use.
- **Motion.** The sheet slides in with the same easing as the `page` transition in `App.vue`;
  `prefers-reduced-motion` disables the slide and the caret blink. Autoscroll follows the stream only
  while the user is at the bottom, so scrolling up to reread is never interrupted.
- **Accessibility.** The message list is `aria-live="polite"` with a debounced announcement per
  finished answer (not per token); Enter sends, Shift+Enter inserts a newline; focus returns to the
  trigger on close; Escape closes.

*Alternatives considered.* **A chat UI kit (e.g. Vercel AI Elements, `@ai-sdk/vue`)** — rejected:
it brings its own design language and the AI SDK wire protocol rejected in D1. **A floating
bubble in a corner** — rejected: it covers table content on dense views and reads as consumer
support chat, not a terminal. **A full route** — rejected: the value is asking about the view you are
on without leaving it.

### D14 — Agent topology and contract

**Decided.** The advisor is a supervisor `Agent` named `advisor`, declared with `agents: {
taxAnalyst, investmentAnalyst }` — Mastra's supervisor pattern, where sub-agents are exposed as tools
in the supervisor's own tool-call loop. Only `advisor` is constructed with `Memory` and only
`advisor` is reachable from `AskAdvisorUC`; a sub-agent is never invoked directly by the use case or
a route.

- **Phase 0**: `taxAnalyst` holds all thirteen read-only tools (`portfolio_summary`,
  `fiscal_integrity`, `token_history`, and the ten more listed in D16). `investmentAnalyst` is declared — its instructions and
  contract exist in `infrastructure/ai/agents/investmentAnalyst.ts` — but it holds no tools yet
  (Phase 1, D15) and it is **not passed into `advisor`'s `agents` map**, so it is not registered or
  reachable. Declaring it now without activating it means Phase 1 adds tools and one line of wiring,
  not a redesign.
- **Rejected: `.network()`.** Deprecated by Mastra
  (https://mastra.ai/docs/agents/networks, https://mastra.ai/reference/migrations/agentnetwork); the
  supervisor-agent pattern is the documented replacement.
- **Rejected: a single agent forever.** It cannot grow into a specialized investment-analysis role
  without either overloading one instructions string with two competing personas or a breaking
  contract change later; declaring the boundary now costs one unused agent file.
- **Deterministic delegation while only one sub-agent is active.** With exactly one active sub-agent,
  `advisor` calls `taxAnalyst` as a direct tool invocation, with no additional LLM routing decision in
  between — the supervisor's own instructions name the one available sub-agent and its scope, so
  choosing to delegate is part of the same generation that would otherwise have answered directly, not
  a second model call to pick among sub-agents. Justification: every LLM-mediated delegation hop
  doubles the number of model calls a run makes, and the Ollama Cloud free tier caps concurrency at
  **one request** (https://ollama.com/pricing) — a second concurrent or sequential routing call is not
  free capacity to spend by default. Once `investmentAnalyst` is registered in Phase 1, `advisor`'s
  instructions gain the two-way routing guidance its supervisor role already exists to make; this is
  additive, not a rewrite.
- **The Mastra import zone, updated from the single-file rule.** `MastraAdvisorAdapter.ts` remains the
  only file implementing `IAdvisorPort`, but agent, tool, and processor construction necessarily
  import `@mastra/core` types (`Agent`, `createTool`, `Processor`) to be assembled by the adapter. The
  rule is therefore: **`@mastra/*` may be imported only from `core/infrastructure/ai/**` and
  `MastraAdvisorAdapter.ts`** — one adapter file plus its own subtree, never from a domain,
  application, or route file. This supersedes every earlier statement of "only `MastraAdvisorAdapter.ts`
  imports `@mastra/*`" in `proposal.md` and the `ai-advisor-agent` spec; the grep in task 16.2 and the
  spec's "Single Mastra import site" scenario are both updated to assert that every import resolves to
  that zone, not to one literal path.

**Tool contracts** (model-facing; each tool declares both `inputSchema` and a `.strict()`
`outputSchema`, per D5/D6):

- **`portfolio_summary`** — description: *"Current holdings ranked by value, with incompleteness
  flags. Read-only; returns no more than the top 15 positions."* `inputSchema: z.object({ accountId:
  accountIdSchema.optional() }).strict()`. The model supplies **only** `accountId`; `targetCurrency`
  is resolved server-side from Settings' `base_currency` via `requestContext`, and `livePrices` is
  injected by the tool factory from the price port at call time — **neither is a model-suppliable
  parameter**, so the model cannot request a currency conversion or a price snapshot the system did
  not already resolve. Output: unchanged from D5/D9 — `ranked` (top 15), `omittedCount`, `unvalued`,
  `ratesIncomplete`, `pricesIncomplete`, `unvaluedCount`.
- **`fiscal_integrity`** — description: *"Data-quality flags on the fiscal ledger, grouped and
  counted. Read-only; returns no transaction-level rows."* `inputSchema: z.object({ accountId:
  accountIdSchema.optional() }).strict()`. Output per flag: `{ qualityFlag, severity, count,
  pendingReview }`, at most the top **10** groups by `count`; the use case's `rows:
  FifoDataQualityRow[]` field is **always dropped** at the tool boundary — it never reaches the model,
  regardless of size.
- **`token_history`** — description: *"Lot-level summary for one asset symbol: acquisition lots and
  counts of history/relocation events. Read-only; returns no individual event."* `inputSchema:
  z.object({ symbol: z.string().regex(SYMBOL_REGEX), accountId: accountIdSchema.optional() }).strict()`.
  Output: at most the top **20** lots by acquisition date descending, each a lot summary carrying
  `PreciseAmount` strings plus **counts** of that lot's `history` events and `relocations` entries
  (never the events or relocation records themselves), and `omittedCount` for lots beyond 20.
- **`maxSteps` is set explicitly, from the resolved execution profile (D16), on every
  `advisor.stream(...)` / `.generate(...)` call** — not left to Mastra's de facto default and no
  longer a bare `5`: 5 for metered, 15 for local, both user-editable up to the schema's ceiling of 30
  — so the run's step budget is a contract this change owns rather than an implicit library default
  that could silently change between versions.
- **The full read-only tool catalogue is ten more tools beyond the three above — thirteen total, all
  on `taxAnalyst` in Phase 0** — `asset_allocation`, `risk_metrics`, `drawdown_curve`,
  `performance_history`, `kpis`, `volatility_heatmap`, `spanish_tax_report`, `live_prices`,
  `fiscal_integrity_rows`, and `token_lots`. Their contracts, budgets, and the use cases they wrap are
  specified in full in D16, which also names the one real-type surprise the catalogue's Context
  measurement turned up: six of the ten (every metrics/report use case except
  `GetSpanishTaxReportUseCase`) accept no `accountId` at all.

**Instructions template** (stable prefix / volatile suffix split, per the existing "Dynamic
Instructions" requirement):

```
Role & scope: You are a portfolio and tax analyst for the user's own local, self-hosted ledger.
You answer questions about the user's holdings, fiscal data quality, and per-asset history.

Data rules:
- You never produce or compute a figure. Every number you state must come verbatim from a tool
  result in the current turn.
- Echo every figure exactly as returned, wrapped in inline code, without rounding or reformatting.
- Figures mentioned in earlier turns may be stale — re-query the relevant tool before restating one.
- When a tool result reports an incomplete total, say so; never present a partial total as final.

Tool usage guide:
- Use portfolio_summary for "what do I hold", "what's my biggest position", or overall value questions.
- Use fiscal_integrity for data-quality, review, or "what needs my attention" questions; use
  fiscal_integrity_rows only when the user asks to see the underlying flagged transactions.
- Use token_history for questions about one specific asset's lots or history; use token_lots only when
  the user asks to see lots beyond the top 20.
- Use asset_allocation, risk_metrics, kpis, drawdown_curve, performance_history, and volatility_heatmap
  for portfolio-wide analytics questions; use spanish_tax_report for a specific tax year's IRPF figures.
- Use live_prices for a current-price question that does not need a full portfolio summary.

Incompleteness caveat: if a tool result is truncated or a total is incomplete, state that plainly
before answering.

Response format: concise, Markdown, headings optional, answer in {{locale}}.
```

- **Stable prefix**: role & scope, data rules, tool usage guide, incompleteness caveat, and the
  response-format instruction minus the locale value — byte-identical across requests (the existing
  "Locale changes only the volatile suffix" requirement is unchanged).
- **Volatile section**: locale and base currency only, substituted at the end, per the existing
  "Dynamic Instructions From Request Context" requirement (unchanged — no verbosity input in this
  phase).
- **Sub-agent instructions are scoped per role**: `taxAnalyst`'s instructions restate only the
  tax/fiscal-quality/portfolio-metrics scope and its thirteen tools (D16); `investmentAnalyst`'s
  (declared, inactive in Phase 0) restate only the investment-analysis scope it will hold once Phase 1
  tools exist.

**Capability matrix:**

| Capability | `advisor` (supervisor) | `taxAnalyst` | `investmentAnalyst` |
|---|---|---|---|
| Talks to the user | yes | no (tool-invoked only) | no (tool-invoked only) |
| Owns memory / thread | yes | no | no |
| Phase 0: registered/active | yes | yes | **no** — declared, not wired |
| Phase 0: tools | none of its own; delegates | all 13 read-only tools (D16): `portfolio_summary`, `fiscal_integrity`, `token_history`, `asset_allocation`, `risk_metrics`, `drawdown_curve`, `performance_history`, `kpis`, `volatility_heatmap`, `spanish_tax_report`, `live_prices`, `fiscal_integrity_rows`, `token_lots` | none |
| Phase 1: tools | none of its own; delegates | unchanged | `price_forecast`, `allocation_model`, `market_indicators` (D15, partly built on D16's tools — see D16) |
| Can write/mutate | no | no | no |
| Can compute a figure | no | no | no (Phase 1 tools are deterministic; see D15) |

**Message roles and persistence.** Roles are `system` (the instructions above), `user`, `assistant`,
and `tool` (tool-call/tool-result pairs). Mastra `Memory` persists **all four** by default, including
tool-call/tool-result messages, and replays prior-turn messages via `lastMessages` on the next run.
What is **replayed** to the model on a later turn is narrower than what is **persisted**:

- `user` and `assistant` text messages from prior turns are always replayed.
- Prior-turn tool-call/tool-result messages are filtered at recall time by `ToolCallFilter` (from
  `@mastra/core/processors`, attached as an agent `inputProcessor`) with `{ exclude: ['tool-call',
  'tool-result'], filterAfterToolSteps: true, preserveModelOutput: true }` — filtering happens **only
  at recall**, never at storage, so the full record (needed for D4's audit trail and for debugging)
  stays in `ai-advisor.db` regardless of what a later turn sees.
- `preserveModelOutput: true` is required: it keeps the model's own textual summary of a tool result
  (the assistant message that followed the tool call) even while the raw tool-call/tool-result pair is
  filtered — otherwise a follow-up turn would lose the model's own prior conclusion, not just the raw
  JSON.
- **Current-turn** tool-call/tool-result messages — the ones the model just produced in the run now
  executing — are never subject to `ToolCallFilter`, because the filter operates on recalled history,
  not on the in-flight step sequence; they must reach later steps of the *same* run (e.g. a step that
  reasons about a tool result two steps prior) or the agent could not use its own tool output.
- If `TokenLimiter` is also configured, it is **last** in the `inputProcessors` array (per its
  documented ordering requirement), so it trims an already-filtered history rather than filtering an
  already-trimmed one.
- **A test must prove current-turn multi-step tool results are not stripped**: a scripted run that
  calls a tool, then in a later step of the *same* run references that tool's result, must succeed —
  i.e. `ToolCallFilter` must be observed to affect only *replayed prior-turn* history, never the
  in-flight step sequence.

This corrects earlier claims in D10 (below) that memory holds no figures.

*Alternatives considered.* **A second LLM call purely to route between sub-agents, even with one
active** — rejected: no decision to make with one candidate, and it burns the one concurrent slot
Ollama Cloud's free tier allows. **Flattening `taxAnalyst`'s tools directly onto `advisor` instead of
a sub-agent** — rejected: it would need to be undone the moment `investmentAnalyst` activates, since
tool-vs-tool ambiguity across two domains is exactly what the supervisor pattern exists to avoid.

### D15 — Investment analysis and the guardrail policy

**Decided, replacing the Phase 0 "not financial advice = refuse" framing.** Earlier drafts of this
document (and the `ai-advisor-agent` spec's guardrail requirement, and tasks 9.x) treated any
investment-adjacent question as something the advisor must refuse, with a disclaimer standing in for
an answer. That framing is withdrawn: the user, running this tool locally on their own data, decides
they want price forecasts, allocation guidance, and market-timing commentary from their own advisor —
not a refusal. The guardrail's job changes from "block investment topics" to "ground every investment
claim in a tool result, and disclose plainly that it is not financial advice."

- **The advisor MAY give price forecasts, professional-style asset allocations, and market-timing
  commentary, always with a structural "not financial advice" disclaimer** — structural meaning
  appended by an output processor (Phase 0) and rendered by the UI as a distinct footer (chat spec,
  D13), never a sentence the model must remember to write.
- **Grounding rule.** Every forecast, allocation, or timing statement must cite a tool result produced
  in the **current turn**. Figures are never LLM-authored — the "LLM never produces a number"
  invariant from `proposal.md`/the agent spec is unchanged and now explicitly covers investment claims,
  not only portfolio/fiscal figures. This is enforced the same way D9 enforces it for money: the
  numbers come from a tool, the model states them, and a deterministic check (below) rejects
  ungrounded prose.
- **Phase 1 tools for `investmentAnalyst`** (declared now per D14, implemented later; named here so
  the contract is fixed before the tools exist):
  - **`price_forecast`** — returns a forecast **plus its own measured backtest hit rate and sample
    size**, computed over the user's own historical price data, never the model's stated confidence.
  - **`allocation_model`** — deterministic; applies reference allocation profiles (`conservative`,
    `balanced`, `aggressive`) and concentration limits to the user's real portfolio snapshot. No
    LLM-authored percentage.
  - **`market_indicators`** — moving averages, RSI, drawdown-from-ATH, and volatility, computed in
    DuckDB/`core-domain` — the same "no arithmetic in the AI layer" boundary D9 draws for money applies
    here to indicator math.
- **The forecast criterion is a measurable, user-owned setting, not a model-stated confidence.** Two
  new `user_settings` keys: `ai_advisor_forecast_min_hit_rate` (decimal string, default `"0.90"`,
  range `0.50`–`0.99`) and `ai_advisor_forecast_min_samples` (integer, default `30`). `price_forecast`
  presents its forecast **only if** the tool's measured backtest hit rate is `>=` the configured
  threshold **and** the sample size is `>=` the configured minimum; otherwise it returns "no reliable
  signal" and **still reports** the measured hit rate and sample size, so the user can see how close
  the signal came. **Hit rate and sample size are always displayed alongside any forecast that is
  shown**, not only in the rejected case.
  - **Why an LLM-stated confidence is rejected, not merely disfavored:** an LLM's self-reported
    confidence is uncalibrated — nothing enforces that a model saying "I'm 90% confident" corresponds
    to a 90% historical hit rate — and accepting it would violate the same "the LLM never produces a
    number" invariant that already governs every other figure in this system. The threshold must be a
    number a deterministic backtest computed, or it is not a number the system can defend.
  - **Phasing.** The Settings UI control for these two keys is **Phase 1**, delivered together with
    `price_forecast`. Phase 0 only **reserves the two setting keys in this document** — no migration,
    no route, no UI exists yet for them in Phase 0; stated explicitly so a reader does not go looking
    for a Phase 0 settings screen that does not exist.
- **Guardrail layers, all prepared now, phased in activation:**
  - **Phase 0:**
    (a) **Instructions** — the stable prefix (D14) states the grounding rule and the disclaimer
    requirement in prose, as the first, weakest layer.
    (b) **A deterministic `processOutputStream` grounding/directive-pattern detector**, in Spanish and
    English, that scans the model's output for (i) an investment claim (forecast, allocation, or
    timing language) with no corresponding tool call in the current run, or (ii) a directive-injection
    pattern (the user or the model's own output instructing the system to ignore its guardrail or
    disclaimer). On a match it calls `abort(reason, { retry: true })` **once** — the agent regenerates
    with the detector's feedback — and if the regenerated output still matches, the run terminates
    `refused`. This reuses the same processor mechanism (D6's `Processor` type) as the earlier
    guardrail; it is a broader detection rule, not a new mechanism.
    (c) **A disclaimer output processor** that structurally appends the disclaimer to any answer whose
    content touches an investment category (forecast, allocation, or market-timing language, detected
    the same way as (b)), rendered by the UI as a **distinct footer** (chat spec) — never inline in the
    answer text, so it cannot be mistaken for the model's own words or omitted by a truncated render.
  - **Phase 1** (declared, not built): `ModerationProcessor` with a custom category classifier
    evaluated on the final result; `PromptInjectionDetector` evaluated on input; golden-question
    scorers over a fixed question set, extending the scorer mitigation `proposal.md` already names.
- **`refused` is kept for exactly two cases, both narrower than before:** an ungrounded
  forecast/allocation/timing claim that still fails grounding after the one retry, and any
  tax-evasion strategy request. **Tax-evasion requests are always refused, unconditionally** — the one
  category this design still treats as an absolute refusal rather than a groundable-or-not question,
  because there is no tool result that could ground "how do I hide gains from IRPF" into a legitimate
  answer.
- **Trade-offs, named rather than hidden:** the ES/EN pattern detector will have false positives (an
  answer using investment-sounding words with no actual claim) and can be evaded by paraphrase — it is
  a deterministic heuristic, not a classifier, and Phase 1's `ModerationProcessor`/scorers are the
  named mitigation. The one-retry-then-refuse path costs a second model call on every trip, and Phase
  1's additional classifier passes add latency; both are accepted for Phase 0 and deferred for tuning
  once real usage exists (mirroring the per-tool character-budget deferral already in Open Questions).

*Alternatives considered.* **Keep the blanket refusal** — rejected: the user explicitly decided this
local tool should answer investment questions rather than deflect them, and a self-hosted tax/portfolio
tool refusing to discuss the portfolio it already shows the user is a worse product than one that
answers with disclosed, grounded uncertainty. **Let the model self-report forecast confidence** —
rejected: uncalibrated, and exactly the category of number this project already forbids the LLM from
producing (D9's rule, restated above). **No numeric threshold, just "always disclose it's a
forecast"** — rejected: the user asked for a measurable criterion, and an undisclosed-accuracy
forecast shown regardless of its historical hit rate is worse than one gated on a number the user
configured.

### D16 — Execution profiles: local vs metered, and the full read-only tool catalogue

**Decided.** Fixed per-tool budgets and a fixed step count are only correct for a cloud model, where every token costs money and the constants exist to
bound spend. A local Ollama model costs no money per token; its real ceiling is the **declared context
window** and generation speed. Treating both cases with one constant either wastes a local model's
actual headroom or risks silently overflowing a small cloud context. This decision makes the limits a
function of *which kind of model answered*, not a global constant, and — because the tool catalogue
that draws on `apps/backend`'s six other read-only use cases (measured in the Context section below) is
what actually needs budgeting — settles that catalogue here too.

**Classification is derived, never user-toggled.** Each resolved model-chain entry has an execution
profile, a `kind` union computed by a pure function, never a field the user sets directly on the entry:

```ts
// packages/shared-types/src/advisor-stream.ts
export type ExecutionProfileKind = 'local' | 'metered';

export function classifyExecutionProfile(entry: ModelChainEntry): ExecutionProfileKind {
  return entry.providerId === 'ollama' && !entry.modelId.endsWith(':cloud') ? 'local' : 'metered';
}
```

Every other case is `metered`: `openai`, `anthropic`, `google`, `opencode`, `ollama-cloud`, and — the
one easy-to-miss case — an `ollama` entry whose `modelId` ends `:cloud`, because D3 already established
that such a request leaves the machine and is proxied to Ollama Cloud even though no vault credential
exists for it. A user cannot label a cloud model "local": there is no boolean or enum field on the
chain entry to flip, only the derived function.

**`contextWindow` becomes part of the model-chain entry shape, but only for local entries.** D3's
`modelChainSchema` entry (`{ providerId, modelId }`) is widened to a content-discriminated union rather
than an optional field, per rule 5 — an optional `contextWindow` present-or-absent on every entry would
be exactly the boolean-plus-optional-payload shape rule 5 forbids:

```ts
const localOllamaEntrySchema = z.object({
  providerId: z.literal('ollama'),
  modelId: z.string().min(1).refine((id) => !id.endsWith(':cloud'), 'cloud models use the metered shape'),
  contextWindow: z.number().int().positive(),
}).strict();

const meteredEntrySchema = z.object({
  providerId: z.enum(AI_PROVIDER_IDS),
  modelId: z.string().min(1),
}).strict(); // includes plain `ollama` (no :cloud suffix is impossible here — that shape matches localOllamaEntrySchema first) and `ollama` with a `:cloud` id

export const modelChainEntrySchema = z.union([localOllamaEntrySchema, meteredEntrySchema]);
```

A local entry with no `contextWindow`, or a metered entry carrying one, is rejected by `.strict()` —
the field's presence is exactly the discriminant, so there is no separate boolean to drift from it. An
`ollama` entry whose `modelId` ends `:cloud` fails `localOllamaEntrySchema`'s refinement and is
validated as a metered entry instead, matching `classifyExecutionProfile`. `contextWindow` is passed to
Ollama as `num_ctx`, nested under `options`, per the installed `ollama-ai-provider-v2@4.0.1` types
(confirmed at task 1.5, superseding the "re-verify" note in the original D3/D6 text — the exact call
shape is `providerOptions: { ollama: { options: { num_ctx: entry.contextWindow } } }`, passed through
Vercel AI SDK's per-call `providerOptions`, not a top-level provider constructor option).

**Limits, per profile, user-editable in Settings, with hard ceilings the schema enforces:**

| Field | Metered default | Local default | Hard ceiling |
|---|---|---|---|
| `maxSteps` | 5 | 15 | 30 |
| `lastMessages` | 20 | 50 | 200 |
| `topNHoldings` (portfolio_summary, asset_allocation) | 15 | 50 | — (bounded by `pageSize` ceilings below) |
| `lotsPageSize` (token_history top-N, token_lots page) | 20 | 100 | 200 |
| `rowsPageSize` (fiscal_integrity groups, fiscal_integrity_rows page) | 25 | 100 | 200 |

The ceilings exist to bound a runaway loop or an accidental page-size typo, never to bound cost — a
local model has no per-token cost to bound. They are enforced by `executionProfilesSchema` (new,
`packages/shared-types/src/advisor-stream.ts`), which validates the `user_settings` key
`ai_advisor_execution_profiles`: a JSON object `{ metered: ExecutionProfileSettings, local:
ExecutionProfileSettings }`, code-supplied defaults above when the key is unset. Settings, not a
constant, for the same reason D3 put the model chain in `user_settings`: the user must be able to
change limits at runtime.

**Per-tool character budgets: explicit and editable for metered, derived for local.** The metered
column keeps D5's three original constants and adds one for each new tool, chosen conservatively from
each tool's fixed-arity shape:

| Tool | Metered budget (chars) |
|---|---|
| `portfolio_summary` | 4000 (unchanged, D5) |
| `fiscal_integrity` | 6000 (unchanged, D5) |
| `token_history` | 6000 (unchanged, D5) |
| `asset_allocation` | 3000 |
| `risk_metrics` | 1500 |
| `drawdown_curve` | 4000 |
| `performance_history` | 4000 |
| `kpis` | 3000 |
| `volatility_heatmap` | 4000 |
| `spanish_tax_report` | 5000 |
| `live_prices` | 2000 |
| `fiscal_integrity_rows` | 4000 |
| `token_lots` | 4000 |

These are user-editable per-tool overrides on the `metered` profile (with the table above as the code
default), stored in the same `executionProfilesSchema` document.

**Local per-tool budgets are never stored — they are derived at request time from the resolved
entry's `contextWindow`**, because the real constraint (context window) already varies per model and
storing a second, independently-editable number for it would let the two drift:

```
perToolBudgetChars = floor(contextWindow * 4 * TOOL_SHARE)       // TOOL_SHARE = 0.15
runBudgetChars     = floor(contextWindow * 4 * RUN_SHARE)        // RUN_SHARE  = 0.6, summed across one run's tool results
```

`4` is the same chars-per-token approximation D5 already uses to size its constants — deterministic,
no tokenizer dependency. `TOOL_SHARE = 0.15` reserves 15% of the context window per tool result, so a
single run can afford four tool calls at full budget before the run-wide `0.6` cap starts trimming
later ones; both fractions are fixed constants in code, not user-editable (the user edits
`contextWindow` per chain entry instead, which is the actual lever). On a local profile, when the
running total of tool-result characters in the current run would exceed `runBudgetChars`,
`enforceBudget` truncates the same way D5 already defines — deterministically, never by silently
dropping the check. This is a **degrade**, not a hard stop: unlike a metered overflow (which risks a
paid, wasted call), a local overflow only costs the user their own machine's time, so the tool still
returns a `{ kind: 'truncated', … }` result and the run continues.

**Resolution happens per request, from the resolved chain, with a stated rule for a mixed chain.** The
limits used for one run come from the model chain resolved for that request (D3) — not from whichever
entry Mastra's fallback eventually lands on, because the limits must be fixed before the first model
call, not renegotiated mid-run. **When every entry in the resolved chain is local, the run uses the
local profile.** **When the resolved chain mixes local and metered entries, or is all-metered, the run
uses the metered profile.** This is stated as "use metered" rather than "take the per-field minimum"
because it is the same rule in this design: every metered default is numerically ≤ the corresponding
local default and every metered per-tool budget is ≤ any local budget derived from a realistic
context window, so computing a per-field minimum across a mixed chain and simply selecting the metered
profile produce identical numbers today. The per-field-minimum framing is recorded here because it is
the invariant that must keep holding if a future edit ever made a local field smaller than its metered
counterpart — at that point the two mechanisms would diverge and the minimum must be taken explicitly,
not assumed. **Trade-off, named plainly: a mixed chain loses local generosity.** A user who wants the
higher local limits for every request must make the chain all-local (a chain of only `ollama` entries
with non-`:cloud` model ids); adding a single cloud fallback for reliability costs the run its local
headroom whenever that fallback might be used, because the limits are fixed before Mastra knows which
entry will actually answer.

**`execution_profile` is recorded on the audit row as a three-way value, not two.** D4's
`ai_advisor_runs.execution_profile` column (added below) is `CHECK (execution_profile IN ('local',
'metered', 'mixed'))`: `'local'` and `'metered'` when the resolved chain was uniform, `'mixed'` when the
chain mixed profiles and therefore ran under the metered limits per the rule above — recorded as its
own value rather than collapsed into `'metered'`, so an operator reviewing the audit trail can see that
the run's local headroom was sacrificed to a fallback entry, not that the user configured a purely
metered chain.

**Invariants unchanged across every profile** (restated so no reader mistakes a profile as relaxing
them): read-only, the model cannot supply `targetCurrency` or a live-price snapshot as tool input
(D14), `ToolCallFilter` still filters replayed history for staleness, not for cost, and the grounding
detector, disclaimer processor, and unconditional tax-evasion refusal (D15) apply identically regardless
of which profile resolved.

**The full read-only tool catalogue** (extends D14's three-tool Phase 0 list; all thirteen are
Phase 0, all sit on `taxAnalyst` — `investmentAnalyst` still holds none in Phase 0, per D14). Every
new tool wraps one already-existing, already-read-only backend use case
(`apps/backend/src/core/application/use-cases/`), measured directly against the installed source
rather than assumed (working-method rule 5):

| Tool | Wraps | Real request shape (measured) | Real response shape (measured) | Model-facing `inputSchema` | Output summary | Budget note |
|---|---|---|---|---|---|---|
| `asset_allocation` | `GetAssetAllocationUseCase.execute(targetCurrency?)` | no `accountId` parameter exists on this use case | `AssetAllocationItem[]` — `{ assetId, symbol, color?, allocationPct, valueFiat, currency }`, plain strings, unordered | `z.object({}).strict()` — `targetCurrency` resolved server-side, same as `portfolio_summary` | Ranked via `rankHoldingsByValue` (D9) on `valueFiat`, top `topNHoldings`, `omittedCount`, `unvalued` | See table above |
| `risk_metrics` | `GetRiskMetricsUseCase.execute(targetCurrency?)` | no `accountId` parameter | `RiskMetrics` — `{ maxDrawdownPct, annualizedVolatility, sharpeRatio, alpha, beta, currency }`, fixed shape, plain strings | `z.object({}).strict()` | The fixed shape, `preciseAmountSchema`-validated field by field; `enforceBudget` is a safety net, not expected to trigger | See table above |
| `drawdown_curve` | `GetDrawdownCurveUseCase.execute(days?, targetCurrency?)` | no `accountId` | `DrawdownPoint[]` — `{ date, drawdownPct }` | `z.object({ days: z.number().int().positive().max(3650).optional() }).strict()` | Downsampled by `downsampleSeries` (below) to at most **120** points, `omittedCount` | See table above |
| `performance_history` | `GetPerformanceHistoryUseCase.execute(days?, targetCurrency?)` | no `accountId` | `PerformanceHistoryPoint[]` — `{ date, portfolioValue, btcValue?, drawdownPct }` | `z.object({ days: z.number().int().positive().max(3650).optional() }).strict()` | Downsampled to at most **120** points, `omittedCount` | See table above |
| `kpis` | `GetKpisUseCase.execute(targetCurrency?)` | no `accountId`; this use case exists only to host `ensureFresh()` (its own doc comment) | `MetricsKpis` — a large fixed-shape DTO (`totalEquity`, `totalRealizedPnl`, `sharpeRatio`, `bestAsset`/`worstAsset` summaries, etc.), all monetary fields plain strings, all rate/count fields already `number` as documented integers/percentages in the use case's own contract | `z.object({}).strict()` | The fixed shape, validated field by field; monetary strings through `preciseAmountSchema`, the documented numeric fields (percentages, counts) passed through unchanged since they are not monetary amounts | See table above |
| `volatility_heatmap` | `GetVolatilityHeatmapUseCase.execute(year?, targetCurrency?)` | no `accountId` | `VolatilityHeatmapCell[]` — `{ date, volatility }`, up to ~365 cells for a full year | `z.object({ year: z.number().int().optional() }).strict()` | Downsampled by `downsampleSeries` to at most **120** cells, `omittedCount` | See table above |
| `spanish_tax_report` | `GetSpanishTaxReportUseCase.execute({ year, method?, accountId?, targetCurrency? })` | `year` is **required** (only tool in this catalogue with a mandatory input) | `SpanishTaxReportResponse` — headline `summary` (capital gains/losses, savings-base yields, general-base airdrops, net result, estimated IRPF), `conversion`, `unconvertibleEvents`, exclusion counts, and `audit_trail: TaxReportAuditTrailEventDto[]` (one row per disposal) | `z.object({ year: z.number().int().min(2009), method: z.string().optional(), accountId: accountIdSchema.optional() }).strict()` | Per-year `summary`, exclusion counts, `unconvertibleEvents` count — `audit_trail` capped to the top **20** rows by `disposal_date` descending plus `omittedCount`, the same row-capping precedent `token_history` already sets, never the full trail | See table above |
| `live_prices` | `IPriceHistoryPort.getLatest(symbol, currency)` (not a use case — the already-captured in-memory snapshot; see below) | n/a — reads a cache, opens no connection | `AssetPrice \| null` per symbol — `{ symbol, currency, price, change24hPercent, provider, timestamp }` | `z.object({ symbols: z.array(z.string().regex(SYMBOL_REGEX)).min(1).max(25) }).strict()` | Per requested symbol: `{ symbol, price, currency, timestamp, provider, stalenessSeconds }` or an entry in `notTracked`; **never opens a new provider connection and never subscribes** — it only calls `getLatest` on the already-running `IPriceHistoryPort` | See table above |
| `fiscal_integrity_rows` | `GetFiscalIntegrityUseCase`'s existing `rows: FifoDataQualityRow[]` field, paginated | already computed by the existing use case; previously always dropped (D14's "Fiscal Integrity Tool Drops Row-Level Data Unconditionally") | `FifoDataQualityRow[]`, one row per flagged transaction | `z.object({ qualityFlag: z.enum(FIFO_QUALITY_FLAGS), page: z.number().int().nonnegative().default(0), accountId: accountIdSchema.optional() }).strict()` | `{ rows: (page slice), page, pageSize, totalPages, totalCount }`, `pageSize` from the resolved profile's `rowsPageSize` | See table above |
| `token_lots` | `GetTokenHistoryUseCase`'s full lot list, paginated (beyond `token_history`'s top-20) | already computed by the existing use case | Lot summaries, same shape `token_history` already projects per lot | `z.object({ symbol: z.string().regex(SYMBOL_REGEX), page: z.number().int().nonnegative().default(0), accountId: accountIdSchema.optional() }).strict()` | `{ lots: (page slice), page, pageSize, totalPages, totalCount }`, `pageSize` from the resolved profile's `lotsPageSize` | See table above |

**A real-type surprise worth naming plainly.** Every one of the six metrics/report use cases
(`GetAssetAllocationUseCase`, `GetRiskMetricsUseCase`, `GetDrawdownCurveUseCase`,
`GetPerformanceHistoryUseCase`, `GetKpisUseCase`, `GetVolatilityHeatmapUseCase`) takes **no
`accountId` parameter at all** — unlike `GetPortfolioSummaryUseCase`, `GetFiscalIntegrityUseCase`, and
`GetTokenHistoryUseCase`, which do. These six are portfolio-wide only. Their tool `inputSchema`s are
therefore genuinely empty objects (`z.object({}).strict()`), not `{ accountId: … .optional() }` — a
model cannot ask any of these six tools to scope to one account, because the backend has no such
capability to expose. `GetSpanishTaxReportUseCase` does accept `accountId`, so its tool schema keeps
that field.

**Confirmed read-only.** Every one of the eight newly wrapped use cases was read for this decision and
contains no call to a write/mutation port method (`.save(`, `.insert(`, `.update(`, `.delete(`,
`.write(`) — each is `ensureFresh()` (a `FifoChainFreshnessService` read-path gate, not a write) followed
by exactly one port read and, where relevant, a pure `Decimal` transform. `StreamNormalizedMarketDataUC`
is not wrapped as a tool at all; the live-price mechanism instead reads the already-populated
`IPriceHistoryPort` cache that `MarketDataOrchestrator`/`routes/market.ts` already fill as a side effect
of the existing SSE price stream — `live_prices` opens no provider connection and calls no
`StreamNormalizedMarketDataUC` execution of its own.

**The model DOES see live prices; it cannot supply them.** `portfolio_summary`'s existing
`livePrices`-injected-by-the-tool-factory behavior (D14) means the model already receives live prices
inline in the portfolio summary result. `live_prices` additionally exposes the same underlying
snapshot directly, for a question like "what's BTC trading at right now" that doesn't need a full
portfolio summary. What the model cannot do, in either tool, is **pass** a price or a currency
conversion as a tool *input* — both remain server-resolved/injected values, never model-suppliable
(unchanged from D14's existing "Tool Inputs Exclude Server-Resolved And Injected Values" requirement,
now stated for two tools instead of one).

**Downsampling is a pure `core-domain` function, index-based, never a money comparison.**

```ts
// packages/core-domain/src/domain/services/downsampleSeries.ts
export function downsampleSeries<T>(series: readonly T[], maxPoints: number): {
  sampled: readonly T[];
  omittedCount: number;
};
```

It selects points by **position** — an even stride through the array — never by comparing a
`drawdownPct`, a `volatility`, or a `portfolioValue` value. This keeps rule 6/D9's "no arithmetic on
money in the AI subtree, and no comparison outside `Money`" holding for time-series tools exactly the
way `rankHoldingsByValue` holds it for holdings: the function never inspects the numeric content of a
point, only its index, so no `Money` import and no float coercion is possible inside it. `drawdown_curve`,
`performance_history`, and `volatility_heatmap` are the three tools that call it; `maxPoints` is **120**
for all three, chosen so a full year of daily points (≤365) downsamples to roughly one point every three
days — enough resolution for a chart-shaped answer without approaching any profile's character budget.

**This partly covers D15's Phase 1 tool list, stated explicitly so Phase 1 does not re-derive it.**
D15 named `market_indicators` (moving averages, RSI, drawdown-from-ATH, volatility) and
`allocation_model` (deterministic reference allocations) as `investmentAnalyst`'s future tools. With
`risk_metrics`, `drawdown_curve`, `volatility_heatmap`, and `asset_allocation` now existing as
deterministic Phase 0 tools on `taxAnalyst`, Phase 1's job for `market_indicators` narrows to
moving-average and RSI computation specifically (drawdown-from-ATH and volatility are already
covered) and `allocation_model`'s job narrows to applying `conservative`/`balanced`/`aggressive`
reference profiles on top of the allocation `asset_allocation` already computes, rather than
re-querying DuckDB directly. `price_forecast` is unaffected — its backtest-hit-rate logic (D15) has no
Phase 0 equivalent. Phase 1 additionally decides whether these tools move to `investmentAnalyst`, stay
on `taxAnalyst` and are shared, or are exposed to both — an open point for Phase 1's own design, not
resolved here.

*Alternatives considered.* **One global constant set, tuned for the cheapest cloud model** — rejected:
wastes a local model's real headroom for no reason, since a local model has no per-token cost to
protect against. **Let the user set raw character budgets per tool for local, same as metered** —
rejected: the real local constraint is the context window the user already had to declare to configure
`num_ctx` correctly; a second, independently-editable number for the same constraint invites the two to
drift, and rule 5 already disfavors two fields expressing one fact. **Resolve limits from whichever
chain entry Mastra actually ends up using, discovered mid-run** — rejected: budgets must bound a tool
call before it happens, so they cannot depend on a fact (which entry survives fallback) only known
after the run is already underway; resolving from the *chain*, not the *outcome*, is what makes the
limits deterministic before the first request leaves the process.

### D8 — Compliance with the non-negotiable rules

**Rule 6 (global per-asset FIFO vs per-account custody) — preserved, structurally.** The advisor
reads only already-materialized results, through the thirteen existing use cases the tool catalogue
wraps (D14/D16) plus the already-populated live-price cache. It introduces no
SQL, no DuckDB view, no `ORDER BY`, and no `PARTITION BY`; nothing in this change can reorder a tax
FIFO queue or generate a disposal. The one ordering it does introduce — `rankHoldingsByValue` (D9) —
is a **display ranking of a materialized snapshot**, computed in a pure `core-domain` service with no
access to a lot, a queue, or an account; it can no more reorder a FIFO queue than sorting a table
column in the UI can. The guarantee is enforced by *what is injected*: the tool
factories receive the constructed use-case instances from the DI container and are given no access
to `ILedgerPort` or `ITaxCalculatorPort`, so there is no path from the AI subtree to the ledger or
the FIFO engine even if someone tried to add a calculation. No AI-layer code computes a fiscal
figure.

**Rule 7 (source conventions are declared, never guessed) — not applicable, and not touched.** The
advisor never parses an exchange export. This change adds no source-specific convention, so nothing
belongs in `sourceProfile/profiles.ts` and no shared fallback is introduced.

**Rule 4 (money is never a raw float) — the boundary is named, and the incoming shape is stated
accurately.** The source use cases return monetary figures as **plain `string`**, not as branded
`PreciseAmount` (verified, see Context) — some of them optional, and `cost_basis` wrapped in a
`ConvertedAmount` union. Applying `preciseAmountSchema` from `@kryptofolio/shared-types` at the tool
boundary *is* therefore the re-typing step, and the only one: a string that fails it is a defect
surfaced at the boundary, not a number silently coerced past it. An absent or `UNCONVERTIBLE` figure
is never defaulted to `'0'`; it is reported as unvalued (D9). The sole number-typed fields permitted
in tool DTOs are integer counts (`omittedCount`, `unvaluedCount`, `totalDefects`, token counts).
Explicitly banned in the AI subtree: `Number(...)`, `parseFloat`, `toFixed`, `Intl.NumberFormat`, and
any arithmetic or comparison operator applied to a monetary value — comparison happens only inside
`Money.compareTo` in `core-domain` (D9). The model receives and echoes the exact string; display
formatting stays the frontend's job. So money never passes through `number` at any layer boundary
this change creates.

**Rule 5 (discriminated unions) — every new type introduced here is a `kind` union**: `AdvisorEvent`
(domain), `AdvisorStreamEvent` (wire), `AdvisorRunReceipt`, the credential-presence state, the
truncation result, `VaultProvider.category`, the frontend chat state (including the synthesized
`transport-lost`), and a holding's valuation state (valued / unvalued, D9 — never a nullable amount
compared directly). No boolean-plus-optional-payload shape is
introduced anywhere. The one flag-shaped artefact is the `ai_advisor_runs` row, justified in D4 as a
SQL projection of a union.

**Rule 2 (hexagonal)** — `@mastra/*` may be imported only from `core/infrastructure/ai/**` and
`MastraAdvisorAdapter.ts` — the Mastra zone D14 defines; a grep asserting that is part of
verification. Two domain ports are added, not
one: `IAdvisorPort` for the stream and `IAdvisorRunLogPort` for the audit write, so `AskAdvisorUC`
never touches SQLite (D2). On the frontend, the transport sits in `RestAdvisorAdapter` behind
`IAdvisorPort`, never in a composable (D11). The only business logic outside `apps/backend` is the
pure ranking service in `packages/core-domain` (D9), which is framework-agnostic by construction and
is where that package already keeps domain services.

## Risks / Trade-offs

- **A second SQLite driver enters the process (libsql alongside `node:sqlite`).** → Accepted
  deliberately, per the exploration decision: a hand-written `MastraStorage` adapter would mean
  owning nine storage domains and tracking Mastra's schema changes indefinitely. Bounded by giving
  libsql its own file (`ai-advisor.db`) holding no business data.
- **Mastra's `ChunkType` union will grow between versions.** → The adapter's switch is
  non-exhaustive by design (D6) and ignores unknown kinds, so a Mastra minor cannot break the build.
  A test asserts unknown chunks are dropped silently rather than surfacing as `failed`.
- **Zod v3/v4 identity mismatch on `inputSchema`.** → Typecheck immediately after install, align the
  catalog rather than cast (D6).
- **Streaming and processor-abort paths are the likeliest vacuous-pass shapes here** (as
  `proposal.md` warns). → Per working-method rule 3, each test gets a deliberate break that must
  land on a line the target case actually reaches: for `refused`, break the tripwire→`refused`
  mapping and confirm the assertion — not a neighbouring one — goes red; for `transport-lost`,
  truncate the stream before the terminal frame and confirm the frontend does *not* report success.
- **`transport-lost` is inferred from absence, so a server that dies mid-stream is indistinguishable
  from a dropped connection.** → Accepted: both are transport failures from the user's point of
  view, both are retryable, and the audit row (D4) disambiguates them for the operator.
- **Retrying a cancelled or failed run costs tokens again.** → Retry is always an explicit user
  action; nothing auto-retries at the transport layer (a first-class reason `EventSource` was
  rejected in D1).
- **The ranking depends on `Money.compareTo`, an existing, tested method.** → Nothing on
  `Money` changes. The risk is the
  temptation to reach for `Money` arithmetic inside the AI subtree afterwards; the verification grep
  for money operators in that subtree is what keeps that closed.
- **`rankHoldingsByValue` is generic over the holding shape**, so a caller could pass the wrong
  accessor. → `valueOf` returns `string | undefined`, which forces the caller to confront the absent
  case at the call site rather than inside the service, and the tool's own test pins the 40-asset
  worst case.
- **Multi-turn memory means the model sees prior turns, which may contain figures it stated
  earlier.** → Those figures came from tool results in the first place, so nothing unvalidated enters
  the context; but a wrong framing can persist across turns within a thread. Read-only Phase 0 bounds
  the consequence to prose, and a new thread is always one click away.
- **The advisor can be confidently wrong in prose while every number is correct.** → The output
  processor guardrail is structural, and Phase 0 is read-only, so the worst case is misleading
  framing rather than a mutated ledger. Scorers over a golden-question set are named in
  `proposal.md` as the later mitigation.
- **Widening `VaultProvider` with `category` touches an existing shape consumed by the credentials
  UI.** → It is an additive discriminated field; the registry is a hardcoded array with a single
  producer (`GetAvailableProvidersUseCase`), so the change is compile-time verified, and rule 8 says
  change the call sites rather than add a shim.
- **A mixed model chain silently loses local generosity (D16).** → Named explicitly rather than
  discovered: the trade-off is stated in D16 and the chat panel's profile badge makes the resolved
  profile visible per run, so a user who wants the local ceilings can see they need an all-local chain
  rather than infer it from unexpectedly small tool results.
- **Deriving local per-tool budgets from `contextWindow` depends on the user declaring an honest
  number.** → A `contextWindow` larger than the model's real context silently risks the same overflow
  the budget exists to prevent; a `contextWindow` smaller than real just under-uses headroom, which is
  safe. `enforceBudget`'s runtime gate is what actually protects the run either way — the derived
  number is a sizing heuristic, not the only safeguard.
- **The ten new tools multiply the surface a Mastra minor version or a future contributor could widen
  past its budget.** → Each is `.strict()` (D5/D16) and each has its own `enforceBudget` call site, so
  the failure mode of one tool widening is a `{ kind: 'truncated', … }` result for that tool, not a
  silent oversized payload reaching the model.

## Migration Plan

All commands run with an explicit Node 24 `PATH` prefix — including `git commit`, whose Husky hook
runs under whatever node is first on `PATH` and will fail on `node:sqlite` under the shell default
v20.20.0.

1. Install `@mastra/core`, `@mastra/memory`, `@mastra/libsql`, `ollama-ai-provider-v2` in `apps/backend`, and `markdown-it` (+ `@types/markdown-it`) in `apps/frontend`. **Then
   immediately run `pnpm typecheck`** and re-verify D6's type claims against the installed `.d.ts`
   files before writing adapter code. If they diverge, update D6 in this document in the same
   session.
2. Land `009_ai_advisor_runs.sql` plus its migration integration test. Additive-only and
   forward-only; the runner has no down migrations.
3. Add `advisor-stream.ts` to `shared-types` — the event union (now naming all 13 `ADVISOR_TOOL_NAMES`,
   D16), `ADVISOR_FAILURE_CODES`, `ADVISOR_TOOL_ERROR_CODES`, `AI_PROVIDER_IDS`, `modelChainSchema` (now
   the local/metered discriminated entry union, D16), `classifyExecutionProfile`, and
   `executionProfilesSchema` — with its round-trip contract test. This gates both the backend route and
   the frontend adapter.
4. Add `rankHoldingsByValue` (over the existing `Money.compareTo`), and `downsampleSeries` (D16) in `packages/core-domain`,
   with tests, before any tool exists — the tools depend on them, not the other way round.
5. Domain (`IAdvisorPort`, `IAdvisorRunLogPort`, `AdvisorEvent`, `AdvisorRunReceipt`,
   `AdvisorRequest`) → model-chain resolution → tools → prompts/guardrail → adapter → use case +
   run-log adapter → DTOs → routes → frontend port/adapter, composable, panel. TDD at each step.
6. Register the advisor routes in `app.ts`'s fluent chain (order matters for `AppType` inference).

**Rollback.** The feature is additive and inert until a model chain is configured: with an empty
chain the routes answer `NO_MODEL_AVAILABLE` and nothing else in the app changes. Reverting means
removing the routes from the `app.ts` chain and the chat panel from the layout. `ai-advisor.db` is
deletable at any time. `009` cannot be un-applied, but an unused empty table is harmless — which is
the reason it is a new table rather than a modification to `audit_log`.

## References

Mastra documentation checked while writing this design (re-verify against the installed version per
task 1.5; latest `@mastra/core` at time of writing: 1.68.0):

- Agents and dynamic `instructions`/`model`: https://mastra.ai/docs/agents/overview
- Model router and fallback arrays: https://mastra.ai/models, https://mastra.ai/blog/model-fallback
- Providers: https://mastra.ai/models/providers/ollama, https://mastra.ai/models/providers/opencode
  (confirm whether the router id is `opencode` or `opencode-go` before fixing `AI_PROVIDER_IDS`)
- `createTool` (`execute(inputData, context)`): https://mastra.ai/reference/tools/create-tool
- Processors and tripwires: https://mastra.ai/docs/agents/processors,
  https://mastra.ai/reference/processors/processor-interface
- `Agent.stream` and chunk types: https://mastra.ai/reference/streaming/agents/stream,
  https://mastra.ai/reference/streaming/ChunkType
- Memory and libsql storage: https://mastra.ai/reference/memory/memory-class,
  https://mastra.ai/docs/memory/storage/memory-with-libsql
- `RuntimeContext` → `RequestContext` rename: https://mastra.ai/reference/migrations/upgrade-to-v1/agent
- Tracing configuration (never-sample, no exporter): https://mastra.ai/reference/observability/tracing/configuration
- Agent networks deprecated in favor of a supervisor agent with sub-agents as tools:
  https://mastra.ai/docs/agents/networks, https://mastra.ai/reference/migrations/agentnetwork (D14)
- `instructions` and `tools` as functions of `({ requestContext })`:
  https://mastra.ai/reference/agents/agent (D14)
- `ToolCallFilter` (recall-time only, never storage) and `TokenLimiter` ordering:
  https://mastra.ai/reference/processors/tool-call-filter (D14)
- `ModerationProcessor` / `PromptInjectionDetector` shapes and evaluation points:
  https://mastra.ai/docs/agents/guardrails (D15, Phase 1)
- `maxSteps` default and the open `stopWhen` bug (#9377), avoided here: cited in D14/D15's original
  explicit-`maxSteps` decision, now resolved per execution profile rather than a bare constant (D16)
- Ollama Cloud free-tier limits (starter credits, starter models, 1 concurrent request):
  https://ollama.com/pricing (D3, D14)
- Ollama Cloud direct API and `Authorization: Bearer` auth: https://docs.ollama.com/cloud (D3)

Minimal example of the tool shape this design expects:

```ts
export const portfolioSummaryTool = (uc: GetPortfolioSummaryUseCase) =>
  createTool({
    id: 'portfolio_summary',
    description: 'Current holdings ranked by value, with incompleteness flags. Read-only.',
    inputSchema: z.object({}).strict(),
    outputSchema: portfolioSummaryToolOutputSchema,
    execute: async () =>
      enforceBudget(projectSummary(await uc.execute()), TOOL_BUDGETS.portfolio_summary),
  });
```

## Open Questions

None blocking implementation; every decision above is settled. Deferred to later phases, recorded so
they are not rediscovered:

- A settings action to purge `ai_advisor_runs` (Phase 0 stores only non-content metadata, so this is
  a convenience, not a privacy requirement).
- Whether `AdvisorEvent` and `AdvisorStreamEvent` stay separate once a second consumer of the domain
  events exists; if they never diverge in practice, collapsing them is a follow-up refactor, not a
  Phase 0 shortcut.
- **Response verbosity as a user setting.** Dropped from Phase 0: `instructions` is a function of
  locale and base currency only, because no `user_settings` key and no UI control for verbosity
  exists, and inventing one with no way to set it would be a parameter nobody can reach.
- **Whether `usage` belongs on the wire.** Kept on the `done` frame even though Phase 0 ships no
  visible token counter, so the panel can display cost later without a contract change. The audit row
  is the system of record either way.
- Whether observational memory or semantic recall earn their cost (D10 leaves both off), which is the
  same question as whether an embedding dependency enters the project.
- ~~Whether the per-tool character budgets in D5 need per-model tuning once real usage exists.~~
  **Resolved by D16**: budgets are no longer one constant per tool but a function of the resolved
  execution profile (explicit and user-editable for metered, derived from `contextWindow` for local).
  What remains open is only whether the `TOOL_SHARE`/`RUN_SHARE` fractions D16 fixes in code need
  tuning once real local-model usage exists — deferred for the same reason the original constants
  were: no evidence yet to tune against.
- Whether the ten D16 tools that are also D15's deterministic sources (`asset_allocation`,
  `risk_metrics`, `drawdown_curve`, `volatility_heatmap`) should be re-exposed on `investmentAnalyst`
  directly in Phase 1, shared across both sub-agents, or left on `taxAnalyst` with
  `investmentAnalyst`'s tools composing over them — named in D16, decided in Phase 1's own design.
