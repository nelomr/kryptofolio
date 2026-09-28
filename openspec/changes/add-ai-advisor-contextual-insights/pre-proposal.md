# Pre-proposal — Phase 3: contextual insights

> **Status: pre-proposal.** Not a formal OpenSpec proposal; do not apply. It records context from the
> Phase 0 design (`add-ai-portfolio-advisor`) so the formal artifacts start complete.

**Depends on:** Phase 0 archived. Phase 2's figure-fidelity scorer is strongly recommended first,
because this phase puts AI text next to authoritative numbers.

## Why

Phase 0 is one global chat panel: the user has to know what to ask. The original motivation was the
opposite: "a user with dozens of integrity flags has no way to ask what to look at first". This phase
brings the advisor to the number the user is already looking at, without making them type.

## Scope

1. **"Explain this number."** An affordance on key figures (KPIs, tax report totals, a lot's gain or
   loss, an integrity count) opens the panel with a pre-built, **structured** question. The payload
   carries the figure's identity (view, metric id, asset, year), never the value: the advisor
   re-reads the value through a tool, so it cannot explain a stale or mistyped number.
2. **Integrity triage ranked by euro impact.** Rank `fiscal_integrity` groups by the fiscal amount
   they put at risk, not only by `count`. This needs a deterministic impact figure per group,
   computed by a use case (never by the model); the advisor explains the ranking.
3. **Pre-filing checklist.** A structured, per-fiscal-year report: unresolved integrity flags,
   incomplete rates or prices, pending reviews, and derivative items that need manual declaration.
   Built with `structuredOutput` and rendered as a checklist component, not as prose. It is linked
   from the tax report view.
4. **`structuredOutput` reports.** Structured outputs replace free text where the UI needs to render
   components: checklist, triage table, forecast card from Phase 1. The schemas live in
   `shared-types` and are validated on both ends, like the Phase 0 SSE contract.
5. **Embedded insight slots per view.** A small, dismissible, lazily generated insight on
   Portfolio, TaxReport and Integrity views (for example "3 flags block 2025's report"). It is
   generated on demand or cached per ledger version, **never on every page load on a metered
   profile**.
6. **Per-account filters on the metric tools.** Phase 0 found that six metric use cases take no
   `accountId`. Adding it lets the advisor answer "how risky is what I hold on Kraken". This modifies
   existing use cases, so it needs its own spec deltas.
7. **Visible usage counter.** The `done` frame already carries `usage` (Phase 0 kept it for this),
   shown per answer in muted mono on the metered profile.

## Out of scope

- Any write (Phase 4).
- Tax law explanations beyond what the ledger shows (Phase 5).

## Carried-over decisions

- Figures come only from tools and are echoed verbatim in mono (Phase 0 D13/D14).
- Execution profiles govern cost (Phase 0 D16). Insight slots respect them: auto-generation may be
  enabled by default only on the local profile.
- DESIGN.md tokens and the existing primitives. Insight slots use the card pattern and never use
  `--profit`/`--loss` for prose.

## Open decisions for `design.md`

- **Cache key for insights:** a ledger version or hash (for example the last materialization
  timestamp) so an insight never outlives the data it describes. Invalidation is on materialization.
- **The euro-impact definition per quality flag.** Each flag's impact semantics must be declared per
  flag, the same philosophy as `sourceProfile` (rule 7). No global fallback formula.
- **Figure identity.** The "explain this number" payload needs a closed vocabulary of metric ids
  (`shared-types` const tuple), which becomes a new cross-app contract.
- Streaming vs. non-streaming for structured reports. Structured objects stream differently (object
  stream); check Mastra's `structuredOutput` support on `agent.stream`, which was not confirmed
  during Phase 0 research.

## Capabilities (expected)

- New: `ai-contextual-insights`, `ai-structured-reports`.
- Modified: `fiscal-integrity` (impact ranking), `crypto-risk-metrics`, `crypto-drawdown-curve` and
  other metric specs (account filter), `ai-advisor-chat`, and the Portfolio / TaxReport views' specs.
