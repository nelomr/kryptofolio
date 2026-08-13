# Portfolio Visualization Specification

## Purpose

Portfolio layout and theming.

## Requirements

### Requirement: Portfolio Layout and Theme
The portfolio charts MUST render using the "The Executive" Light Theme, prioritizing minimalism.

#### Scenario: Line chart rendering in Light Theme
- **WHEN** the `PerformanceLineChart` is rendered
- **THEN** it displays as an Area Series with a soft blue gradient (`topColor`, `bottomColor`).
- **THEN** grid lines and axes text are hidden by default.

#### Scenario: Line chart axes reveal on hover
- **WHEN** the user hovers over the `PerformanceLineChart`
- **THEN** the text for the axes appears dynamically.

#### Scenario: Doughnut chart rendering in Light Theme
- **WHEN** the `AssetAllocationChart` is rendered
- **THEN** it displays without a native legend and renders the total portfolio value text overlaid in the center using absolute HTML positioning.
