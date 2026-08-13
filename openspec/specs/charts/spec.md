# Charts Specification

## Purpose

The chart surface as a whole: performance and allocation visualisation, conditional rendering, and the TDD requirement that covers them.

## Requirements

### Requirement: Performance Chart Visualization
The system SHALL display an interactive area chart using `lightweight-charts` for portfolio performance.

#### Scenario: Displaying performance data
- **WHEN** performance data is available from the portfolio composable
- **THEN** the performance chart is rendered taking 2 columns in large screens, styled with a transparent background and hidden grid lines

### Requirement: Asset Allocation Visualization
The system SHALL display a doughnut chart using `vue-chartjs` representing token weight distribution.

#### Scenario: Displaying allocation data
- **WHEN** asset allocation data is available from the portfolio composable
- **THEN** the allocation chart is rendered taking 1 column in large screens, styled as a thin ring (80% cutout) with custom tooltips

### Requirement: Conditional Chart Rendering
The system SHALL prevent mounting chart components when the underlying data arrays are empty.

#### Scenario: Waiting for data
- **WHEN** the portfolio data is not yet loaded
- **THEN** the charts are hidden to avoid blank canvas rendering errors

### Requirement: Test-Driven Development (TDD)
The charts implementation SHALL be covered by tests following a TDD workflow.

#### Scenario: Validating components
- **WHEN** the test suite runs
- **THEN** tests validating the chart components mounting and prop handling pass successfully
