## ADDED Requirements

### Requirement: Fiat Exchange Rates Fetching
The system SHALL periodically fetch real-time fiat exchange rates against the EUR from the European Central Bank (ECB) daily XML feed.

#### Scenario: Fetching daily exchange rates from ECB via Boot Manager
- **WHEN** the backend starts up, OR the polling interval triggers `FetchAndStoreExchangeRatesUC`
- **THEN** the system MUST retrieve the `eurofxref-daily.xml`, extract the USD rate, and the publication date.
- **AND** the system MUST store `exchange_rate_usd_eur` and `exchange_rate_date` in the SQLite KV store.
- **AND IF** the newly fetched date is different/newer than the previously stored date, the backend MUST stop the polling interval to save resources.

#### Scenario: Manual Sync Request from User
- **WHEN** the user clicks the "Sync" button in the Currency Settings
- **THEN** the frontend MUST display a tooltip explaining that "Los nuevos datos salen a las 16:30" (New data comes out at 16:30).
- **AND** the system MUST trigger the synchronization endpoint, update the rate and date, and refresh the UI.

#### Scenario: Displaying exchange rate timestamp in UI
- **WHEN** the user views the Currency Settings
- **THEN** the frontend MUST display the exchange rate along with the specific date the rate was published (e.g. "Rate from: 2026-06-19").
