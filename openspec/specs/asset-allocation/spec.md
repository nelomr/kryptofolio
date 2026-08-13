# Asset Allocation Specification

## Purpose

Allocation visualisation, its custom legend, and the HHI diversification metric.

## Requirements

### Requirement: Asset Allocation Visualization
The system SHALL display a Donut chart visualizing the current asset allocation of the portfolio.

#### Scenario: Rendering the Donut Chart
- **WHEN** the user navigates to the "metrics" tab in the portfolio view
- **THEN** the system fetches the asset allocation data via `ICryptoMetricsRepository`
- **THEN** the Donut chart renders proportional arcs for each asset based on their allocation percentages

### Requirement: Custom Allocation Legend
The system SHALL display a custom Vue-based legend alongside the Donut chart.

#### Scenario: Displaying legend items
- **WHEN** the asset allocation data is successfully loaded
- **THEN** the legend lists each asset with its ticker, allocation percentage, and fiat value
- **THEN** the legend item colors match their corresponding arcs in the Donut chart

### Requirement: Diversification Metric (HHI)
The system SHALL display the Herfindahl-Hirschman Index (HHI) score to represent portfolio diversification.

#### Scenario: Rendering HHI
- **WHEN** the metrics tab is active
- **THEN** the system displays the HHI score prominently below or beside the chart alongside the Total Assets value
- **THEN** the HHI score uses the `.num` typographic class for tabular numbers
