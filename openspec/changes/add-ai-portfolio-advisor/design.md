# Design — add-ai-portfolio-advisor (Phase 0)

## Context

`proposal.md` establishes the motivation and the Capabilities contract (`ai-advisor-agent`,
`ai-model-routing`, `ai-advisor-chat`, plus modifications to `api-gateway` and
`dynamic-vault-registry`). This document resolves the technical decisions that must be settled
*before* implementation, per CLAUDE.md working method rule 1.

Current state relevant to this change, verified against the repository:

- **Ports** live in `apps/backend/src/core/domain/ports/` (15 today). House style: `I*Port.ts`,
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
- **`Money` (`packages/core-domain/src/value-objects/Money.ts`) wraps `decimal.js` privately but
  exposes only `add`/`sub`/`mul`/`div`/`equals` — there is no comparison method.** Adding one is
  part of this change (Decision 9).
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
- **No AI dependency is installed**: no `@mastra/*`, no `ai`, no `@ai-sdk/*`, no `libsql`. The
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
  shared packages is one `shared-types` module (Decision 1) and two additive `core-domain` artifacts —
  `Money.compare` and `rankHoldingsByValue` (Decision 9).
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
| `done` | `runId`, `providerId`, `modelId`, `usage: { inputTokens, outputTokens }`, `toolsCalled: AdvisorToolName[]` | terminal, success |
| `refused` | `runId`, `reason: string`, `processorId: string` | terminal, guardrail tripwire |
| `failed` | `runId`, `code: AdvisorFailureCode` | terminal, server-side failure |

`AdvisorToolName`, `AdvisorFailureCode` and `AdvisorToolErrorCode` are shared const tuples fed to
`z.enum(...)`, mirroring the existing `z.enum(FIFO_QUALITY_FLAGS)` convention, so an unknown
vocabulary cannot cross the wire in either direction. **All three are enumerated closed here**, so
no failure reaches the wire as an unnamed string:

