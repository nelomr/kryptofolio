## ADDED Requirements

### Requirement: UI uses mutation for CSV upload
The system SHALL use `useUploadTaxFileMutation` when uploading a CSV file from the UI.

#### Scenario: Automatic refetch after upload
- **WHEN** the user uploads a CSV file via the UI
- **THEN** the system SHALL call the mutation and automatically invalidate the transactions query upon success, ensuring the table updates automatically
