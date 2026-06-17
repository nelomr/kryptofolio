## Why

Kryptofolio needs a unified and agnostic way to fetch updated asset prices to display real-time portfolio values, as well as global metrics (e.g., Fear & Greed Index, Top 5 Cryptocurrencies by market cap). This ensures privacy and API limits are respected by delegating the fetching to the backend while keeping the frontend fully decoupled from specific provider implementations.

## What Changes

- **Agnostic Market Data Module:** Implementation of a generalized Market Data Provider module inside the new Hono backend (`apps/backend`).
- **Shared Contracts:** Leverage `packages/shared-types` to define `AssetPrice` and `GlobalMarketMetrics` models so both frontend and backend use the exact same types.
- **Mutually Exclusive Providers:** Users will be able to toggle data fetching directly from a Vault's configuration, enforcing mutually exclusive active providers per category (e.g., Kraken vs Binance for Crypto, Yahoo Finance for Stocks).
- **Dual Fetching Mechanisms:** Support for efficient WebSocket connections for real-time tracking (e.g., Kraken) and fallback REST/Polling mechanisms (e.g., CoinGecko) where WebSockets are unavailable.
- **Frontend Real-time Streaming:** Frontend will consume the unified prices via Server-Sent Events (SSE).
- **Storage Preparation:** In-memory temporary storage for historical prices, with skeleton adapters prepared for DuckDB integration.
- **Strict Hexagonal Adherence:** Clear boundaries using Domain Ports, Application Use Cases, and Infrastructure Adapters.

## Capabilities

### New Capabilities
- `market-data-orchestration`: Management of mutually exclusive provider lifecycle per category (Crypto vs General).
- `realtime-price-streaming`: Connection to external providers (WS/REST) and exposing unified prices to the frontend via SSE.
- `historical-price-storage`: In-memory temporary storage and DuckDB skeleton structure for storing asset price history.

### Modified Capabilities
- (None)

## Impact

- **Shared Types (`packages/shared-types`):**
  - **Models & Schemas:** New `AssetPrice`, `GlobalMarketMetrics` models, and their respective Zod validation schemas.
- **Backend (`apps/backend`):**
  - **Domain Ports:** `IMarketDataProvider`, and `IPriceHistoryPort` ports.
  - **Application:** `MarketDataOrchestrator` service to manage active providers.
  - **Infrastructure:** Adapters for Kraken (WS), CoinGecko (REST), and `InMemory`/`DuckDb` adapters.
  - **API Endpoints:** New `/api/market/stream` (SSE) and `/api/market/global` routes.
- **Frontend (`apps/frontend`):**
  - **Domain:** New `IMarketDataPort`.
  - **Application:** `ToggleVaultMarketProviderUseCase`.
  - **UI/Composables:** `useMarketDataFeed` using Pinia Colada / Vue reactivity, and updates to the `VaultConfig.vue` settings interface. Imports domain types from `@kryptofolio/shared-types`.