```ts
export const ADVISOR_TOOL_NAMES = ['portfolio_summary', 'fiscal_integrity', 'token_history'] as const;
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
   ordered tool names, token counts. There is no separate "and also return metadata" channel, which
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
- **Keys are always passed explicitly** as `{ id, apiKey }`, decrypted at request time through
  `IVaultCredentialsPort.getCredential(providerId)` + `ICryptographyPort.decrypt`. Mastra's
  environment-variable auto-detection is never relied upon, because plaintext keys in `.env` are
  precisely what this change removes.
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
`packages/database/migrations/sqlite/007_ai_advisor_runs.sql`, and it contains **no conversation
content whatsoever**.

```sql
CREATE TABLE IF NOT EXISTS ai_advisor_runs (
    id           TEXT PRIMARY KEY,
    thread_id    TEXT NOT NULL,
    started_at   TEXT NOT NULL,
    finished_at  TEXT,
    outcome      TEXT NOT NULL CHECK (outcome IN ('completed','refused','failed','aborted')),
    provider_id  TEXT,
    model_id     TEXT,
    tools_called TEXT NOT NULL DEFAULT '[]',
    input_tokens INTEGER,
    output_tokens INTEGER,
    failure_code TEXT
) STRICT;
```

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
- Because the runner is forward-only and a `CHECK` constraint cannot be `ALTER`ed, `007` is
  additive-only (a brand-new table, no modification to existing constraints) and ships with an
  integration test alongside the existing `migration_00N_*.spec.ts` files.

### D5 — Enforcing the token budget on tool results

**Decided.** "Compact pre-aggregated DTO" is enforced by three mechanisms in series, so it cannot
degrade into an intention:

1. **Narrow-by-construction `outputSchema`.** Every tool declares a Zod `outputSchema` that is
   fixed-arity and top-N truncated — e.g. the portfolio summary returns at most the top 15 holdings
   by value plus `omittedCount: z.number().int().nonnegative()`; the integrity tool returns per-flag
   counts and at most the top N defect groups, never per-transaction rows. Schemas use `.strict()`,
   so a future contributor widening the DTO gets a validation failure rather than a silently larger
   payload.
2. **A hard runtime gate.** `enforceBudget(payload, maxChars)` in
   `infrastructure/ai/tools/enforceBudget.ts` measures `JSON.stringify(payload).length` against a
   per-tool character budget and, when exceeded, returns a `{ kind: 'truncated', … }` result naming
   what was dropped — never the oversized payload. Characters, not tokens, on purpose: deterministic,
   no tokenizer dependency, no per-provider variance. The ~4-chars-per-token ratio is used only to
   pick the constants. Initial budgets: portfolio summary 4 000, fiscal integrity 6 000, token
   history 6 000.
3. **Tests measured against real data, not fixtures alone.** Per working-method rule 5, the budget
   tests use worst-case shapes derived from the real ledger (a 40-asset portfolio; an integrity
   report exercising every `FIFO_QUALITY_FLAG`), because a hand-written fixture will always fit.

Mastra's `TokenLimiterProcessor` is explicitly **not** the mechanism here — it bounds the model's
*output*, not tool results. Noted so nobody later mistakes one for the other.

### D6 — Rule 1: does Mastra force an `any`?

**Decided, with the escape hatch named.** Checked against Mastra's published type reference (the
packages are not yet installed, so this is re-verified as the first implementation task):

- `Processor<TId extends string = string, TTripwireMetadata = unknown>` — generics are defaulted and
  bounded; `abort: (reason?: string, options?: { retry?: boolean; metadata?: unknown }) => never`.
  `unknown`, not `any`. The "not financial advice" output processor is clean.
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
  `['openai', 'anthropic', 'google', 'opencode', 'ollama'] as const`, and the same five ids are the
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
  the value object exists for (rule 4). `Money` currently exposes only `add`/`sub`/`mul`/`div`/
  `equals`, so **this change adds `compare(other: Money): -1 | 0 | 1`** to it, with its own test.
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

- Mastra `Memory` is configured on the libsql store in `ai-advisor.db`, with `lastMessages` bounded
  (20) and **observational memory and semantic recall both off** — the latter would pull in an
  embedding model and a vector store, which the proposal puts out of scope.
- `resource` is the constant `'local'` (single-user self-hosted, per the Non-Goals). `thread` is the
  request's `threadId`; when absent the adapter creates one and the first `token` frame's run is
  reported with that id in the terminal event, so the client can continue the thread.
- **Memory holds conversation content only.** No portfolio figure is written into it: figures live in
  tool results, which is what keeps D4's privacy split true and the stable instruction prefix
  cacheable (D1/agent spec).
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

### D8 — Compliance with the non-negotiable rules

**Rule 6 (global per-asset FIFO vs per-account custody) — preserved, structurally.** The advisor
reads only already-materialized results, through the three existing use cases. It introduces no
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
`Money.compare` in `core-domain` (D9). The model receives and echoes the exact string; display
formatting stays the frontend's job. So money never passes through `number` at any layer boundary
this change creates.

**Rule 5 (discriminated unions) — every new type introduced here is a `kind` union**: `AdvisorEvent`
(domain), `AdvisorStreamEvent` (wire), `AdvisorRunReceipt`, the credential-presence state, the
truncation result, `VaultProvider.category`, the frontend chat state (including the synthesized
`transport-lost`), and a holding's valuation state (valued / unvalued, D9 — never a nullable amount
compared directly). No boolean-plus-optional-payload shape is
introduced anywhere. The one flag-shaped artefact is the `ai_advisor_runs` row, justified in D4 as a
SQL projection of a union.

**Rule 2 (hexagonal)** — `MastraAdvisorAdapter.ts` is the only file in the repository permitted to
import `@mastra/*`; a grep asserting that is part of verification. Two domain ports are added, not
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
- **`Money.compare` is a new method on a value object used by the tax path.** → It is additive and
  pure, has its own test, and changes no existing method. The risk is not the method but the
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

## Migration Plan

All commands run with an explicit Node 24 `PATH` prefix — including `git commit`, whose Husky hook
runs under whatever node is first on `PATH` and will fail on `node:sqlite` under the shell default
v20.20.0.

1. Install `@mastra/core`, `@mastra/libsql`, `ollama-ai-provider-v2` in `apps/backend`. **Then
   immediately run `pnpm typecheck`** and re-verify D6's type claims against the installed `.d.ts`
   files before writing adapter code. If they diverge, update D6 in this document in the same
   session.
2. Land `007_ai_advisor_runs.sql` plus its migration integration test. Additive-only and
   forward-only; the runner has no down migrations.
3. Add `advisor-stream.ts` to `shared-types` — the event union, `ADVISOR_TOOL_NAMES`,
   `ADVISOR_FAILURE_CODES`, `ADVISOR_TOOL_ERROR_CODES`, `AI_PROVIDER_IDS`, `modelChainSchema` — with
   its round-trip contract test. This gates both the backend route and the frontend adapter.
4. Add `Money.compare` and `rankHoldingsByValue` in `packages/core-domain`, with tests, before any
   tool exists — the tools depend on them, not the other way round.
5. Domain (`IAdvisorPort`, `IAdvisorRunLogPort`, `AdvisorEvent`, `AdvisorRunReceipt`,
   `AdvisorRequest`) → model-chain resolution → tools → prompts/guardrail → adapter → use case +
   run-log adapter → DTOs → routes → frontend port/adapter, composable, panel. TDD at each step.
6. Register the advisor routes in `app.ts`'s fluent chain (order matters for `AppType` inference).

**Rollback.** The feature is additive and inert until a model chain is configured: with an empty
chain the routes answer `NO_MODEL_AVAILABLE` and nothing else in the app changes. Reverting means
removing the routes from the `app.ts` chain and the chat panel from the layout. `ai-advisor.db` is
deletable at any time. `007` cannot be un-applied, but an unused empty table is harmless — which is
the reason it is a new table rather than a modification to `audit_log`.

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
- Whether the per-tool character budgets in D5 need per-model tuning once real usage exists. The
  constants are deliberately conservative and live in one file.
