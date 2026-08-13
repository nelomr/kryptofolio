# Portfolio Data Composable Specification

## Purpose

The portfolio data composable: what it exposes, how it transforms allocation and performance data, and the rebuild action.

## Requirements

### Requirement: Expose Portfolio Data
The composable MUST expose the portfolio store instance, loading flags, and core metrics.

#### Scenario: Initializing Composable
- **WHEN** `usePortfolioData()` is invoked in a component
- **THEN** it returns reactive references to `isFetching`, `isRebuilding`, `metrics`, and `filteredHoldings`

### Requirement: Transform Allocation Data
The composable MUST transform store data into structures suitable for a Donut Chart.

#### Scenario: Generate Allocation Data
- **WHEN** the store has holdings
- **THEN** `allocationData` provides a transformed array with `label`, `value`, and `color` properties for each holding

### Requirement: Transform Performance Data
The composable MUST transform store data into structures suitable for a Line Chart.

#### Scenario: Generate Performance Data
- **WHEN** performance history is requested
- **THEN** `performanceData` generates a synthetic history array based on the `total_equity`

### Requirement: Rebuild Action
The composable MUST expose a `handleRebuild()` method wrapping the store's `triggerRebuild()`.

#### Scenario: Triggering Rebuild
- **WHEN** `handleRebuild()` is called
- **THEN** it invokes the store's rebuild logic asynchronously
