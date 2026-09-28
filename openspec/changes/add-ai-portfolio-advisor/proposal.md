## Why

Kryptofolio already resolves the hard numbers — portfolio summary, fiscal integrity, per-token history — but reading them still requires knowing which view to open and how to interpret it. A user with a multi-exchange ledger and dozens of integrity flags has no way to ask "what should I look at first?" in their own language.

This change adds Phase 0 of an AI advisor: a walking skeleton, strictly read-only. The guiding principle is that **the LLM never produces a number**. Every figure comes from an existing use case; the agent only decides what to ask and how to phrase the answer. Phase 0 exists to prove the seam (domain port → use-case → single Mastra adapter → typed Hono route → streaming UI) before any write-capable or RAG-backed phase is designed on top of it.

## What Changes

- **A supervisor agent (`advisor`) built on `@mastra/core`, delegating to specialist sub-agents.** In Phase 0, `advisor` declares `agents: { taxAnalyst }`; `taxAnalyst` holds **thirteen** read-only tools — thin wrappers over `GetPortfolioSummaryUseCase`, `GetFiscalIntegrityUseCase`, `GetTokenHistoryUseCase`, and ten more (`asset_allocation`, `risk_metrics`, `drawdown_curve`, `performance_history`, `kpis`, `volatility_heatmap`, `spanish_tax_report`, `live_prices`, `fiscal_integrity_rows`, `token_lots` — design D16). No new calculation of any kind lives in the AI layer. A second sub-agent, `investmentAnalyst`, is declared with its instructions and contract but holds no tools and is not registered in `advisor`'s `agents` map — it activates in Phase 1 (see design D14/D15), partly by composing over D16's already-deterministic tools rather than re-deriving them.
- **No write tools exist in Phase 0.** The invariant "the advisor never modifies a quantity, an asset, or a fiscal figure" holds by construction, not by prompt instruction.
- **Tool results are pre-aggregated, compact DTOs under an explicit token budget that now depends on which kind of model answered.** The full ledger is never handed to a model. A resolved model-chain entry is classified, never user-toggled, as `local` (an `ollama` provider whose model id does not end `:cloud`) or `metered` (every other case, since money or off-machine data leaves either way). Metered budgets/step counts/history length stay conservative constants (design D5, extended); local ones are more generous and, for per-tool character budgets, derived from the model's own declared `contextWindow` — because a local model's real ceiling is its context window and speed, not cost. Both are user-editable in Settings up to hard safety ceilings that guard against a runaway loop, not against spend. Design D16.
- **Ranking happens in a pure domain service, never in the AI layer.** The portfolio snapshot arrives unordered and a holding's value can be absent or unconvertible, so a `core-domain` service ranks by value through the `Money` value object and returns unvalued holdings as an explicit third list. The AI subtree performs no comparison and no arithmetic on money, and the incompleteness flags the use case already computes (`rates_incomplete`, `prices_incomplete`) travel with the figures so the advisor cannot present a partial total as authoritative.
- **Streaming chat**: SSE from a dedicated Hono route. On the frontend the transport lives in `RestAdvisorAdapter` behind a domain port that exposes the run as an `AsyncIterable`, exactly as `IMarketDataPort.subscribeToStream` already does for prices; the composable only holds reactive state. Pinia Colada is deliberately not used for the token stream (it caches request/response pairs, not incremental streams); it stays the tool for the advisor config.
- **Multi-turn conversation**: Mastra `Memory` on the advisor's own store, `resource: 'local'`, bounded message history, with observational memory and semantic recall off — those would pull in an embedding model and a vector store, which this phase excludes.
- **Global chat panel UI** built on `DESIGN.md` tokens and the app's existing UI techniques (right-side sheet with `--shadow-modal`, mono tabular figures, `Skeleton`, `vue-sonner` via `errorBus`, `lucide-vue-next`, `useI18n`) — design D13. Per-view embedded insights are a later phase.
- **Multi-provider model selection with a fallback chain.** Cloud default; Ollama available locally via `ollama-ai-provider-v2`. OpenAI / Anthropic / Google / OpenCode go through Mastra's model router with no extra package.
- **BYO API keys stored encrypted** by reusing `IVaultCredentialsPort` + `ICryptographyPort`. No plaintext keys in `.env`.
- **One agent, dynamic instructions.** `instructions` is a function of `RequestContext` (locale from Settings, base currency) rather than N duplicated prompts. A stable system prefix enables prompt caching; volatile data appears only inside tool results.
- **Investment questions are answered, not refused — grounded and disclosed, structurally.** The advisor may give price forecasts, asset allocations, and market-timing commentary; every such claim must be grounded in a current-turn tool result (a deterministic output processor enforces this, retrying once before refusing), and any answer touching an investment category carries a structural "not financial advice" disclaimer appended by a separate Mastra output processor — never a sentence the model must remember to write, and not arguable away by the conversation. Tax-evasion requests remain refused unconditionally. See design D15.
- **Per-run audit trail**: model used, tools called, token counts.
- Single-user self-hosted, so `resource`/`thread` scoping is trivial.

