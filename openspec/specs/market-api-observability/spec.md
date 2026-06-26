# market-api-observability Specification

## Purpose
TBD - created by archiving change fix-market-data-adapters. Update Purpose after archive.
## Requirements
### Requirement: Market Data API Observability
The system SHALL monitor the health and connectivity of external market data providers (e.g., Kraken WebSocket, CoinGecko REST).

#### Scenario: Provider API rate limit exceeded
- **WHEN** a provider (e.g., CoinGecko) returns an HTTP 429 Rate Limit Exceeded response
- **THEN** the system MUST explicitly log a warning indicating the rate limit was hit, rather than silently failing during schema parsing.

#### Scenario: Provider schema validation failure
- **WHEN** the payload from a provider (e.g., Kraken WS v2) fails Zod validation
- **THEN** the system MUST log an error detailing the validation issues (e.g., mismatched types, missing fields) to facilitate immediate debugging.

