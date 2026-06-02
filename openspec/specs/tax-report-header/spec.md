## ADDED Requirements

### Requirement: Header Display and Wallet Selection
The system SHALL display the "Asistente Fiscal" title, a "Motor de Cumplimiento" badge, and a dropdown for Wallet Selection populated from configuration.

#### Scenario: User views the header
- **WHEN** the header is rendered
- **THEN** title and badge are visible, and the wallet dropdown displays the available wallets.

### Requirement: Disabled Actions with Tooltips
The "Subir CSV" and "Sync Web3" buttons SHALL be visually present but disabled by default, showing a tooltip explaining backend integration is pending.

#### Scenario: User hovers over disabled buttons
- **WHEN** the user hovers over "Subir CSV" or "Sync Web3"
- **THEN** a tooltip appears reading "Backend integration pending / Funcionalidad pendiente de integración con backend" and clicking the button does not trigger any action other than a console log.
