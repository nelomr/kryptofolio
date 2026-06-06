## ADDED Requirements

### Requirement: Performance History Data Retrieval
The system SHALL provide an API endpoint or repository method to fetch historical performance points based on a given time range (1D, 1W, 1M, 1Y, ALL).

#### Scenario: Fetching 1Y performance history
- **WHEN** the system requests performance history with the range '1Y'
- **THEN** it receives a list of performance points (`timestamp`, `valueFiat`, `costBasisFiat`) bounded to the last 365 days.

### Requirement: Performance Chart Visualization
The UI SHALL render an interactive area chart representing the portfolio's total value compared against the cost basis.

#### Scenario: Hovering over the chart
- **WHEN** the user hovers the cursor over the performance chart
- **THEN** a tooltip is displayed showing the exact date, total value, and cost basis for that specific point in time.

### Requirement: Time Range Filtering
The UI SHALL provide a time filter control allowing the user to switch between predefined time ranges (1D, 1W, 1M, 1Y, ALL).

#### Scenario: Switching to 1M view
- **WHEN** the user clicks on '1M' in the time filter
- **THEN** the chart updates to display only the data points from the last 30 days.
