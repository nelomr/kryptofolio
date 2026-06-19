## ADDED Requirements

### Requirement: Crypto Price Fiat Normalization
The system SHALL normalize all crypto prices to the user's configured base fiat currency before broadcasting them to the frontend.

#### Scenario: Normalizing USD price to EUR
- **WHEN** a crypto price is ingested in USD (e.g., BTC/USD) and the user's `baseCurrency` is EUR
- **THEN** the system MUST multiply the USD price by the stored USD/EUR exchange rate before emitting it to the frontend.
