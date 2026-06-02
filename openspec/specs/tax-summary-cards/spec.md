## ADDED Requirements

### Requirement: Display Fiscal Metrics Grid
The system SHALL display a grid with key fiscal metrics: Capital Gains, Yields, Total Losses, and Estimated IRPF.

#### Scenario: Metrics grid renders with formatted values
- **WHEN** the component is mounted with valid data
- **THEN** the values are correctly formatted using `useFormatters.ts` and styled consistently with Portfolio metrics.
