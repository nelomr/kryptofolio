# Hovers And Shadows Ui Specification

## Purpose

Interactive elevation: cards on hover, semantic shadcn token mapping, and highlighted interactive text.

## Requirements

### Requirement: Elevate Cards on Hover
The system SHALL apply `--shadow-card` to all metric and summary cards when the user hovers over them, replacing border color changes or legacy shadows.

#### Scenario: User hovers over a MetricCard
- **WHEN** user hovers their mouse over a `MetricCard` or `TokenSummaryCards`
- **THEN** the component elevates visually using `hover:shadow-card` without changing its border color to `primary/30`.

### Requirement: Semantic Shadcn Token Mapping for Interactive Elements
The system SHALL decouple `--color-brand` (the main institutional color) from `--color-accent` in `src/style.css`, mapping `--color-accent` to `var(--color-brand-soft)`. All interactive UI components SHALL use standard Shadcn native classes for hovers.

#### Scenario: User hovers over a table row or dropdown
- **WHEN** user hovers their mouse over a row in `TaxTransactionsTable`, `ExpandedLotsTable`, or standard Shadcn components
- **THEN** the row background turns a soft indigo hue via the native class `hover:bg-accent` and the text color adjusts via `hover:text-accent-foreground`.

### Requirement: Highlight Interactive Texts
The system SHALL highlight actionable texts and icons natively using the standard token hierarchy.

#### Scenario: User hovers over a clickable text/icon
- **WHEN** user hovers over an interactive text element (e.g. Delete transaction, Expand details)
- **THEN** the element responds dynamically using Shadcn native hover tokens like `hover:text-accent-foreground`.
