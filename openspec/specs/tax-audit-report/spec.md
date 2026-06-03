## ADDED Requirements

### Requirement: Configure fiscal year

The system SHALL allow the user to select a fiscal year (calculation method is locked to FIFO) from the fiscal controls panel.

#### Scenario: Selection triggers recalculation

- **WHEN** the user selects a different fiscal year and clicks "Recalcular"
- **THEN** the system triggers a data fetch to the backend to retrieve the updated tax report details

### Requirement: Display detailed FIFO lot traceability

The system SHALL display a detailed table representing the audit trail of tax lot history events.

#### Scenario: Displaying empty states

- **WHEN** there is no data available for the selected year (and FIFO method)
- **THEN** the system displays a fluid empty state message (e.g., "No hay datos disponibles")

#### Scenario: Displaying loading states

- **WHEN** the data is being fetched or recalculated
- **THEN** the system displays a loading state animation (e.g., "Generando Libro de Auditoría...")

### Requirement: Download Tax Report

The system SHALL allow the user to download the fiscal report.

#### Scenario: User downloads report

- **WHEN** the user clicks "Descargar Informe"
- **THEN** the system invokes the backend adapter to generate and download a PDF/CSV file and provides visual feedback of the operation

### Requirement: Consistent Mock Data Representation

The system SHALL support rendering high-quality mock data that covers all edge cases (e.g., fractional quantities, varied transaction types) for development and testing.

#### Scenario: Consistent data across views

- **WHEN** the application is running in mock or development mode
- **THEN** the tax audit reports and the main portfolio views must display data derived from the exact same centralized mock portfolio dataset, ensuring cross-view consistency.
