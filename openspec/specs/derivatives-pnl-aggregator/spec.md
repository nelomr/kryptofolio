# Derivatives Pnl Aggregator Specification

## Purpose

Aggregating realised profit and loss from derivatives positions.
## Requirements
### Requirement: Derivatives Profit and Loss Aggregation
The system SHALL calculate performance metrics for Futures and Derivatives directly by summing `realizedPnl`, `funding`, and `fees` grouped by contract/asset, entirely bypassing the Spot FIFO matching logic.

This aggregation serves **portfolio performance metrics only**. It SHALL NOT be the source of any figure in the fiscal report: the per-contract aggregate is published on the portfolio surface (`/api/portfolio/derivatives/pnl`), and the tax report's derivatives ledger SHALL be served from per-transaction futures data (`/api/tax/transactions/futures`) instead. No tax route SHALL serve the aggregate.

The three summed field names above are the **aggregate's own** fields, required and always present on its emitter (`DerivativesPnl`, `DuckDbPortfolioAnalyticsAdapter.getDerivativesPnl`). They SHALL NOT be read as a statement about the per-transaction fiscal feed, whose emitter is a different one: on `LedgerFuturesTransaction` the corresponding monetary keys (`realized_pnl`, `funding_amount`, `fee_amount`, and likewise `amount` and `trade_price`) are **optional on the wire**, and their absence means *unknown* rather than a source-declared zero — a declared zero is persisted as `'0'` and arrives as `'0'`, while absence is reachable only through a SQL `NULL`. How the consuming entity types those fields — including whether they become a nullable value object — is outside this capability and outside this change, which retypes no entity field.

#### Scenario: Closing a long perpetual position
- **WHEN** the engine encounters a Futures transaction type with €500 profit, €10 funding paid, and €5 fee
- **THEN** it aggregates a Net PnL of €485 for that specific contract
- **THEN** the Spot FIFO tracking for the underlying asset (e.g., BTC) remains completely unaffected

#### Scenario: The aggregate is reachable only on the portfolio surface
- **WHEN** the published HTTP surface is enumerated
- **THEN** the per-contract derivatives aggregate MUST be served by the portfolio route `/api/portfolio/derivatives/pnl`
- **AND** no route under `/api/tax/` MUST serve it
- **AND** the aggregating port method and its query MUST remain available and unchanged for that portfolio route

#### Scenario: The fiscal derivatives table is not fed by the aggregate
- **WHEN** the tax report's derivatives table is populated
- **THEN** each rendered row MUST correspond to one individual futures transaction, carrying its own `id`, operation type, timestamp, exchange and status
- **AND** no rendered row MUST be a sum across several transactions

### Requirement: A Cross-Year, Cross-Currency Aggregate Is Not a Declarable Figure
An aggregate that lacks a fiscal-year dimension, or whose currency label is chosen rather than converted, SHALL NOT be presented as a fiscal figure anywhere in the tax report — not directly, and not through a purpose-built entity that renders it.

The derivatives aggregate exhibits both defects, measured at the emitter (`DuckDbPortfolioAnalyticsAdapter.getDerivativesPnl`): it groups by `ft.symbol` alone, so every fiscal year collapses into one row, while IRPF is declared per year and the tax view filters by year; and it labels the sum with `COALESCE(MAX(ft.fiat_currency), $targetCurrency)`, so a row summing USD and EUR amounts carries whichever currency code sorts highest, with no conversion performed. This is why serving the tax report from the aggregate is wrong on fiscal grounds and not merely on parsing grounds: even a shape that parsed cleanly would print a number that must not be declared.

#### Scenario: An all-years aggregate cannot answer a per-year fiscal query
- **WHEN** a fiscal surface is filtered to a single declaration year
- **THEN** its rows MUST derive from data carrying a per-row timestamp that the year filter can apply
- **AND** a row produced by a grouping with no year dimension MUST NOT appear in that surface

#### Scenario: A currency label chosen by MAX() is rejected as fiscal output
- **WHEN** an aggregate row's currency is derived by picking one code from the grouped rows rather than by converting all amounts to a single currency
- **THEN** that row MUST NOT be rendered as a fiscal amount
- **AND** the defect MUST be recorded against the aggregate rather than masked by the consumer

#### Scenario: Building an entity around the aggregate does not make it declarable
- **WHEN** a dedicated aggregate entity is proposed as the tax derivatives table's source
- **THEN** it MUST be rejected while the aggregate lacks a year dimension and a converted currency
- **AND** it MAY be reconsidered only once both defects are fixed, and then only as an addition beside the per-transaction table, never as its source

