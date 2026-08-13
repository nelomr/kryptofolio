## Why

Kryptofolio already resolves the hard numbers — portfolio summary, fiscal integrity, per-token history — but reading them still requires knowing which view to open and how to interpret it. A user with a multi-exchange ledger and dozens of integrity flags has no way to ask "what should I look at first?" in their own language.

This change adds Phase 0 of an AI advisor: a walking skeleton, strictly read-only. The guiding principle is that **the LLM never produces a number**. Every figure comes from an existing use case; the agent only decides what to ask and how to phrase the answer. Phase 0 exists to prove the seam (domain port → use-case → single Mastra adapter → typed Hono route → streaming UI) before any write-capable or RAG-backed phase is designed on top of it.

## What Changes

- **New read-only advisor agent** built on `@mastra/core`, exposing exactly three tools — thin wrappers over `GetPortfolioSummaryUseCase`, `GetFiscalIntegrityUseCase`, `GetTokenHistoryUseCase`. No new calculation of any kind lives in the AI layer.
- **No write tools exist in Phase 0.** The invariant "the advisor never modifies a quantity, an asset, or a fiscal figure" holds by construction, not by prompt instruction.
- **Tool results are pre-aggregated, compact DTOs under an explicit token budget.** The full ledger is never handed to a model.
- **Streaming chat**: SSE from a dedicated Hono route, consumed in the frontend by a composable over `ReadableStream`. Pinia Colada is deliberately not used for the token stream (it caches request/response pairs, not incremental streams); it stays the tool for any non-streaming advisor metadata.
- **Global chat panel UI** built on `DESIGN.md` tokens. Per-view embedded insights are a later phase.
- **Multi-provider model selection with a fallback chain.** Cloud default; Ollama available locally via `ollama-ai-provider-v2`. OpenAI / Anthropic / Google / OpenCode go through Mastra's model router with no extra package.
- **BYO API keys stored encrypted** by reusing `IVaultCredentialsPort` + `ICryptographyPort`. No plaintext keys in `.env`.
- **One agent, dynamic instructions.** `instructions` is a function of `RequestContext` (locale from Settings, base currency, verbosity) rather than N duplicated prompts. A stable system prefix enables prompt caching; volatile data appears only inside tool results.
- **The "not financial advice" guardrail is a Mastra output processor**, not a sentence in the prompt — so it cannot be argued away by the conversation.
- **Per-run audit trail**: model used, tools called, token counts.
- Single-user self-hosted, so `resource`/`thread` scoping is trivial.

Mastra is consumed as a **library**, not via `@mastra/hono`. Routes are hand-written Hono routes so the `hc<AppType>` typed contract is preserved and no generic agent endpoint is exposed.

**Explicitly out of scope for Phase 0** (named only as the road ahead): `structuredOutput` reports, a data-quality copilot using `requireApproval` to fill FX rates from the ECB ledger, rebalancing, a RAG-backed tax explainer, "explain this number", integrity triage ranked by euro impact, a pre-filing checklist, PII redaction, and scorers over a golden-question dataset.

## Capabilities

### New Capabilities
- `ai-advisor-agent`: The read-only advisor itself — the `IAdvisorPort` contract, `AskAdvisorUC`, the single `MastraAdvisorAdapter`, the three tool wrappers and their compact DTO + token-budget rules, dynamic `instructions` from `RequestContext`, the output-processor guardrail, the per-run audit trail, and the invariant that no figure originates in the AI layer.
- `ai-model-routing`: Multi-provider model selection and fallback chain (cloud default, Ollama local), plus BYO key storage encrypted through `IVaultCredentialsPort` / `ICryptographyPort` and the resolution order when a provider has no key.
- `ai-advisor-chat`: The user-facing chat — the SSE streaming route contract, the `ReadableStream` composable (and why Pinia Colada is excluded from the token stream), the global chat panel on `DESIGN.md` tokens, and its empty/error/aborted states.

### Modified Capabilities
- `api-gateway`: adds the advisor routes (ask + SSE stream + model/provider config) as first-class typed Hono routes, keeping the `hc<AppType>` contract intact rather than mounting a generic agent handler.
- `dynamic-vault-registry`: AI provider credentials become registry entries, so BYO keys are governed by the existing encrypted-vault rules instead of a parallel secrets mechanism.

## Impact

**Code — backend (`apps/backend`, no new package):**
- `core/domain/ports/IAdvisorPort.ts` — new, LLM-agnostic.
- `core/application/use-cases/AskAdvisorUC.ts` — new.
- `core/infrastructure/adapters/MastraAdvisorAdapter.ts` — the **only** file permitted to import `@mastra/*`.
- `core/infrastructure/ai/{agents,tools,prompts,models}/` — new subtree.
- `core/infrastructure/dtos/` — Zod schemas for everything crossing the boundary.
- `core/infrastructure/routes/` — advisor routes.

**Code — frontend (`apps/frontend`):** new `ITaxPort`-style advisor port + `Rest…Adapter`, a streaming composable, and a global chat panel component.

**Dependencies:** `@mastra/core`, `@mastra/libsql`, `ollama-ai-provider-v2`. `zod` is already present. No vector store, no RAG dependency.

**Storage:** Mastra memory/telemetry lives in its **own** `ai-advisor.db` (libsql), separate from the ledger's SQLite. It is disposable, re-creatable infrastructure in the same sense DuckDB is — never a source of truth. No change to `IDatabasePort` or the ledger schema.

**Non-negotiable rules this brushes against:**
- **Rule 1 (no `any`)** — the sharpest risk here. Mastra's generics (agent/tool/processor type parameters) must not force `any` into the adapter. *Zero `any` in the AI subtree is an explicit acceptance criterion of this change, not something to discover during review*, and the verifying grep must include `, any>` alongside `: any|as any|<any>`.
- **Rule 3 (domain imports nothing external)** — `IAdvisorPort` must not import `@mastra/*`, Zod, or `decimal.js`. Zod lives in `infrastructure/dtos/` only.
- **Rule 2 (hexagonal)** — exactly one adapter touches the LLM SDK; the use case orchestrates through the port.
- **Rule 6 (FIFO vs custody)** — the advisor reads already-materialized fiscal results through existing use cases. It introduces **no** new ordering, no new partitioning, and nothing that can reorder a tax FIFO queue. No AI-layer code may compute a fiscal figure.
- **Rule 4 (money is never a raw float)** — tool-result DTOs carry `PreciseAmount`-derived strings; no figure is re-formatted through float arithmetic on its way to the model.
- **Rule 5 (discriminated unions)** — provider/model configuration and stream events are modelled as `kind`-discriminated unions, not flag-plus-optional-payload bags.

**Testing:** TDD throughout, and per rule 3 of "Working method", each new test must be proven able to fail — a deliberate break must land on a line the target case actually reaches. Streaming and processor-abort paths are the likeliest vacuous-pass shapes here.

**Environment:** Node `>=24.16.0` per root `engines`; the local default shell node is v20.20.0, so commands (including `git commit`, whose Husky hook runs under whatever node is first on `PATH`) need an explicit `PATH` prefix.
