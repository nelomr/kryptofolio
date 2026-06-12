## ADDED Requirements

### Requirement: Project Rebranding
The repository and application SHALL use "Kryptofolio" (display) and "kryptofolio" (package) as its primary identifier.

#### Scenario: Application Loading
- **WHEN** user loads the application in a browser
- **THEN** the browser tab title MUST display "Kryptofolio"

### Requirement: Thematic Copyright-Free Assets
The application SHALL include a custom favicon and application logo based on the provided `favicon.png` and `screen-tp.png` assets.

#### Scenario: Tab Favicon
- **WHEN** user loads the application in a browser
- **THEN** they MUST see the new `favicon.png` in the browser tab

#### Scenario: Application Logo
- **WHEN** user views the application UI
- **THEN** they MUST see the `screen-tp.png` logo displayed in the header/branding areas

### Requirement: Multi-language Documentation
The repository SHALL provide documentation in both English and Spanish, with English as the primary default.

#### Scenario: English Default
- **WHEN** a user visits the repository root
- **THEN** they MUST see the `README.md` written in English
- **AND** a prominent navigation link MUST point to the Spanish version

#### Scenario: Spanish Version
- **WHEN** a user navigates to `README.es.md`
- **THEN** they MUST see the documentation translated to Spanish
- **AND** a prominent navigation link MUST point back to the English version

### Requirement: Marketing Positioning
The English README SHALL highlight the robust FIFO data presentation system and its architecture ready for AI Agent integration.

#### Scenario: Feature Discovery
- **WHEN** a developer reads the README features section
- **THEN** they MUST find clear references to the FIFO data logic and Mastra/Vercel AI SDK integration readiness
