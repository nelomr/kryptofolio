# Backend — Hono API Server

> **Former name:** This document replaced `docs/api-gateway.md` after the `backend-consolidation` refactor.
> The `packages/api-gateway` package has been removed. All logic now lives in `apps/backend`.

## Overview

`apps/backend` is the single Hono server for Kryptofolio. It serves:

1. **API routes** — All REST endpoints consumed by the frontend via Hono RPC (`hc<AppType>`).
2. **Mock data** — During development, mock fixtures in `src/data/` are served directly. No real DB needed.
3. **Credentials Vault** — Encrypted local API key storage (AES-256-GCM, SQLite via Node.js built-in).
4. **User Settings** — Persistent language preference (SQLite).
5. **Analytical OLAP** — DuckDB engine implemented for portfolio calculations.

## Architecture: Hexagonal (Ports & Adapters)

```
apps/backend/src/
├── index.ts                   # Hono app, route registration, server bootstrap
├── data/                      # Mock fixtures (mockPortfolio, mockTax, mockMetrics)
└── core/
    ├── domain/
    │   ├── models/            # Domain entities (VaultProvider)
    │   └── ports/             # Interfaces: ICryptographyPort, IVaultCredentialsPort, IUserSettingsPort
    ├── application/
    │   └── use-cases/vault/   # UnlockVaultUseCase, StoreServiceCredentialUseCase, etc.
    └── infrastructure/
        ├── adapters/          # AesGcmCryptographyAdapter, SqliteVaultPortAdapter
        ├── di/container.ts    # Composition Root — wires ports to use cases
        └── routes/            # Hono route handlers: credentials.ts, settings.ts
```

**Dependency Rule**: Domain ports never import infrastructure. The DI container (`di/container.ts`) is the only place that knows about concrete implementations.

## Database Architecture

Two separate engines, both abstracted behind `IDatabasePort` from `@kryptofolio/database`:

| Engine | Purpose | When |
|---|---|---|
| Node.js `node:sqlite` (built-in) | Credentials vault + user settings | Now (implemented) |
| DuckDB | OLAP — portfolio, tax, FIFO | Now (implemented) |

Migration files live in `packages/database/migrations/`:
- `sqlite/001_vault_schema.sql` — Vault tables (credentials, metadata, settings)
- `duckdb/001_initial_schema.sql` — OLAP schema (to be expanded)

## Hono RPC Type Safety

`apps/backend` exports `AppType` — the single source of truth for the RPC contract:

```ts
// apps/backend/src/index.ts
export type AppType = typeof routes;
```

The frontend consumes it without any code generation:

```ts
// apps/frontend/src/core/infrastructure/http/BffClient.ts
import { hc } from 'hono/client';
import type { AppType } from '@kryptofolio/backend';

export const bffClient = hc<AppType>(import.meta.env.VITE_API_URL || 'http://localhost:3001');
```

## Environment Variables

| Variable | Scope | Description |
|---|---|---|
| `VAULT_DB_PATH` | Backend | Path to the SQLite vault `.db` file (`kryptofolio.db`). Required unless `MOCK_MODE=true`. |
| `DUCKDB_PATH` | Backend | Path to the DuckDB OLAP database file (`fiscal.duckdb`). Required unless `MOCK_MODE=true`. |
| `MOCK_MODE` | Backend | Set to `true` to use in-memory SQLite (no file needed). |
| `PORT` | Backend | HTTP port (default: `3001`). |
| `KRYPTO_MASTER_KEY` | Backend | Base64 AES key fallback when OS keyring is unavailable (Docker). |
| `VITE_API_URL` | Frontend | URL of `apps/backend` (default: `http://localhost:3001`). |

## Development

```bash
# Start only the backend (port 3001, mock data)
pnpm dev:backend

# Start frontend + backend together
pnpm dev:full
```

## Vault API Endpoints

All vault endpoints are under `/api/credentials/`:

| Method | Path | Description |
|---|---|---|
| `POST` | `/vault/unlock` | Unlock or initialize the vault with a master password |
| `GET` | `/vault/status` | Returns `{ isUnlocked, configuredServices, enabledServices }` |
| `GET` | `/vault/providers` | Lists available integration providers (e.g., Kraken) |
| `POST` | `/vault/:service` | Store encrypted credentials for a provider |
| `PATCH` | `/vault/:service/status` | Enable or disable a provider |

### Semantic Error Codes

| Code | Meaning |
|---|---|
| `VAULT_UNLOCKED` | Master password accepted, vault ready |
| `CREDENTIALS_SECURED` | API keys stored successfully |
| `INVALID_PASSWORD` | Wrong master password |
| `VAULT_LOCKED` | Operation requires unlocking first |
| `UNKNOWN_PROVIDER` | Provider ID not in the registry |
| `INVALID_CREDENTIAL_FORMAT` | Payload contains invalid characters |

## Settings API Endpoints

Under `/api/settings/`:

| Method | Path | Description |
|---|---|---|
| `GET` | `/language` | Get current language (`{ language: "en" }`) |
| `PUT` | `/language` | Update language preference |
| `PUT` | `/market-provider` | Update the active Real-Time Market Provider |

## Market Data API Endpoints

Under `/api/market/`:

| Method | Path | Description |
|---|---|---|
| `GET` | `/stream` | **Server-Sent Events (SSE)** endpoint. Streams live `AssetPrice` and `GlobalMarketMetrics` updates. |
| `GET` | `/global` | REST endpoint for static fetching of cached prices and global metrics. |

### The MarketDataOrchestrator

The backend serves as the single source of truth for all live market data, abstracting external limits and WebSocket complexities from the frontend:

- **Hot-Swappable Providers:** The `MarketDataOrchestrator` manages `IMarketDataProvider` instances (e.g., `KrakenMarketDataAdapter`, `BinanceMarketDataAdapter`). Only one active provider handles real-time streams at any given time to prevent memory leaks and respect API rate limits.
- **Unified SSE Feed:** The frontend connects once to `/api/market/stream`. If the user switches the active provider in the Vault, the backend gracefully disconnects the old provider, connects the new one, and pipes the data down the exact same SSE connection without requiring a browser refresh.
- **Price History Caching:** Incoming SSE streams automatically flush their prices into `IPriceHistoryPort` (backed by DuckDB and Memory). This ensures that REST polls (`/api/market/global`) and new SSE connections immediately receive the freshest data rather than waiting for the next exchange tick.

## Adding a New Real Route (Replacing a Mock)

When implementing a real feature that currently returns mock data:

1. Define or extend the relevant **Port interface** in `src/core/domain/ports/`
2. Implement the **Use Case** in `src/core/application/use-cases/`
3. Implement the **Adapter** in `src/core/infrastructure/adapters/`
4. Wire it in `src/core/infrastructure/di/container.ts`
5. Replace the mock handler in `src/index.ts` with a Use Case call

The frontend requires **zero changes** — `VITE_API_URL` and `AppType` remain stable.
