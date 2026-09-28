# Pre-proposal — Phase 1: investment analyst

> **Status: pre-proposal.** This is not a formal OpenSpec proposal and must not be applied. It records
> the scope and the context settled while designing Phase 0 (`add-ai-portfolio-advisor`), so that
> `/opsx:propose`, `/opsx:spec`, `/opsx:design` and `/opsx:tasks` start from complete context.
> Formalizing it replaces this file with `proposal.md` and the other artifacts.

**Depends on:** `add-ai-portfolio-advisor` (Phase 0) archived. Its specs (`ai-advisor-agent`,
`ai-advisor-chat`, `ai-model-routing`) are the baseline this phase modifies.

## Why

Phase 0 answers "what does my ledger say". The user also wants the advisor to answer "what could I do
with it": price forecasts, professional asset allocations, and market timing. This is a local,
single-user tool and the user owns the decision to act on it. Phase 0 already declared an inactive
`investmentAnalyst` sub-agent and a guardrail that grounds and discloses investment claims instead of
refusing them (Phase 0 D15). Phase 1 gives that sub-agent its deterministic tools and turns it on.

## Guiding principle carried over

**The LLM never produces a number.** A forecast, an allocation weight, or a timing signal is a tool
output. The model chooses which tool to call and explains the result. A confidence that the model
states itself is rejected: it is uncalibrated text, not a measured probability.

## Scope

1. **`price_forecast` tool.** Deterministic forecast over the user's own price history (DuckDB
   series already ingested). It returns the forecast, the horizon, and its **measured backtest**
   (walk-forward): hit rate and sample size. It gives no answer when the data is insufficient.
2. **Measurable forecast criterion, decided by the user.** The advisor presents a forecast only when
   `hit_rate >= ai_advisor_forecast_min_hit_rate` (default `0.90`, range 0.50–0.99) **and**
   `samples >= ai_advisor_forecast_min_samples` (default 30). Otherwise it answers "no reliable
   signal". The measured hit rate and sample size are **always** shown, above or below the
   threshold. Phase 0 reserved these keys; Phase 1 implements them and their Settings control.
3. **`allocation_model` tool.** Applies reference profiles (`conservative`, `balanced`,
   `aggressive`) and concentration limits to the real portfolio and returns target weights and the
   delta against current weights. Built on the Phase 0 `asset_allocation` and `risk_metrics` tools
   rather than recomputing them. The profile definitions are versioned data with their stated
   rationale, not prompt text.
4. **`market_indicators` tool.** Moving averages, RSI, drawdown from all-time high, and volatility
   regime per asset. It reuses `drawdown_curve`, `volatility_heatmap` and `performance_history` where
   they already compute a figure, and adds only what is missing, computed in DuckDB or in a pure
   `core-domain` service.
5. **Activate `investmentAnalyst`** in the supervisor's `agents` map. With two active sub-agents, the
   supervisor switches from deterministic delegation to LLM routing (Phase 0 D14 prepared this).
6. **Hypothetical tax impact of a sale** ("what would I pay if I sold X"). This needs a new pure
   simulation over the materialized FIFO lots that never writes and never reorders the tax queue
   (rule 6). It is the most valuable cross-over between the two sub-agents.
7. **UI:**
   - suggested questions for the "Your portfolio" group;
   - a forecast card inside the answer showing forecast, horizon, hit rate, samples and threshold,
     with all numbers in mono;
   - the Settings controls for the criterion;
   - the disclaimer footer, which is already structural from Phase 0.

## Out of scope

- LLM-based moderation, prompt-injection detection and evals (Phase 2).
- Any order execution or connection to an exchange trading API. **Never in any phase.**
- Rebalancing that writes anything. Allocations are proposals only.

## Carried-over decisions (do not re-open)

- Grounding rule and disclaimer processor (Phase 0 D15): every forecast, allocation or timing claim
  must cite a tool result from the current turn; retry once, then `refused`. Tax evasion is always
  refused.
- Execution profiles (Phase 0 D16): the new tools get metered budgets and local budgets derived from
  `contextWindow`.
- Read-only by construction (Phase 0). The Mastra import zone is `infrastructure/ai/**` plus the
  adapter.

## Open decisions for `design.md`

- **Forecast method.** Candidates: naive/seasonal baselines, exponential smoothing, and a
  direction classifier over indicators. The decision must record the backtest protocol: window,
  horizon, what counts as a "hit" (direction vs. band), and leakage prevention. Expect most assets
  to fail a 0.90 threshold. That is correct behaviour, and the UI copy must say so plainly.
- **Where it runs.** DuckDB SQL (preferred for series work, `duckdb-best-practices`) or a pure
  `core-domain` service. Either way, no `decimal.js` in the AI subtree.
- **How the supervisor routes** once there are two sub-agents: descriptions only, or a routing hint
  in the request context from the suggested-question group. This costs one extra LLM call per turn,
  which matters on the metered profile and the Ollama Cloud free tier (1 concurrent request).
- **Allocation profile data:** where it lives (shared-types constant vs. user setting) and whether
  the user can define a custom profile.
- **Sale simulation:** whether it becomes a use case exposed in the regular UI too, not only to the
  advisor. Recommended, so the figure is verifiable outside the chat.

## Capabilities (expected)

- New: `ai-investment-analysis` (the tools, the criterion, the sub-agent contract).
- Modified: `ai-advisor-agent` (activation, routing), `ai-advisor-chat` (forecast card, settings),
  and possibly `fiscal-domain` (sale simulation).

## Risks to address

- Users reading a hit rate as a guarantee. The copy must state the sample size and that past hit
  rate does not guarantee future results.
- Overfitting in the backtest. The protocol must be walk-forward, never in-sample.
- A forecast tool that silently degrades when the price history has gaps. The same data-quality
  signals as Phase 0 (`pricesIncomplete`) apply.
