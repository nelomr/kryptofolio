## ADDED Requirements

### Requirement: Chart Timeframe Filtering
The application SHALL provide timeframe filters (1D, 1W, 1M, YTD, ALL) for historical performance charts.

#### Scenario: User selects a timeframe filter
- **WHEN** the user clicks on a timeframe button (e.g., "1M")
- **THEN** the chart's visible range updates via `setVisibleRange` to only show data for the selected period.
- **THEN** the selected button is visually highlighted.
