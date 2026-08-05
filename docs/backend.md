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
├── app.ts                     # Hono app definition, middlewares, route registration
├── index.ts                   # Server bootstrapper, jobs, and port binding
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
        ├── jobs/              # Background jobs: ExchangeRateSyncJob.ts
        └── routes/            # Hono route handlers: credentials.ts, settings.ts, etc.
```

**Dependency Rule**: Domain ports never import infrastructure. The DI container (`di/container.ts`) is the only place that knows about concrete implementations.

## Database Architecture (Dual-Engine)

> [!NOTE]
> For a detailed, table-by-table breakdown of the OLTP SQLite Ledger, please read [Database Architecture](database-architecture.md).

The backend employs a sophisticated dual-database architecture, heavily optimized for local-first, single-user performance with extreme financial precision. All database logic is abstracted behind the `packages/database/` layer.

| Component | Engine | Purpose | Architecture |
|---|---|---|---|
| **OLTP Ledger & Vault** | SQLite (`node:sqlite`) | Fast, ACID-compliant persistence for transactions, settings, and encrypted API credentials. | File-based (`kryptofolio_ledger.db`). Strict schema enforcing `TEXT` columns for financial amounts to guarantee `decimal.js` precision without float loss. Single-user (no `user_id` multi-tenancy). |
| **OLAP Analytics** | DuckDB | Tax calculations, FIFO matching, complex SWAPs, and portfolio PnL. | Ephemeral in-memory instance. Attaches directly to the SQLite ledger using `ATTACH 'kryptofolio_ledger.db' AS ledger (TYPE SQLITE)`. Uses Window Functions for high-performance vectorized operations. |
| **Historical Data** | Apache Parquet | Local, columnar storage of historical cryptocurrency and fiat exchange rates. | Hive-partitioned directories (`year=2026/month=01`). Federated dynamically into DuckDB via `LEFT JOIN` during analytics queries. |

Migration files, schema definitions, and analytical adapters live in `packages/database/`:
- **SQLite Migrations**: Manage table definitions for Vault, Assets, Accounts, and Transactions.
- **DuckDB Views & Adapters**: Define the analytical queries (e.g., `v_flattened_fifo_events`, `v_portfolio_daily_valuation`, `v_portfolio_returns_volatility`, `v_portfolio_ath_drawdown`, `v_portfolio_alpha_beta`) executed on the fly against the attached SQLite and Parquet files.
  - `DuckDbTaxCalculatorAdapter`: Consumes the vectorized DuckDB views to generate accurate capital gains and tax base categorization (IRPF).
  - `DuckDbPortfolioAnalyticsAdapter`: Responsible for ASOF joins and real-time market data projection.
  - `DuckDbMetricsAdapter`: Generates institutional risk metrics (Sharpe Ratio, Volatility, Max Drawdown, Alpha, Beta, Win Rate) via DuckDB OLAP queries. *See full [DuckDB Metrics & Time-Series Architecture](architecture/duckdb-metrics-time-series.md).*
  - `FifoMaterializerService`: Orchestrates the complex lifecycle of extracting flattened events, calculating gains using FIFO matching, and persisting consumed lots back to the ledger via set reconciliation (insert new / update changed / soft-delete absent) rather than an UPSERT-only write, so rows recomputed away from the ledger actually retire.

> [!NOTE]
> Tax-lot calculation, the custody double-entry ledger, and the per-source fee/format model are
> documented in full in [FIFO Tax Engine, Custody Ledger & Source Format Profiles](fifo-tax-engine.md).
> `IngestAndMaterializeUseCase` (`apps/backend/src/core/application/use-cases/`) is the orchestrator
> that runs `FifoMaterializerService.recalculate()` once per ingestion batch — never per row, since
> `CsvIngestionUseCase` already performs a network price lookup per transaction — and after every
> manual price/transfer-destination override edit.

## Domain Layer Isolation (`PreciseAmount`)

The core domain (`ILedgerPort`, `IPriceProviderPort`) is 100% decoupled from third-party libraries (including `decimal.js`). All exact financial amounts are represented using a TypeScript **Branded Value Object**:

```typescript
export type PreciseAmount = string & { readonly __brand: 'PreciseAmount' };
```

Arbitrary-precision arithmetic (`Decimal`) is strictly confined to Application and Infrastructure adapters.

## Metrics & Performance Endpoints (`/api/metrics`)

- `GET /api/metrics/kpis`: Portfolio KPI summary (equity, cost basis, realized/unrealized PnL, win rate, best/worst asset).
- `GET /api/metrics/risk`: Portfolio risk metrics (Sharpe ratio, 30d annualized volatility, max drawdown, Alpha, Beta).
- `GET /api/metrics/performance`: Daily valuation time-series.
- `GET /api/metrics/drawdown`: Historical percentage drawdown curve.

## Hono RPC Type Safety

`apps/backend` exports `AppType` — the single source of truth for the RPC contract:

```ts
// apps/backend/src/app.ts
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
| `KRYPTOFOLIO_DATA_DIR` | Backend | Optional. Directory holding every database file. Defaults to the workspace root. A relative value is anchored to the workspace root, never to the working directory. |
| `LEDGER_DB_PATH` | Backend | Optional override for the SQLite ledger (`kryptofolio_ledger.db`). |
| `VAULT_DB_PATH` | Backend | Optional override for the SQLite vault (`kryptofolio.db`). |
| `DUCKDB_PATH` | Backend | Optional override for the DuckDB OLAP database (`fiscal.duckdb`). |
| `PARQUET_DATA_PATH` | Backend | Optional override for the historical-price Parquet tree (`data/historical/prices`). |
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
5. Replace the mock handler in the corresponding router (`src/core/infrastructure/routes/*.ts`) with a Use Case call

The frontend requires **zero changes** — `VITE_API_URL` and `AppType` remain stable.
