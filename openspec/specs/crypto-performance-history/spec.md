# Crypto Performance History Specification

## Purpose

Performance history retrieval, its chart, and time-range filtering.
## Requirements
### Requirement: Performance History Data Retrieval
The system SHALL provide an API endpoint or repository method to fetch historical performance points based on a given time range (1D, 1W, 1M, 1Y, ALL) and a display currency bound as a per-call parameter. Each point SHALL carry `date`, `portfolioValue` and `drawdownPct`; it SHALL NOT carry a cost basis. `portfolioValue` SHALL be the point's canonical EUR daily value multiplied by the latest stored `EUR/<display currency>` rate dated on or before that point's own date, or the EUR value unchanged where the display currency is `EUR`. A point SHALL be unconvertible only when the display currency differs from `EUR` and no stored rate exists on or before its date; the `portfolioValue` of an unconvertible point SHALL be `null`, and SHALL NOT be the EUR value, `0`, a later rate's product, or any other substitute. `drawdownPct` SHALL remain derived from the canonical EUR series regardless of the display currency, because it is a ratio. Currency conversion SHALL NOT alter the set of dates returned, the valuation, FIFO or custody computations, or the stored ledger.

#### Scenario: Fetching 1Y performance history
- **WHEN** the system requests performance history with the range '1Y'
- **THEN** it receives a list of performance points bounded to the last 365 days, each carrying `date`, `portfolioValue` and `drawdownPct`

#### Scenario: Points are converted at their own date's rate
- **WHEN** performance history is requested in `USD` and the stored `EUR/USD` rate is `1.05` on one point's date and `1.15` on another point's date
- **THEN** the first point's `portfolioValue` MUST equal its EUR value multiplied by `1.05`
- **AND** the second point's `portfolioValue` MUST equal its EUR value multiplied by `1.15`
- **AND** the series MUST NOT be scaled by a single uniform rate

#### Scenario: A date without a published rate resolves the preceding one
- **WHEN** a point falls on a Sunday for which no `EUR/USD` rate is stored and the preceding Friday holds `1.08`
- **THEN** that point's `portfolioValue` MUST be its EUR value multiplied by `1.08`

#### Scenario: EUR display is the identity
- **WHEN** performance history is requested in `EUR`
- **THEN** every `portfolioValue` MUST equal the canonical EUR daily value exactly
- **AND** no stored FX rate MUST be required for any point

#### Scenario: A point before the first stored rate is unconvertible
- **WHEN** performance history is requested in `USD` and a point's date precedes the earliest stored `EUR/USD` rate
- **THEN** that point's `portfolioValue` MUST be `null`
- **AND** it MUST NOT equal the point's EUR value
- **AND** it MUST NOT be `0`
- **AND** the point MUST still appear in the series with its `date`

#### Scenario: A currency with no stored rates at all
- **WHEN** performance history is requested in a currency for which no rate is stored on any date
- **THEN** every point's `portfolioValue` MUST be `null`
- **AND** the response MUST NOT fall back to EUR values

#### Scenario: A day on which no held asset is priced
- **WHEN** performance history is requested in any currency, including `EUR`, and no held asset has a price on a point's date
- **THEN** that point's `portfolioValue` MUST be `null`
- **AND** the request MUST NOT fail
- **AND** it MUST NOT be `0`

#### Scenario: Drawdown stays derived from the EUR series
- **WHEN** the same range is requested in `EUR` and in `USD`
- **THEN** each point's `drawdownPct` MUST be identical in both responses

#### Scenario: The currency is not retained between calls
- **WHEN** performance history is requested in `USD` and then, with no other action, in `EUR`
- **THEN** the second response MUST contain EUR values
- **AND** no DuckDB-side state set by the first call MUST influence it

### Requirement: Performance Chart Visualization
The UI SHALL render an interactive area chart representing the portfolio's total value in the user's display currency. The total cost basis, when available, SHALL appear in the card description sourced from the KPIs, and SHALL be omitted while the KPI query is loading or has failed. The UI SHALL NOT convert any value itself and SHALL NOT substitute `0` for an absent `portfolioValue`; a point whose `portfolioValue` is `null` SHALL be rendered as a gap or a marked point, never as a plotted value.

#### Scenario: Hovering over the chart
- **WHEN** the user hovers the cursor over the performance chart
- **THEN** a tooltip is displayed showing the exact date and total value for that specific point in time.

#### Scenario: An unconvertible point is not plotted as zero
- **WHEN** the series contains a point whose `portfolioValue` is `null`
- **THEN** the chart MUST NOT draw that point at a value of `0`
- **AND** the point MUST be rendered as a gap or as a visibly marked unconvertible point

#### Scenario: A missing value survives the wire contract
- **WHEN** the frontend parses a response whose point carries `portfolioValue: null`
- **THEN** the parsed point MUST carry `null`
- **AND** it MUST NOT carry `0`

#### Scenario: The chart follows the display currency
- **WHEN** the user's display currency changes from `EUR` to `USD`
- **THEN** the next performance-history request MUST be made for `USD`
- **AND** the plotted values MUST be the backend's USD values, with no client-side multiplication

### Requirement: Time Range Filtering
The UI SHALL provide a time filter control allowing the user to switch between predefined time ranges (1D, 1W, 1M, 1Y, ALL).

#### Scenario: Switching to 1M view
- **WHEN** the user clicks on '1M' in the time filter
- **THEN** the chart updates to display only the data points from the last 30 days.

