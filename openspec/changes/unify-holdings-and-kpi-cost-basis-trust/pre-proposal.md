# Pre-proposal — one trust rule for cost basis across holdings and KPIs

> **Status: pre-proposal.** Not a formal OpenSpec proposal; do not apply. It records what was found
> while closing the `portfolio_summary` totals gap in `add-ai-portfolio-advisor` (design D14), so the
> formal artifacts start from evidence. Items marked **[confirm]** were reported during that work but
> not re-verified against the code or real data.

**Depends on:** `add-ai-portfolio-advisor` archived (it documents the symptom as an accepted caveat).

## Why

Two code paths answer "what is my cost basis?" and they disagree about which lots count:

- `DuckDbMetricsAdapter.getKpis` builds `totalCostBasis` from `TRUSTWORTHY_OPEN_LOTS`, which drops open
  lots whose `quality_flag` is `NEGATIVE_COST_BASIS` or `MISSING_PRICE` (`UNTRUSTWORTHY_BASIS_FLAGS`)
  and only counts them (`flagged_lots`).
- `DuckDbPortfolioAnalyticsAdapter.getHoldingsSnapshot` builds each holding's `total_cost_fiat` from
  open lots filtered by `status` only. **[confirm]** that no `quality_flag` filter applies anywhere in
  that query.

Consequence: whenever a flagged lot exists, a holding's cost basis and unrealized PnL include a figure
the dashboard KPIs deliberately refuse to aggregate. A `MISSING_PRICE` lot is stored as `0`, so it reads
as "acquired for free" and inflates that holding's unrealized PnL. The two surfaces can show different
numbers for the same portfolio with no explanation.

## Known symptom

`portfolio_summary` (advisor) now derives equity, cost basis and unrealized PnL from its holdings, so
its totals are internally consistent but can differ from the `kpis` tool and the dashboard when
`flagged_lots > 0`. Accepted for the advisor in D14; the UI holdings table has the same class of
mismatch against the UI KPI cards and is unchanged.

## Questions to investigate

1. **Which behavior is correct per holding?** Exclude the flagged lot from the holding's basis, keep it
   and surface the flag, or show the holding as "cost basis incomplete" (a third state, not a number)?
   Excluding silently would make a holding's quantity and its basis describe different lots.
2. **Quantity vs basis.** The KPI path excludes a flagged lot's cost but its quantity may still count
   toward valuation. **[confirm]** whether `VALUATION_CONVERTED` (equity) includes flagged-lot
   quantity. If it does, KPI equity and KPI cost basis already cover different lot sets, and
   "unrealized = equity − cost" mixes them.
3. **Scope of the account filter.** Holdings can be scoped by `accountId`; KPIs never are. Is that
   intended, or a second source of divergence independent of flagged lots?
4. **Where should the rule live?** Today the exclusion is a SQL string constant inside one adapter.
   Candidates: a shared DuckDB view both adapters read, or a domain-level classification so the trust
   decision is declared once and not re-implemented per query.
5. **How common is it in real data?** Measure `flagged_lots` and affected holdings on a `.backup`
   copy of a real database, never on the live one. The answer decides whether this is a correctness
   fix or a documentation fix.

## Directions (not decisions)

- **A. Share the rule:** one trusted-lots relation consumed by both adapters; holdings then agree with
  KPIs by construction. Smallest conceptual change; changes the UI holdings numbers.
- **B. Model the third state:** per-holding cost basis as a discriminated union
  (`trusted` | `partial`/`excluded-lots`) so flagged lots are visible instead of dropped or silently
  included. Larger; touches the holdings DTOs, the UI and the advisor output schema. Fits CLAUDE.md
  rule 5 (a union over flag-plus-optional-payload).
- **C. Document only:** keep both behaviors, label the difference in the UI and tool descriptions.
  Cheapest; leaves the inconsistency.

No direction is chosen here.

## Constraints to carry

- Tax/FIFO ordering is untouched (CLAUDE.md rule 6). This is about which open lots feed a *display*
  aggregate, not about realized gains or lot matching.
- Money stays `PreciseAmount`/`Money`; no float arithmetic introduced to reconcile figures.
- A nullable/unresolved figure is a real state; do not collapse it into `0` (the `MISSING_PRICE`
  storage convention is exactly that bug shape).
- Verify any claim about flagged lots against real exports before writing it into a spec (CLAUDE.md
  working method 5).

## Out of scope

- Changing how `quality_flag` values are assigned during ingestion or normalization.
- The FIFO engine, custody ledger, or realized PnL.
- The advisor's tool surface beyond adopting whatever the holdings/KPI rule becomes.
