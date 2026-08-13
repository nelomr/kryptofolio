# Tax Report View Specification

## Purpose

The IRPF report surface: the container that coordinates the header, the summary cards, the
integrity card and the tabs, and the statement the report makes about the currency of its own
figures. A report converted away from euro must not be presentable as though it were a native
record.

## Requirements

### Requirement: Tax Report Container Structure (Primary Adapter)
The `TaxReportView` SHALL act as a Primary Adapter (Smart Component) coordinating `TaxReportHeader`, `TaxReportSummaryCards`, `IntegrityCard`, and Tabs. It SHALL delegate all business logic and state management to Application Ports (composables and stores).

#### Scenario: The view orchestrates its children via ports
- **WHEN** `TaxReportView` is loaded
- **THEN** it renders the background skeleton, fetches required state via composables (Ports), and passes it as props to its child components without housing their template or business logic directly.

### Requirement: Testability and Verification
The `TaxReportView` integration SHALL be fully covered by automated tests ensuring proper port integration and component orchestration.

#### Scenario: Automated tests verify the adapter
- **WHEN** the test suite is executed
- **THEN** it verifies that `TaxReportView` correctly consumes its ports (mocked composables), renders its child components with the correct props, and maintains aesthetic structural integrity.

### Requirement: The Tax Report States The Currency Of Its Figures

The tax report SHALL state, in its header and in every export it produces, the currency its figures
are expressed in and whether those figures were converted. A report rendered in a currency other than
the one its records are stored in SHALL NOT be presentable as though it were a native record.

#### Scenario: A converted report is labelled

- **WHEN** the tax report is rendered while the display currency differs from the currency of the
  underlying lots
- **THEN** the header MUST state the display currency
- **AND** it MUST state that the figures are converted at each event's own date

#### Scenario: An export carries the same statement

- **WHEN** the report is exported
- **THEN** the export MUST carry the currency and the conversion statement
- **AND** neither MUST be reachable only from the on-screen view

#### Scenario: A euro report from non-euro records is a valid AEAT figure

- **WHEN** lots stored in `USD` are reported in `EUR`, each converted at its own acquisition or
  disposal date
- **THEN** the reported gains MUST be the euro figures the corresponding events produced on their own
  dates
- **AND** no figure MUST be derived from the current rate

#### Scenario: A report whose rates are incomplete says so

- **WHEN** any event in the reported period could not be converted for want of a rate
- **THEN** the report MUST state that it is incomplete
- **AND** it MUST identify the affected events rather than omitting them silently
