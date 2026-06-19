# 🖥️ Kryptofolio Backend (Hono + SQLite + DuckDB)

This is the core backend service for the Kryptofolio application. It is built using **Hono** to provide a lightweight, blazingly fast backend that perfectly bridges the Vue 3 frontend with local data persistence and external market data APIs. 

The backend acts as the definitive "Single Source of Truth", exposing end-to-end type safety to the frontend via Hono RPC (`hc`).

## 🏗️ Architecture

The backend strictly adheres to **Hexagonal Architecture** (Ports and Adapters). It isolates the execution core from the API routes and business logic. 

To prevent the "God Object" anti-pattern, the application lifecycle is divided into two distinct entry points:

### 1. `src/app.ts` (The Web Application)
This file defines the pure **Hono application**. It contains:
- Route registrations (mapping `/api/*` to specific route modules).
- Middlewares (CORS, error handling).
- The `AppType` export, which is crucial for the frontend's Hono RPC client.

It does **not** know about the server environment, ports, or database initialization.

### 2. `src/index.ts` (The Bootstrapper & Orchestrator)
This is the execution root. Its responsibilities are:
- Initializing the local databases (SQLite for the Vault, DuckDB for calculations).
- Booting up the background jobs (e.g., `ExchangeRateSyncJob`).
- Injecting the active market data provider into the `MarketDataOrchestrator` to begin SSE price streaming.
- Starting the actual Node.js HTTP server via `@hono/node-server`.

## 📂 Folder Structure

```text
apps/backend/src/
├── app.ts                     # Pure Hono app definition, middlewares, route mapping
├── index.ts                   # Bootstrapper: Node server, DB init, job runner
├── data/                      # Mock fixtures (development data)
└── core/
    ├── domain/                # Pure entities and port interfaces
    ├── application/           # Use Cases and Services (e.g. MarketDataOrchestrator)
    └── infrastructure/
        ├── adapters/          # Concrete implementations (SQLite, ECB Exchange Rates)
        ├── di/container.ts    # Composition Root: Instantiates all dependencies
        ├── jobs/              # Background polling and maintenance tasks
        └── routes/            # Hono route handlers (tax.ts, portfolio.ts, etc.)
```

## 🔌 Core Concepts

### Dependency Injection (DI)
All concrete infrastructure (databases, API clients) are wired into Use Cases and Services via `src/core/infrastructure/di/container.ts`. 

### Routing
The route handlers in `src/core/infrastructure/routes/*.ts` act as thin **Controllers**. They:
1. Receive requests and validate them using `@hono/zod-validator`.
2. Grab the appropriate Use Case from the `container`.
3. Execute the Use Case and return the result.

### Background Jobs
Tasks like syncing European Central Bank (ECB) exchange rates run asynchronously outside of the request lifecycle. These are housed in `src/core/infrastructure/jobs/` and spawned by `index.ts`.

## 🚀 Running the Backend

```bash
# From the monorepo root:
pnpm dev:backend

# Or directly inside apps/backend:
pnpm dev
```

### Validation & Testing
The backend relies on `vitest` for fast unit tests. Ensure you mock the DI container accurately if your tests cover API routes.

```bash
pnpm typecheck
pnpm test
```
