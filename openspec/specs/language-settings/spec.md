## ADDED Requirements

### Requirement: Language Selection Interface
The system SHALL display a language selector in the Settings View allowing users to toggle between "English" and "Spanish". It SHALL also display a Save button next to the selector to persist the change.

#### Scenario: User saves a new language
- **WHEN** user selects a different language and clicks the "Save" button
- **THEN** the system triggers a mutation to save the new language configuration

### Requirement: Language Preference Persistence
The system SHALL persist the user's selected language setting in the backend database.

#### Scenario: Successful language persistence
- **WHEN** the frontend mutation sends the language configuration to the backend API
- **THEN** the backend updates or creates the language setting in the database and returns success

### Requirement: Reactive Interface Translation
The system SHALL automatically translate all UI text to the newly selected language immediately upon successful configuration save, without requiring a full page reload.

#### Scenario: Immediate text update
- **WHEN** the language save mutation is successful
- **THEN** the I18n adapter updates the reactive locale state, causing all translated strings to render in the new language
