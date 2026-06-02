## MODIFIED Requirements

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
