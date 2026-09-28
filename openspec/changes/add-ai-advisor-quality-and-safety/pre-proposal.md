# Pre-proposal — Phase 2: quality, evaluation and safety

> **Status: pre-proposal.** Not a formal OpenSpec proposal; do not apply. It records context from the
> Phase 0 design (`add-ai-portfolio-advisor`) so the formal artifacts start complete.

**Depends on:** Phase 0 archived. It can run in parallel with Phase 1. It should land **before**
Phase 4, which adds writes.

## Why

Phase 0's guardrails are structural but shallow:
- a deterministic ES/EN pattern detector for ungrounded investment claims;
- a disclaimer processor;
- read-only tools.

Phase 0 accepted three weaknesses explicitly:
- false positives and paraphrase evasion in the pattern detector;
- no protection against prompt injection;
- no way to measure whether answers are right.

Once investment analysis (Phase 1) and writes (Phase 4) exist, "we think it behaves" stops being
acceptable. This phase makes behaviour measurable and hardens the input and output edges.

## Scope

1. **Golden-question dataset.** A versioned set of questions with expected tool calls and
   properties of a correct answer, over a fixed synthetic ledger fixture plus anonymized worst-case
   shapes measured from real exports (CLAUDE.md working-method rule 5). It covers both sub-agents,
   both locales, and every refusal category.
2. **Scorers.** Mastra scorers/evals over the dataset:
   - tool-selection accuracy;
   - **figure fidelity**: every figure in the answer appears verbatim in a tool result of that
     turn, checked mechanically, not by an LLM;
   - disclaimer presence;
   - incompleteness caveat when flags are set;
   - refusal correctness.
   Figure fidelity is the one that enforces the project's core principle.
3. **`ModerationProcessor` output classifier** with a custom category (for example
   `ungrounded-investment-claim`, `tax-evasion`) on the final result. It complements the Phase 0
   stream detector, not replaces it. It uses a small model, is configurable per execution profile,
   and runs only when the stream detector did not already decide.
4. **`PromptInjectionDetector` on input.** Tool results are data, not instructions. The risk grows
   when free text from imported files (exchange notes, memo fields) reaches a tool result, and in
   Phase 5 when retrieved documents do.
5. **PII redaction for metered providers.** Before a tool result leaves the machine to a cloud model,
   redact what the answer does not need: wallet addresses, exchange account ids, tx hashes. Local
   models skip it. The classification comes from the Phase 0 execution profile, so there is no new
   switch.
6. **Audit maintenance:** the Settings action to purge `ai_advisor_runs`, deferred in Phase 0. Add a
   cost/usage view over the audit rows (tokens per provider per month). No content, as in Phase 0 D4.
7. **CI integration.** A deterministic subset of the scorers runs in CI against a mocked model with
   recorded tool calls. The full run against a real model is an explicit local command, never
   automatic, because it costs tokens.

## Out of scope

- New capabilities for the advisor. This phase only measures and hardens what exists.
- Training or fine-tuning any model.

## Carried-over decisions

- Phase 0 D15 layers: (a) instructions and (b) stream detector with retry-then-refuse stay. This
  phase adds (c) the classifier and input detection.
- No telemetry leaves the machine (Phase 0 D10). Scorer results are stored locally, never exported
  to a hosted observability backend.
- Execution profiles (Phase 0 D16): classifier and redaction settings are per profile.

## Open decisions for `design.md`

- Where scorer results live: the ledger SQLite (like `ai_advisor_runs`) or the disposable
  `ai-advisor.db`. They are provenance-like, so probably the ledger. It needs a migration.
- Which model grades LLM-judged scorers. On a local-only setup this must work with Ollama.
- Classifier latency budget. It runs on the final result, so it cannot retract streamed text without
  a UX rule: hold the last paragraph, or accept a post-hoc `refused` that replaces the answer.
  Decide and specify in the chat spec.
- The redaction vocabulary and how to prove nothing sensitive leaves the machine (a test over every
  tool output schema).
- Dataset maintenance: who updates expected results when a use case changes legitimately.

## Capabilities (expected)

- New: `ai-advisor-evaluation`.
- Modified: `ai-advisor-agent` (processors, redaction), `ai-advisor-chat` (post-hoc refusal UX,
  purge and usage views), `database-migrations` (if scorer results persist in the ledger).

## Acceptance signal

A regression that makes the advisor round a figure, drop the disclaimer, or skip the incomplete-data
caveat fails a scorer, and that failure is proven by a deliberate break, per working-method rule 3.
