# Capability: Vue Composables Wizard

## Requirements

### Requirement: Flattened UI Architecture (Feature-Sliced)
The `data-ingestion` module SHALL be restructured into a Composable-first architecture, removing unnecessary Hexagonal layers (`domain/`, `application/`, `infrastructure/`) from the UI logic.

#### Scenario: File structure organization
- **WHEN** the refactor is complete
- **THEN** all UI logic resides in `composables/`, UI views in `components/`, schemas in `schemas.ts`, and pure functions in `utils/`.
- **AND** there are no `ports` or `adapters` inside the wizard module itself.

### Requirement: Cohesive Vue Composables
The wizard state SHALL be orchestrated through dedicated, testable Composables.

#### Scenario: Separation of Concerns
- **WHEN** instantiating the wizard
- **THEN** `useFileParser` exclusively handles reading CSV/XLSX into raw objects.
- **AND** `useColumnMapper` exclusively manages the matching of raw headers to known schema fields.
- **AND** `usePreviewTable` manages the local state of parsed rows and user edits.
- **AND** `useImportProcessor` handles the final submission by executing the Pinia Colada mutation.
- **AND** `useCsvImportWizard` acts as the main orchestrator, providing these contexts to the UI components.

### Requirement: TDD and Zod Preservation
The refactor SHALL preserve all existing Zod validations and be fully tested.

#### Scenario: Preserving core logic
- **WHEN** migrating logic from `ValidationService` and `AutoMapperService` into Composables and Utils
- **THEN** existing Zod schemas are used without modification.
- **AND** unit tests are written/updated for each new Composable to ensure identical output behavior.
