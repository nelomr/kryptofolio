# Pre-proposal — Phase 5: tax knowledge (RAG) and long-term memory

> **Status: pre-proposal.** Not a formal OpenSpec proposal; do not apply. It records context from the
> Phase 0 design (`add-ai-portfolio-advisor`) so the formal artifacts start complete.

**Depends on:** Phase 0 archived; Phase 2 archived (prompt injection detection is mandatory once
retrieved documents enter the context).

## Why

The advisor knows the user's ledger but not the rules behind it. Questions like "why is this transfer
not a disposal", "how do I declare derivatives", or "what changed in IRPF this year" are answered
today from the model's training data. That data is stale, unverifiable, and jurisdiction-blind. For a
tax tool, an explanation must cite its source.

## Scope

1. **Curated tax corpus.** Official Spanish sources: AEAT manuals and FAQs on crypto, the relevant
   IRPF articles, DGT binding rulings, and the project's own `docs/fifo-tax-engine.md`. Each document
   is versioned by fiscal year and source URL. The corpus is ingested locally; it is never a live web
   search.
2. **`tax_knowledge_search` tool.** Retrieves passages with source, article and year. The answer must
   cite them, extending the Phase 0 grounding rule: a legal claim without a retrieved citation is
   treated like an ungrounded figure (retry, then `refused`).
3. **Embeddings and vector store.** Local by default: an Ollama embedding model plus a libsql vector
   store inside the disposable `ai-advisor.db` area. A metered embedding provider is optional and
   follows the execution profile.
4. **Semantic recall and observational memory.** Phase 0 deferred both because they pull in an
   embedding model; this phase introduces one. Decide whether they earn their cost now (Phase 0 D10
   open question).
5. **Working memory for stable user facts** (fiscal residency, filing status), set explicitly by the
   user and shown and editable in Settings, never inferred silently.

## Out of scope

- Legal advice beyond explaining rules with citations. The disclaimer processor also covers tax
  explanations.
- Jurisdictions other than Spain, unless a later change generalizes the corpus.

## Carried-over decisions

- `ai-advisor.db` is disposable (Phase 0 D4/D10). The vector index must be rebuildable from the
  corpus files, like DuckDB is from SQLite.
- The Phase 0 `ToolCallFilter` policy (no replay of stale tool results) applies to retrieved passages
  too.
- No telemetry leaves the machine.

## Open decisions for `design.md`

- **Corpus licensing and update process:** who refreshes it each fiscal year, and how an outdated
  passage is flagged (year-scoped retrieval by default).
- **Chunking and citation granularity:** article or paragraph level, and how a citation is rendered
  as a link in the chat without `v-html` of untrusted content (Phase 0 D13 markdown rules).
- **The embedding model on the local profile:** size vs. quality, and the `contextWindow` interaction
  with retrieved passages in the local budget formula (Phase 0 D16), where retrieval adds a third
  consumer of the window.
- **Conflict rule:** when retrieved law and the ledger's materialized behaviour disagree, the answer
  must say so and point at the integrity view, never "correct" either one.

## Capabilities (expected)

- New: `ai-tax-knowledge`.
- Modified: `ai-advisor-agent` (retrieval tool, memory options), `ai-model-routing` (embedding model
  per profile), `ai-advisor-chat` (citations).
