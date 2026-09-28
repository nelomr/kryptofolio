# AI advisor — roadmap beyond Phase 0

Phase 0 (this change) proves the seam read-only. Each later phase has a pre-proposal under
`openspec/changes/<id>/pre-proposal.md`. A pre-proposal is context, not a spec: formalize it with
`/opsx:propose` when it is next.

| Phase | Change id | Scope in one line | Hard dependencies |
|---|---|---|---|
| 0 | `add-ai-portfolio-advisor` | Read-only advisor, 13 tools, execution profiles, grounded + disclosed guardrail | — |
| 1 | `add-ai-advisor-investment-analyst` | Forecasts with a measured, user-set criterion, allocations, indicators, sale tax simulation | 0 |
| 2 | `add-ai-advisor-quality-and-safety` | Golden set and scorers, moderation classifier, injection detection, PII redaction for cloud | 0 |
| 3 | `add-ai-advisor-contextual-insights` | "Explain this number", impact triage, pre-filing checklist, structured reports | 0 (2 recommended) |
| 4 | `add-ai-advisor-data-quality-copilot` | First writes: approved, per-item fixes through existing use cases | 0, **2** (3 recommended) |
| 5 | `add-ai-advisor-tax-knowledge-rag` | Cited tax corpus, local embeddings, long-term memory | 0, **2** |

## Invariants that hold across every phase

- The LLM never produces a number. Figures, forecasts, weights and impacts are tool outputs.
- The advisor never writes on its own. From Phase 4, writes are per-item, user-approved, and go
  through existing use cases only.
- No exchange trading API and no order execution, in any phase.
- Taxation FIFO and custody are never merged or reordered by AI-layer code (rule 6).
- No telemetry leaves the machine. Local vs. metered is derived, never user-labelled.
- Every investment or tax claim carries the structural disclaimer; tax-evasion strategies are always
  refused.