Mastra is consumed as a **library**, not via `@mastra/hono`. Routes are hand-written Hono routes so the `hc<AppType>` typed contract is preserved and no generic agent endpoint is exposed.

**Explicitly out of scope for Phase 0** (named only as the road ahead): `investmentAnalyst`'s three tools (`price_forecast`, `allocation_model`, `market_indicators`) and its activation in `advisor`'s `agents` map, the forecast-threshold settings UI (`ai_advisor_forecast_min_hit_rate`, `ai_advisor_forecast_min_samples` — the keys are reserved in design D15 but unconfigurable in Phase 0), `ModerationProcessor` and `PromptInjectionDetector`, golden-question scorers, `structuredOutput` reports, a data-quality copilot using `requireApproval` to fill FX rates from the ECB ledger, rebalancing, a RAG-backed tax explainer, "explain this number", integrity triage ranked by euro impact, a pre-filing checklist, and PII redaction.

## Capabilities

### New Capabilities
- `ai-advisor-agent`: The read-only advisor itself — the `IAdvisorPort` contract, `AskAdvisorUC`, `MastraAdvisorAdapter`, the supervisor/sub-agent topology (`advisor` + `taxAnalyst`, with `investmentAnalyst` declared inactive), `taxAnalyst`'s thirteen tool wrappers (design D14/D16) and their compact DTO + execution-profile-scoped token-budget rules, dynamic `instructions` from `RequestContext`, the grounding-detector and disclaimer output processors, the per-run audit trail (now recording the resolved execution profile and step usage), and the invariant that no figure originates in the AI layer.
- `ai-model-routing`: Multi-provider model selection and fallback chain (cloud default, Ollama local via `ollama` and Ollama Cloud via `ollama-cloud` as distinct provider ids), the derived local-vs-metered execution profile per chain entry and its user-editable limits (design D16), plus BYO key storage encrypted through `IVaultCredentialsPort` / `ICryptographyPort` and the resolution order when a provider has no key.
- `ai-advisor-chat`: The user-facing chat — the SSE streaming route contract, the `ReadableStream` composable (and why Pinia Colada is excluded from the token stream), the global chat panel on `DESIGN.md` tokens, and its empty/error/aborted states.

### Modified Capabilities
- `api-gateway`: adds the advisor routes (ask + SSE stream + model/provider config) as first-class typed Hono routes, keeping the `hc<AppType>` contract intact rather than mounting a generic agent handler.
- `dynamic-vault-registry`: AI provider credentials become registry entries, so BYO keys are governed by the existing encrypted-vault rules instead of a parallel secrets mechanism.

## Impact

**Code — backend (`apps/backend`, no new package):**
- `core/domain/ports/IAdvisorPort.ts` — new, LLM-agnostic.
- `core/domain/ports/IAdvisorRunLogPort.ts` — new; the audit write, so the use case never touches SQLite.
- `core/application/use-cases/AskAdvisorUC.ts` — new.
- `core/infrastructure/adapters/MastraAdvisorAdapter.ts` — implements `IAdvisorPort`; together with `core/infrastructure/ai/**` (below), the only zone permitted to import `@mastra/*` (design D14).
- `core/infrastructure/ai/{agents,tools,prompts,models,processors}/` — new subtree; `agents/` holds `advisor`, `taxAnalyst`, and the declared-but-inactive `investmentAnalyst`.
- `core/infrastructure/dtos/` — Zod schemas for everything crossing the boundary.
- `core/infrastructure/routes/` — advisor routes.

