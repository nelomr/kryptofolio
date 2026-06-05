# Crypto Metrics KPI Specifications

## Added via crypto-kpi-cards

### Requirement: KPI Dashboard Initialization
The system SHALL present 4 primary KPI cards displaying Total ROI, Max Drawdown, Win Rate, and Best/Worst Asset on the metrics dashboard.

#### Scenario: Displaying KPIs on load
- **WHEN** the user navigates to the Crypto Metrics dashboard
- **THEN** the system SHALL invoke the `ICryptoMetricsRepository` to fetch the `CryptoKpis` data and render the cards

### Requirement: Anti-Corruption Validation
The system SHALL validate any external KPI payload using Zod before allowing it into the Domain layer.

#### Scenario: Safely handling dirty data
- **WHEN** the infrastructure adapter receives an external response
- **THEN** it SHALL parse the response through `CryptoKpisSchema` and securely map it to the `CryptoKpis` entity

### Requirement: UI Component Design
The system SHALL display the KPI values using the strict styling tokens, including `text-profit` for positive numbers, `text-loss` for negative numbers, and `font-mono` for specific numbers.

#### Scenario: Rendering styled KPI data
- **WHEN** the KPI cards receive numeric data
- **THEN** the UI SHALL appropriately color code the output and present it with tabular monospace fonts without relying on generic color palettes
