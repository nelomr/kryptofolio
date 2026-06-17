## ADDED Requirements

### Requirement: Fetch Drawdown Curve Data
The system SHALL provide a method to retrieve historical drawdown points for a given time range.

#### Scenario: Requesting valid drawdown data
- **WHEN** the `getDrawdownCurve` method is called with a valid `TimeRange`
- **THEN** it returns an array of `DrawdownPoint` objects where each `drawdownPercent` is less than or equal to 0.

### Requirement: Render Drawdown Curve Chart
The UI SHALL render a time-series area chart visualizing the drawdown curve.

#### Scenario: Displaying the chart
- **WHEN** the `DrawdownCurve` component receives data
- **THEN** it renders an area chart with a baseline at 0%, a stroke color of `var(--loss)`, and a fill gradient from `var(--loss-medium)` to `var(--loss)`.