**Code — `packages/core-domain`:** a `rankHoldingsByValue` domain service (reusing the existing `Money.compareTo`), and a `downsampleSeries` domain service (design D16, index-based, no money comparison). Framework-agnostic, no new dependency, and the only business logic this change places outside `apps/backend`.

**Code — `packages/shared-types`:** `advisor-stream.ts` — the wire event union naming all thirteen `ADVISOR_TOOL_NAMES`, the closed vocabularies `ADVISOR_FAILURE_CODES`, `ADVISOR_TOOL_ERROR_CODES`, `AI_PROVIDER_IDS`, the local/metered-discriminated `modelChainSchema` (a chain entry now carries a required `contextWindow` only for local `ollama` entries), `classifyExecutionProfile`, and `executionProfilesSchema` (design D16).

**Code — frontend (`apps/frontend`):** new `ITaxPort`-style advisor port (adds `getExecutionProfiles`/`setExecutionProfiles`) + `RestAdvisorAdapter` owning the `fetch`/`ReadableStream`/SSE-frame transport and reporting to the `errorBus`, a state-only chat composable, a global chat panel component (showing the active model, its local/cloud badge, and a muted steps-used footer), and an "AI advisor" Settings section for the model-chain editor and the per-profile limits editor.

**Dependencies:** `@mastra/core`, `@mastra/memory` (`Memory` is not exported by `@mastra/core`), `@mastra/libsql`, `ollama-ai-provider-v2`; frontend: `markdown-it` for rendering answers with raw HTML disabled. `zod` is already present. No vector store, no RAG dependency.

**Storage:** Mastra memory/telemetry lives in its **own** `ai-advisor.db` (libsql), separate from the ledger's SQLite. It is disposable, re-creatable infrastructure in the same sense DuckDB is — never a source of truth. It **does** hold every figure that ever appeared in a conversation (tool results and the model's echoing prose are both persisted content, design D14); deleting it wipes that content and nothing else in the app. The ledger's own `009_ai_advisor_runs.sql` migration (not yet shipped) additionally gains `execution_profile`, `steps_used`, and `max_steps` columns as part of its own definition (design D4/D16) — no change to `IDatabasePort` or any other table. The execution-profile *limits* themselves are Settings, not a migration: a new `user_settings` key, `ai_advisor_execution_profiles`.

**Non-negotiable rules this brushes against:**
- **Rule 1 (no `any`)** — the sharpest risk here. Mastra's generics (agent/tool/processor type parameters) must not force `any` into the adapter. *Zero `any` in the AI subtree is an explicit acceptance criterion of this change, not something to discover during review*, and the verifying grep must include `, any>` alongside `: any|as any|<any>`.
- **Rule 3 (domain imports nothing external)** — `IAdvisorPort` must not import `@mastra/*`, Zod, or `decimal.js`. Zod lives in `infrastructure/dtos/` only.
- **Rule 2 (hexagonal)** — exactly one adapter touches the LLM SDK; the use case orchestrates through the port.
- **Rule 6 (FIFO vs custody)** — the advisor reads already-materialized fiscal results through existing use cases. It introduces **no** new ordering, no new partitioning, and nothing that can reorder a tax FIFO queue. No AI-layer code may compute a fiscal figure.
- **Rule 4 (money is never a raw float)** — the source use cases return plain `string` figures, some optional, one wrapped in a `ConvertedAmount` union; applying `preciseAmountSchema` at the tool boundary is the re-typing step, an absent figure is reported as unvalued rather than defaulted to `'0'`, and monetary comparison happens only inside `Money`.
- **Rule 5 (discriminated unions)** — provider/model configuration and stream events are modelled as `kind`-discriminated unions, not flag-plus-optional-payload bags.

**Testing:** TDD throughout, and per rule 3 of "Working method", each new test must be proven able to fail — a deliberate break must land on a line the target case actually reaches. Streaming and processor-abort paths are the likeliest vacuous-pass shapes here.

**Environment:** Node `>=24.16.0` per root `engines`; the local default shell node is v20.20.0, so commands (including `git commit`, whose Husky hook runs under whatever node is first on `PATH`) need an explicit `PATH` prefix.
