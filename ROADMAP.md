# 🗺️ Kryptofolio Roadmap

This document outlines the vision, current achievements, and technical trajectory for Kryptofolio, a local-first, privacy-focused cryptocurrency portfolio tracker and fiscal calculation engine.

---

## 🎯 Vision & Architecture Philosophy
Kryptofolio is built as a highly testable, offline-capable application designed with strict **Hexagonal Architecture**. 
- **Privacy-First (Single-User)**: All APIs, credentials, and transactions remain strictly on the user's machine.
- **Robust Persistence**: Embracing a dual OLTP/OLAP database pattern to efficiently manage transactions (SQLite) and intense financial calculations like FIFO / PnL (DuckDB).
- **Separation of Concerns**: A monorepo structure separating frontend UI from pure backend calculation and database management layers.

---

## ✅ Phase 1: Foundation & Frontend Architecture (Achieved)

We have successfully laid the groundwork for a robust, scalable application and completed the majority of the UI/UX presentation logic.

- **📦 Monorepo Infrastructure**
  - [x] Setup using PNPM Workspaces & Turborepo.
  - [x] Independent packages created: `@kryptofolio/frontend`, `@kryptofolio/backend`, `@kryptofolio/core-domain`, `@kryptofolio/shared-types`, and `@kryptofolio/database`.

- **🏛️ Hexagonal Architecture Implementation**
  - [x] Strict separation of Domain (`src/core/domain`), Application (`use-cases`), and Infrastructure (`adapters`).
  - [x] Validation schemas handled at the edge using Zod (Anti-Corruption Layer).
  - [x] Business logic is 100% agnostic of Vue or UI frameworks.

- **🎨 Institutional UI & UX**
  - [x] Institutional Light Design System implemented via TailwindCSS v4.
  - [x] Setup of `shadcn-vue` and `Radix-Vue` components.
  - [x] Advanced tabular data presentation (perfectly aligned with `tabular-nums` and `.num` utilities).
  - [x] Implementation of state management using **Pinia Colada** for async server state.

- **🧹 Data Ingestion Pipeline (Wizard)**
  - [x] Intuitive multi-step CSV/XLSX import wizard.
  - [x] Automatic header mapping for Binance, Kraken, Coinbase, KuCoin, and Bitunix.
  - [x] Robust spot vs. futures data constraints mapping.

- **🌐 i18n System**
  - [x] Zero-dependency environment-based internationalization (English & Spanish).

- **🔌 CEX Integrations & Provider Adapters**
  - [x] Implementation of backend Provider Adapters for Binance, Kraken, and CoinGecko.
  - [x] Secure API connections using the local encrypted secrets vault.

---

## 🚧 Phase 2: Core Backend Logic & Calculations (Next)

The focus now shifts to building out the centralized Hono.js backend to perform the heavy lifting of financial computations.

- **⚙️ Backend Hono Setup & E2E Type Safety**
  - [x] Solidify the internal `apps/backend` API service.
  - [x] Export `AppType` to the frontend using Hono RPC to guarantee end-to-end type safety between client and server without regenerating clients.

- **🧮 Financial Engine (FIFO & PnL)**
  - [x] Implement business logic required to correctly calculate portfolio values using strict First-In-First-Out (FIFO) methodologies.
  - [x] Correctly attribute fees and manage the complexities of crypto Swaps, Staking rewards, and Airdrops according to AEAT (Spanish Tax Agency) criteria.

- **🔌 Real-Time Market Data**
  - [x] Server-Sent Events (SSE) setup for live price streaming between backend and frontend adapters.
  - [ ] Connect the frontend UI components to actively reflect real-time values from the backend adapters.

---

## 🗄️ Phase 3: Professional Database Strategy (Next)

To support the robust Backend Financial Engine, we are implementing a dual-database pattern tailored for a local-first application. *See the full [Database Strategy Documentation](packages/database/docs/database-strategy.md) for deeper details.*

- **Phase 3.0: Domain Conditioning**
  - [x] Eradicate multi-tenancy attributes (`user_id`).
  - [x] Enforce high-precision numerical libraries (`decimal.js`) across the domain.

- **Phase 3.1: SQLite OLTP Deployment**
  - [x] Implement strict ledger schema with `TEXT` columns for financial precision.
  - [x] Define database constraints and soft-delete mechanisms.

- **Phase 3.2: DuckDB OLAP Instantiation**
  - [x] Establish zero-copy connection to SQLite.
  - [x] Develop analytical Window Function views for asynchronous FIFO calculations.

- **Phase 3.3: Parquet Series Integration**
  - [ ] Persist historical price data to Hive-partitioned `.parquet` files.
  - [ ] Execute federated fallback queries across SQLite and Parquet.

- **Phase 3.4: Maintenance & Backups**
  - [ ] Implement backup mechanisms and database VACUUM scheduling.
  - [x] Ensure idempotency in CSV imports via TDD.

- **Phase 3.5: AEAT Tax Reporting**
  - [ ] Automate threshold triggers for Wealth Tax (Modelo 714) and Foreign Assets (Modelo 721).
  - [ ] Validate multi-year tax carryforward overlaps using complex TDD mocks.

---

## 🚀 Phase 4: Future Enhancements

- **🤖 AI Agent Integration**
  - [ ] Leverage Vercel AI SDK or Mastra.
  - [ ] Expose validated use-cases and endpoints as Tools (function calling) so users can query their portfolio via natural language.
  
- **📊 Advanced Analytics**
  - [ ] Impermanent loss calculators for Liquidity Pools.
  - [ ] Detailed risk exposure and Yield tracking dashboards.

- **📜 Automated Form Generation**
  - [ ] Automated AEAT Modelo 721 and standard IRPF tax bracket estimators.
