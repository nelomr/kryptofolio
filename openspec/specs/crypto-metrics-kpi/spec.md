# Crypto Metrics KPI Specifications

## Purpose
This specification defines the frontend integration and backend logic for the Crypto Metrics KPI dashboard cards, including calculations for ROI, drawdown, win rates, and best/worst assets.
## Requirements
### Requirement: KPI Dashboard Initialization
The system SHALL present 4 primary KPI cards displaying Total ROI, Max Drawdown, Win Rate, and Best/Worst Asset on the metrics dashboard.

#### Scenario: Displaying KPIs on load
- **WHEN** the user navigates to the Crypto Metrics dashboard
- **THEN** the system SHALL invoke the `ICryptoMetricsRepository` to fetch the `CryptoKpis` data and render the cards

### Requirement: Anti-Corruption Validation
The system SHALL validate any external KPI payload using Zod before allowing it into the Domain layer.

#### Scenario: Safely handling dirty data
- **WHEN** the infrastructure adapter receives an external response
- **THEN** it SHALL parse the response through `CryptoKpisSchema` and securely map it to the `CryptoKpis` entity

### Requirement: UI Component Design
The system SHALL display the KPI values using the strict styling tokens, including `text-profit` for positive numbers, `text-loss` for negative numbers, and `font-mono` for specific numbers.

#### Scenario: Rendering styled KPI data
- **WHEN** the KPI cards receive numeric data
- **THEN** the UI SHALL appropriately color code the output and present it with tabular monospace fonts without relying on generic color palettes

### Requirement: Fix Cost Basis Calculation
The backend `DuckDbMetricsAdapter.getKpis()` SHALL calculate `totalCostBasis` from `v_calculated_tax_lots` (summing `remaining_qty * unit_cost_fiat` for lots with status `OPEN` or `PARTIAL`) instead of the current incorrect formula `running_balance * close_price` which equals market value.

#### Scenario: Cost basis reflects actual acquisition costs
- **GIVEN** the portfolio has open tax lots with known unit costs
- **WHEN** the client invokes `GET /api/metrics/kpis`
- **THEN** `totalCostBasis` SHALL equal the sum of `remaining_qty * unit_cost_fiat` across all OPEN/PARTIAL lots
- **AND** `totalUnrealizedPnl` SHALL equal `totalEquity - totalCostBasis`

---

### Requirement: Total ROI Calculation (Unrealized + Realized)
The system SHALL compute `totalRoiFiat = totalUnrealizedPnlFiat + totalRealizedPnlFiat` and `totalRoiPercent = (totalRoiFiat / totalCostBasis) * 100`.

#### Scenario: ROI includes both unrealized and realized PnL
- **GIVEN** the portfolio has both open holdings and closed disposals with realized gains
- **WHEN** the client invokes `GET /api/metrics/kpis`
- **THEN** `totalRoiFiat` SHALL be the sum of unrealized and realized PnL
- **AND** `totalRoiPercent` SHALL be `(totalRoiFiat / totalCostBasis) * 100`

#### Scenario: ROI with zero cost basis
- **WHEN** `totalCostBasis` equals 0
- **THEN** `totalRoiPercent` SHALL be 0

---

### Requirement: 24h Equity Delta
The backend SHALL compute `delta24hFiat` as the difference between the latest day's total portfolio value and the previous day's total portfolio value.

#### Scenario: Normal multi-day portfolio
- **GIVEN** at least 2 days of valuation data exist in `v_portfolio_daily_valuation`
- **WHEN** the client invokes `GET /api/metrics/kpis`
- **THEN** `delta24hFiat` SHALL equal `SUM(daily_value) on MAX(date) - SUM(daily_value) on second-to-last date`

#### Scenario: Single day or empty portfolio
- **GIVEN** fewer than 2 days of data exist
- **WHEN** the client invokes `GET /api/metrics/kpis`
- **THEN** `delta24hFiat` SHALL be 0

---

### Requirement: Fiat Drawdown & Recovery
The backend SHALL compute `maxDrawdownFiat` and `recoveredFiat` from `v_portfolio_ath_drawdown`.

