## MODIFIED Requirements

### Requirement: Real-time Price Streaming
The system SHALL expose a Server-Sent Events (SSE) endpoint `/api/market/stream` to stream real-time asset prices to connected clients, and the prices MUST be normalized to the user's base fiat currency.

#### Scenario: Client connects to price stream
- **WHEN** the frontend application connects to the SSE endpoint
- **THEN** it MUST receive periodic or real-time `AssetPrice` updates from the currently active providers, normalized to the configured `baseCurrency`.

### Requirement: Provider Data Sanitization
The system SHALL sanitize all incoming data from external providers (e.g., Kraken WebSocket, CoinGecko REST) using Zod schemas before emitting them to the domain logic.

#### Scenario: Invalid data received from provider
- **WHEN** the Kraken adapter receives a malformed or unexpected JSON payload
- **THEN** the system MUST fail gracefully by logging the error to the `errorBus` without crashing the SSE stream and MUST NOT emit the dirty payload to the application.

### Requirement: Global Metrics Polling
The system SHALL allow retrieving static global market metrics via a REST endpoint.

#### Scenario: Frontend requests global metrics
- **WHEN** the frontend calls `/api/market/global`
- **THEN** the system MUST return the latest `GlobalMarketMetrics` retrieved from the active provider.
