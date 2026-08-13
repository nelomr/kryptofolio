# Custom Chart Legends Specification

## Purpose

Chart legends rendered as HTML rather than drawn on the canvas.

## Requirements

### Requirement: Custom HTML Chart Legends
The application SHALL render external HTML legends for charts like Asset Allocation (Doughnut) instead of native canvas legends, to allow rich styling and reactivity.

#### Scenario: Doughnut chart displays custom legend
- **WHEN** the Asset Allocation chart renders
- **THEN** a custom HTML list is displayed alongside it containing each asset's name, color indicator, and 24h percentage change.
- **THEN** hovering over an item in the HTML legend highlights the corresponding slice in the Doughnut chart.
