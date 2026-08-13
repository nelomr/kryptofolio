# Crypto Volatility Heatmap Specification

## Purpose

The volatility heatmap and the UI standards it must meet.

## Requirements

### Requirement: Volatility Heatmap Display
The system SHALL display a volatility heatmap grid component within the metrics tab. The grid MUST map return percentages to predefined institutional semantic color tokens.

#### Scenario: Displaying profitable days
- **WHEN** a day's return percentage is greater than +5%
- **THEN** the grid cell for that day SHALL be rendered using the `--profit` semantic token.

#### Scenario: Displaying moderate profit days
- **WHEN** a day's return percentage is between 0% and +5%
- **THEN** the grid cell for that day SHALL be rendered using the `--profit-medium` semantic token.

#### Scenario: Displaying moderate loss days
- **WHEN** a day's return percentage is between -5% and 0%
- **THEN** the grid cell for that day SHALL be rendered using the `--loss-medium` semantic token.

#### Scenario: Displaying high loss days
- **WHEN** a day's return percentage is less than -5%
- **THEN** the grid cell for that day SHALL be rendered using the `--loss` semantic token.

#### Scenario: Tooltip on hover
- **WHEN** the user hovers over a grid cell
- **THEN** the system SHALL display a tooltip showing the exact date and percentage return using tabular-nums formatting.

### Requirement: Institutional UI Standards
The heatmap component MUST adhere to the Kryptofolio UI architecture, meaning it must be wrapped in Shadcn Vue primitives and use internationalized text.

#### Scenario: Component Wrapping
- **WHEN** the component is rendered
- **THEN** it SHALL be wrapped within a Shadcn `Card` structure (`Card`, `CardHeader`, `CardTitle`, `CardContent`).

#### Scenario: Loading State
- **WHEN** the volatility data is being fetched
- **THEN** the system SHALL render a Shadcn `<Skeleton>` component that matches the geometric structure of the 12x30 grid.

#### Scenario: Text Translation
- **WHEN** the component displays text titles or tooltips
- **THEN** it SHALL retrieve all text using the `useI18n()` composable, with no hardcoded strings.