#### Scenario: Computing max drawdown in fiat
- **WHEN** the client invokes `GET /api/metrics/kpis`
- **THEN** `maxDrawdownFiat` SHALL equal `MIN(total_daily_value - rolling_ath)` across all dates (always ≤ 0)

#### Scenario: Computing recovery from trough
- **WHEN** the client invokes `GET /api/metrics/kpis`
- **THEN** `recoveredFiat` SHALL equal `currentEquity - troughEquity` where troughEquity is `MIN(total_daily_value)` since the ATH date

#### Scenario: No drawdown exists (monotonically increasing portfolio)
- **WHEN** drawdown is always 0
- **THEN** `maxDrawdownFiat` SHALL be 0 and `recoveredFiat` SHALL be 0

---

### Requirement: Trade Win Rate & R-Multiple
The backend SHALL compute trade statistics from closed spot disposals (FIFO matches) and futures realized PnL.

#### Definition: Trade
A "trade" is defined as one FIFO match row from `v_calculated_lot_history_events` (spot) or one row from `v_futures_realized_pnl` (futures). A single disposal against 3 acquisition lots counts as 3 trades.

#### Scenario: Computing win rate
- **WHEN** the client invokes `GET /api/metrics/kpis`
- **THEN** `totalTrades` SHALL count all trades (spot + futures)
- **AND** `winningTrades` SHALL count trades with `gain_loss_fiat > 0` (spot) or `pnl_fiat - fee_fiat > 0` (futures)
- **AND** `losingTrades` SHALL count trades with `gain_loss_fiat < 0` (spot) or `pnl_fiat - fee_fiat < 0` (futures)
- **AND** `winRatePercent` SHALL equal `(winningTrades / totalTrades) * 100`

#### Scenario: Computing average R-multiple
- **WHEN** there are both winning and losing trades
- **THEN** `averageR` SHALL equal `AVG(gain of winning trades) / AVG(|loss of losing trades|)`

#### Scenario: No losing trades (division by zero)
- **WHEN** `losingTrades` equals 0
- **THEN** `averageR` SHALL be 0

#### Scenario: No trades at all
- **WHEN** no closed disposals or futures PnL exist
- **THEN** all trade metrics SHALL be 0

---

### Requirement: Best & Worst Performing Assets
The backend SHALL identify the best and worst performing assets by unrealized ROI percentage from open tax lot positions.

#### Scenario: Multiple assets with open lots
- **GIVEN** at least 2 distinct assets have OPEN/PARTIAL tax lots
- **WHEN** the client invokes `GET /api/metrics/kpis`
- **THEN** `bestAsset` SHALL contain the symbol, name, allocation %, and ROI % of the asset with highest `((marketValue - costBasis) / costBasis) * 100`
- **AND** `worstAsset` SHALL contain the same fields for the asset with lowest ROI %
- **AND** market value SHALL be computed from `remaining_qty * latestPrice` using the latest `historical_prices` per symbol

#### Scenario: Single asset or no open lots
- **WHEN** fewer than 2 distinct assets have open lots
- **THEN** `bestAsset` and `worstAsset` SHALL be null

---

### Requirement: UI Dynamic Metric Binding
The `CryptoKpiCards.vue` component SHALL bind all displayed values dynamically to the validated KPI payload, removing any static fallback numbers or hardcoded test values (specifically the hardcoded `-1820.40` on line 63).

#### Scenario: Rendering live metrics in KPI cards
- **WHEN** valid KPI data is received by the frontend
- **THEN** the UI SHALL render the calculated 24h delta, fiat drawdown & recovery, win rate breakdown, and best/worst asset ROI cards without default placeholders

---

### Requirement: Frontend DTO ROI Fix
The `CryptoMetricsSchemas.ts` Zod transform SHALL compute `totalRoiFiat` as `totalUnrealizedPnlFiat + totalRealizedPnlFiat` (not just unrealized) and `totalRoiPercent` as `(totalRoiFiat / totalCostBasisFiat) * 100`.

#### Scenario: Correct DTO calculation
- **WHEN** the backend returns valid payload
- **THEN** totalRoiFiat and totalRoiPercent SHALL be correctly computed by Zod

