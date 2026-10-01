## Why

The advisor's thirteen read-only tools cannot answer common questions without the model doing arithmetic or guessing: a holding outside the `portfolio_summary` top-N, one account's holdings, a year-over-year tax comparison, derivatives PnL, where lots are held, what data is missing, or "what is my position worth if BTC hits X". The core invariant is that the LLM never produces a number, so every one of these answers needs a tool whose figures come from a use case.

## What Changes

The tool catalogue grows from 13 to about 27 `ADVISOR_TOOL_NAMES`, in three groups that are implemented in order, one group at a time.

- **Group 1, read wrappers** (thin wrappers over existing use cases and ports):
  - `holding_detail`: one holding by symbol from `GetPortfolioSummaryUseCase` (uncapped), not limited by the `portfolio_summary` top-N.
  - `account_holdings`: resolves an account **name** through `ledgerPort.getAccounts` (non-synthetic accounts only), then reads the summary for that `accountId`. The model still never sends an account id.
  - `tax_year_comparison`: `GetSpanishTaxReportUseCase` for two years, reporting the incompleteness of each year rather than hiding it.
  - `derivatives_pnl`: `portfolioAnalyticsPort.getDerivativesPnl`, which has no tool today.
  - `custody_locations`: `ITaxCalculatorPort.getLotCustodyLocations`.
  - `data_gaps`: combines summary `unvalued` holdings with fiscal-integrity rows. No new SQL.
  - `explain_metric`: static metric definitions held in the backend (today they exist only in frontend i18n).
- **Group 2, scenarios** through a new domain use case that uses core-domain `Money` (`mul`/`div`). Division by zero is a typed error. No `Decimal`/`Money` arithmetic lives in the AI subtree.
  - `scenario_position_value`: symbol plus a user-supplied hypothetical unit price. Quantity always comes from the ledger. Returns position value, delta versus current value, and implied allocation.
  - `breakeven_price`: average unit cost, guarded when the cost basis cannot be converted.
  - `scenario_portfolio_shock`: uniform or per-asset percentage shock.
  - `concentration_risk`: top-1 and top-3 weight and HHI.
- **Group 3, activity**:
  - `tx_search`: a new read use case over `getSpotTransactions` with edit overrides applied. `withOverrideView` moves out of `routes/tax.ts` into that use case, so the route and the tool share it. Filters by symbol, date and type, paginated like `token_lots`.
  - `fees_paid` (by exchange and year) and `cash_flow_summary` (fiat in, fiat out, current value). **Gate:** during design, fee and cash-flow figures are measured against real exchange files per source. Any tool whose figures are unreliable for a source is dropped from scope before implementation.
- **Cross-cutting**: design decides which tools each execution profile exposes, because small local models degrade with large tool lists. `buildTaxAnalystInstructions` tells the model never to do arithmetic and to use the scenario tools instead. `docs/ai-advisor.md` section 9 is updated.
- **Out of scope**: `scenario_sale_pnl`; allocation models and target trades (`add-ai-advisor-investment-analyst`); unrealized tax exposure; tax-loss harvesting; IRPF brackets; Modelo 721 (rule-based, Phase 5 RAG); the cost/token footer (Phase 3); any write tool.

## Capabilities

### New Capabilities
- `portfolio-scenario-analysis`: the domain use case for hypothetical position value, breakeven price, portfolio shock and concentration metrics, with typed errors for division by zero and unconvertible cost basis.
- `spot-transaction-search`: a read use case that returns spot transactions with edit overrides applied, filtered and paginated, shared by the tax route and the advisor.

### Modified Capabilities
- `ai-advisor-agent`: the tool catalogue, its per-profile exposure, the account-name resolution rule (still no account id input), and the no-arithmetic instruction.

## Impact

- **Backend**: `apps/backend/src/core/infrastructure/ai/tools/` (new tools), `toolSurface.spec.ts` (count 13 to about 27), `di/advisorComposition.ts`, `buildTaxAnalystInstructions`, `routes/tax.ts` (`withOverrideView` extracted), new use cases under `application/use-cases/`.
- **Shared/domain**: `packages/shared-types/src/advisor-stream.ts` (`ADVISOR_TOOL_NAMES`); scenario logic uses `packages/core-domain` `Money`.
- **Docs**: `docs/ai-advisor.md` tool catalogue, currency rules and execution profiles.
- **Rules**: rule 3 (scenario logic lives in a use case; the AI subtree has no math library); rule 4 (all money is `Money`/`PreciseAmount`, never a float); rule 5 (scenario and lookup results are discriminated unions, such as unconvertible cost basis or unknown symbol or account); rule 6 (`custody_locations` reads the custody ledger and `tax_year_comparison` reads tax FIFO. They stay separate tools, and nothing reorders or merges the two orderings); rule 7 (`fees_paid` and `cash_flow_summary` depend on per-source fee and gross/net conventions from `sourceProfile`, with no global fallback, so they are gated on real-file measurement).
- **Currency**: base currency flows through `advisorRequestContext` (`AskAdvisorUC.ts:54`). Tax tools stay EUR.
- **Ordering**: `performance-history-display-currency` should land first. `unify-holdings-and-kpi-cost-basis-trust` changes `getHoldingsSnapshot`, which `holding_detail` and `breakeven_price` read, so it should land first too, or design must state the dependency. This change does not edit the pending `add-ai-advisor-*` changes.

## Open questions

1. **Account roll-up.** Should `account_holdings` include child accounts of a parent account (`account-hierarchy`)?
2. **Stablecoins in concentration.** Are stablecoins counted, excluded or reported separately in `concentration_risk`?
3. **Per-profile exposure.** Which tools does each execution profile get, and is that selection static or configurable?
4. **Group 3 gate result.** Which sources have reliable fee and cash-flow figures, and does a partial result ship per source or not at all?
