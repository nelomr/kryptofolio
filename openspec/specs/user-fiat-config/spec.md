## ADDED Requirements

### Requirement: User Base Currency Configuration
The system SHALL allow users to configure and persist their preferred base fiat currency (e.g., USD, EUR).

#### Scenario: User selects and saves base currency
- **WHEN** the user selects 'EUR' from the currency selector and clicks the 'Save' button in the configuration view
- **THEN** the system MUST persist 'EUR' in the `user_config` SQLite database table as the `baseCurrency`, create/call the necessary mutation to store it, and apply it to future market data normalizations.

#### Scenario: User sees current exchange rate
- **WHEN** the user views the configuration settings
- **THEN** the system MUST display a subtitle or pre-title showing the currently saved exchange rate (e.g., 'USD/EUR = 0.988') retrieved via a mutation/composable.
