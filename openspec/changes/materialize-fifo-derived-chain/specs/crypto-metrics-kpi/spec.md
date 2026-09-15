## MODIFIED Requirements

### Requirement: Fix Cost Basis Calculation
The backend `DuckDbMetricsAdapter.getKpis()` SHALL calculate `totalCostBasis` from `v_calculated_tax_lots` (summing `remaining_qty * unit_cost_fiat` for lots with status `OPEN` or `PARTIAL`) instead of the current incorrect formula `running_balance * close_price` which equals market value. It SHALL read the materialized derived chain directly and SHALL NOT recompute the FIFO, and SHALL NOT pin intermediate results into session temporary tables.

#### Scenario: Cost basis reflects actual acquisition costs
- **GIVEN** the portfolio has open tax lots with known unit costs
- **WHEN** the client invokes `GET /api/metrics/kpis`
- **THEN** `totalCostBasis` SHALL equal the sum of `remaining_qty * unit_cost_fiat` across all OPEN/PARTIAL lots
- **AND** `totalUnrealizedPnl` SHALL equal `totalEquity - totalCostBasis`

#### Scenario: KPI computation reads the materialized chain
- **WHEN** `getKpis()` executes
- **THEN** its queries MUST read the public derived relations backed by materialized tables
- **AND** they MUST NOT re-execute the FIFO matching computation

## ADDED Requirements

### Requirement: A KPI Response Reflects Exactly One Currency

`getKpis()` SHALL compute every figure in a single requested currency, and SHALL be free of connection-scoped session state so that a concurrent request for a different currency cannot influence it. It SHALL NOT create temporary tables.

#### Scenario: No temporary tables are emitted

- **WHEN** the SQL statements emitted by `getKpis()` are captured for a single call
- **THEN** none MUST be a `CREATE ... TEMP TABLE` or `CREATE OR REPLACE TEMP TABLE` statement

#### Scenario: Concurrent requests in different currencies do not mix

- **WHEN** `GET /api/metrics/kpis?currency=USD` and `GET /api/portfolio/summary` in base EUR are served concurrently
- **THEN** each response's figures MUST be internally consistent in exactly one currency
- **AND** neither response MUST contain a figure denominated in the other's currency
