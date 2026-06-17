## Context

Kryptofolio currently lacks a unified mechanism to fetch real-time and periodic market values for vault assets and global market metrics (e.g., Fear & Greed index). The user needs to be able to enable data fetching directly from a Vault's configuration, enforcing mutual exclusivity per category (Crypto vs. General). Following the DuckDB Phase 0 monorepo refactor, the project enforces a strict Hexagonal Architecture with shared types across frontend and backend.

## Goals / Non-Goals

**Goals:**

- Provide a generalized, agnostic Market Data Provider module in the Backend (`apps/backend`).
- Leverage `@kryptofolio/shared-types` to ensure strict typings and single-source-of-truth Zod schemas for market data models across the monorepo.
- Support WebSocket connections (e.g., Kraken, Binance) for real-time tracking, and REST/Polling (e.g., CoinGecko) as fallbacks.
- Expose a Server-Sent Events (SSE) endpoint to stream prices to the frontend.
- Prepare the system for future analytical workloads using DuckDB.

**Non-Goals:**

- Full implementation of the DuckDB historical price storage (only a skeleton adapter is required for now).
- Supporting trade execution or write operations to exchanges.

## Decisions

1. **Backend-driven Connections:** All market data adapters (WS and REST) will run exclusively in the Node.js Backend (`apps/backend`).
   - **Rationale:** Avoids frontend CORS issues, keeps user API keys secure, centralizes API requests to prevent rate-limit exhaustion, and enables a true singleton lifecycle for connections independent of UI navigation.
2. **Shared Types & Anti-Corruption Layer:**
   - **Rationale:** Following Phase 0 principles, domain models (`AssetPrice`, `GlobalMarketMetrics`) and their Zod schemas will live in `packages/shared-types/src/market-data/`. The backend will intercept external API responses using these Zod schemas to ensure only safe, validated data is emitted. The frontend will consume the SSE stream using the exact same types, ensuring 0 discrepancies.
3. **Server-Sent Events (SSE) for Frontend:**
   - **Rationale:** The frontend (`apps/frontend`) will act as a pure consumer via SSE (`/api/market/stream`). SSE is simpler and more resilient than WebSockets for unidirectional data flow (server to client).
4. **State Management via Pinia Colada:**
   - **Rationale:** Adhering to the `domain-architecture` rule "No Global Stores", server state fetching (like `GlobalMarketMetrics` or the SSE subscription initialization) will be handled declaratively using `@pinia/colada` and local Vue reactivity (`ref`, `computed`), instead of creating domain stores in Pinia.
5. **Prepared for DuckDB Appender API:**
   - **Rationale:** While only scaffolding `DuckDbPriceHistoryAdapter` in `apps/backend`, the design anticipates the `duckdb-best-practices` by planning to ingest historical pricing data via DuckDB's bulk Appender API or Parquet file generation, avoiding row-by-row `INSERT` operations.

## Risks / Trade-offs

- **[Risk] Memory Leaks from Unclosed WebSocket Connections** → **Mitigation:** The `MarketDataOrchestrator` application service acts as a singleton ensuring that whenever a provider is toggled, the previous provider's `disconnect()` method is strictly called before initializing the new one.
- **[Risk] Poll Rate Limits (REST Providers)** → **Mitigation:** Since all fetching is centralized in the backend, we can enforce a strict polling interval (e.g., every 60 seconds) regardless of how many frontend clients are connected.
