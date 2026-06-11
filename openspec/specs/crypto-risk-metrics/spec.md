# crypto-risk-metrics Specification

## Purpose
TBD - created by archiving change crypto-sharpe-ratio. Update Purpose after archive.
## Requirements
### Requirement: Display Risk Metrics Summary
The system SHALL present Sharpe Ratio, Sortino Ratio, Beta vs BTC, and Alpha as a summary.

#### Scenario: Displaying positive risk metrics
- **WHEN** the user views the crypto dashboard
- **THEN** the system displays the risk metrics card with Sharpe Ratio, Sortino Ratio, Alpha, and Beta.
- **AND** positive/excellent metric values are styled with profit/success indicators.

#### Scenario: Displaying negative risk metrics
- **WHEN** the portfolio risk metrics evaluate to poor performance (e.g., negative Sharpe)
- **THEN** the metric values are styled with warning or loss indicators.

### Requirement: Rolling Sharpe Visual Gauge
The system SHALL visualize the rolling Sharpe Ratio using an SVG chart or gauge with color-coded threshold zones (e.g., Excellent, Acceptable, Loss).

#### Scenario: Rendering the Sharpe Gauge
- **WHEN** the risk metrics card is loaded
- **THEN** an SVG or CSS-based gauge is rendered indicating the current Sharpe Ratio against the defined thresholds.

### Requirement: Domain Integrity and Validation
The system SHALL fetch metrics via the `ICryptoMetricsPort` and validate external payloads against the `RiskMetricsSchema`.

#### Scenario: Successful data validation
- **WHEN** the repository fetches risk metrics
- **THEN** the `RiskMetricsSchema` parses the payload successfully and returns a typed `RiskMetrics` entity.

#### Scenario: Failed data validation
- **WHEN** the payload format from the backend is invalid
- **THEN** the Zod schema parsing fails and emits a controlled error, preventing UI crashes.

