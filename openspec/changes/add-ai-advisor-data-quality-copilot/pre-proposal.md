# Pre-proposal — Phase 4: data-quality copilot (first write-capable phase)

> **Status: pre-proposal.** Not a formal OpenSpec proposal; do not apply. It records context from the
> Phase 0 design (`add-ai-portfolio-advisor`) so the formal artifacts start complete.

**Depends on:** Phase 0 archived; **Phase 2 archived (mandatory)**, because writes need prompt
injection detection and scorers; Phase 3 recommended (triage by impact tells the copilot what to fix
first).

## Why

The most tedious work in Kryptofolio is resolving data quality: missing FX rates, pending values,
transfer destinations, and spot transaction overrides. The advisor can already see all of it (Phase 0
`fiscal_integrity_rows`). This phase lets it **propose** fixes that the user approves one by one.
It is the first time the invariant "the advisor cannot write" changes, so it changes deliberately
and narrowly.

## The invariant, restated for this phase

The advisor still cannot write **by itself**. Every mutation:
- goes through an **existing** use case;
- is proposed as a typed diff;
- is executed only after explicit, per-item user approval (Mastra `requireApproval` /
  human-in-the-loop suspend and resume).

Nothing is batch-approved silently, and nothing writes on a model's say-so. Quantities, cost basis
and fiscal figures are still never set by the model: a proposal sets a *source fact* (an FX rate
from the ECB ledger, a transfer destination), and the existing engine recomputes the figures.

## Scope

1. **Write tools over existing use cases only:**
   - `SetTransferDestinationUseCase` / `RemoveTransferDestinationUseCase`;
   - `SetSpotTransactionOverrideUseCase` / `RemoveSpotTransactionOverrideUseCase` (from the
     `add-spot-transaction-edit-overrides` change);
   - filling FX gaps from the ECB ledger (`BackfillExchangeRateGapsUC` / `IFxRateLedgerPort`).
   No new mutation logic in the AI layer.
2. **Approval flow.** Each write tool suspends with a typed proposal (what changes, from what to
   what, which figures will be recomputed). The chat renders an approval card with Approve / Reject
   per item and resumes the run with the decision. Approval is required on every profile,
   local included.
3. **Provenance.** Each approved mutation is recorded as made by the advisor on user approval
   (the run id plus the approval), in the existing `audit_log` or override tables. The UI marks it
   as such where the value is shown.
4. **Automatic re-materialization** after approved writes, using the existing rebuild path
   (`automatic-portfolio-rebuild`), and the advisor re-reads the result before claiming success.
5. **Undo.** Every approved override is reversible through the corresponding Remove use case,
   offered in the same card.

## Out of scope

- Editing raw transactions, quantities or balances. Only declared source facts.
- Any exchange or trading API. **Never.**
- Autonomous background fixing. The copilot acts only inside a user-initiated run.

## Carried-over decisions

- Tool dependency sets are minimal (Phase 0): each write tool receives only its use case.
- The model cannot supply prices or conversions (Phase 0 D14). An FX fill must come from the ECB
  ledger lookup, never from a model-stated rate.
- Rule 6: no write may reorder the tax FIFO queue or create a disposal. A transfer destination is
  custody, and must stay custody.

## Open decisions for `design.md`

- **Supervisor topology:** a third sub-agent (`dataQualityCopilot`) with the write tools, or write
  tools on `taxAnalyst` gated by approval. The recommendation is a separate sub-agent, so read-only
  sub-agents stay read-only by construction.
- **How a suspended run survives the SSE stream.** New wire events (`approval-required`,
  `approval-resolved`) and a resume route; the Phase 0 "exactly one terminal frame" rule needs a
  `suspended` terminal or a held stream. This is the hardest contract change and must be decided
  first.
- **Where approvals are audited** and how they relate to `ai_advisor_runs` (a run can now have
  side effects: add a `mutations_applied` count, never the content).
- **Proposal staleness:** a proposal generated before a new import may be invalid at approval time.
  It needs an optimistic check (ledger version) on approve.
- Mastra's current human-in-the-loop API (tool `requireApproval`, suspend and resume) must be
  re-verified against the installed version; it was not verified during Phase 0.

## Capabilities (expected)

- New: `ai-data-quality-copilot`.
- Modified: `ai-advisor-agent` (the write invariant, carefully), `ai-advisor-chat` (approval cards,
  new wire events), `api-gateway` (resume route), and the override/transfer specs (provenance).
