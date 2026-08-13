# Core Layout Specification

## Purpose

The dashboard shell: layout container, header, metrics row, and the global formatters every figure passes through.

## Requirements

### Requirement: Portfolio Layout Container
The system SHALL render `PortfolioView.vue` as the main layout container with a full-height column structure.

#### Scenario: View structure renders
- **WHEN** the portfolio view is loaded
- **THEN** it renders a flex-col container layout

### Requirement: Dashboard Header Section
The system SHALL display a header containing the main title ("Portfolio Analytics"), a system badge ("Institutional FIFO Engine • FY 2026"), a data fetching indicator, and a "Rebuild Index" action button.

#### Scenario: Data fetching indicator visibility
- **WHEN** the `isFetching` state is true
- **THEN** an amber pulse visual indicator is displayed in the header
- **WHEN** the `isFetching` state is false
- **THEN** the visual indicator is hidden

#### Scenario: Rebuild Index action
- **WHEN** the "Rebuild Index" button is clicked
- **THEN** the `handleRebuild()` method is triggered
- **WHEN** the rebuild is in progress
- **THEN** the `RefreshCw` icon within the button animates with a spin effect

### Requirement: Metrics Row Display
The system SHALL display a responsive grid below the header for key metric cards (Total Net Equity, Unrealized P&L, Realized P&L).

#### Scenario: Responsive grid layout
- **WHEN** viewed on a desktop viewport (`md` and above)
- **THEN** the metrics are displayed in a 3-column grid
- **WHEN** viewed on a mobile viewport
- **THEN** the metrics collapse to a 1-column layout

#### Scenario: Metric Values Integration
- **WHEN** the cards are rendered
- **THEN** they display formatted values sourced from the `metrics` object of `usePortfolioData()`

### Requirement: Global Formatters
The system SHALL provide a `useFormatters.ts` composable exporting `formatCurrency` and `formatPercent` functions. These formatters SHALL be locale-agnostic, determining the locale dynamically from the user's browser or environment variables rather than using a hardcoded value.

#### Scenario: Formatting currency values
- **WHEN** `formatCurrency` is called with a numeric value
- **THEN** it returns a string formatted as currency using the detected locale

#### Scenario: Formatting percentage values
- **WHEN** `formatPercent` is called with a numeric value
- **THEN** it returns a string formatted as a percentage with 2 decimal places

### Requirement: Architecture and Design Guidelines
All new features SHALL abide by the folder architecture (`lib/`, `components/common/`, `styles/`) and Clean Code standard utilized in the original `cripto-proyect/frontend` reference. The global theme classes (`style.css`), `responsive-fixes.css`, and custom utility helpers (`utils.ts`) MUST be synchronized with the reference repository. `App.vue` SHALL serve as the root component that mounts `PortfolioView.vue` along with the global Tailwind theme logic.

### Requirement: Shadcn-Vue Component Pattern
The system SHALL include a `components.json` configuration file at the root to enforce the `shadcn-vue` unitary components pattern. All new base UI components MUST be generated exclusively via the CLI (`pnpm dlx shadcn-vue@latest add <component>`) to ensure integration with `radix-vue` and `class-variance-authority` (cva). Manual creation of base components is prohibited. Components SHALL utilize the configured aliases (`@/components/ui`, `@/lib/utils`, etc.) to maintain consistency.

### Requirement: Crypto and Exchange Iconography
The system SHALL use the local SVG files located in the `assets/crypto` directory for displaying cryptocurrency, wallet, and exchange icons across all listings and details.

#### Scenario: Displaying an asset icon
- **WHEN** a cryptocurrency or exchange needs to be represented visually in the UI
- **THEN** the corresponding SVG from the `assets/crypto` folder is loaded and displayed
