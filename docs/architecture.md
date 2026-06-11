# Core Architecture

This document covers the high-level architecture of the application, detailing the Monorepo structure, the Hexagonal Architecture pattern used across modules, and the role of the Hono Backend For Frontend (BFF).

## Overview

Kryptofolio leverages a strict **Hexagonal Architecture** within a Turborepo monorepo setup. The core principle is that the Domain layer is completely isolated from external concerns, meaning no framework imports, no database logic, and no external UI dependencies are allowed inside `src/core/domain/`.

All external data enters the system through the **Anti-Corruption Layer (ACL)**, primarily using Zod schemas for Data Transfer Objects (DTOs), before being mapped to internal Branded Types and strict Domain Entities.

## Backend-for-Frontend (BFF) Pattern

Instead of the frontend making direct external calls or relying on hardcoded static data files, Kryptofolio implements a BFF using **Hono**. This API Gateway centralizes data fetching, caching, and mocking. 

### Data Flow & Dependency Injection

The frontend communicates with the BFF entirely through `hono/client` (`hc<AppType>`). This guarantees end-to-end type safety. The data flow strictly adheres to Hexagonal Architecture, ensuring the UI components never directly call the network or the adapters.

> [!TIP]
> The `BffClient.ts` handles the environment variables cleanly. It securely routes to `VITE_API_BASE_URL` which points to our API Gateway.

```mermaid
sequenceDiagram
    participant UI as UI Component (Vue)
    participant Colada as Composable (Pinia Colada)
    participant UseCase as Use Case (Application)
    participant Port as Port (Domain)
    participant Adapter as Adapter (Infrastructure)
    participant hc as Hono RPC Client (hc)
    participant BFF as API Gateway (BFF)

    UI->>Colada: useUploadTaxFileMutation()
    Colada->>UseCase: execute(file, market)
    Note over UseCase: Business logic orchestration<br/>(Validation, Context setup)
    UseCase->>Port: uploadFile(payload)
    Port->>Adapter: Interface implementation
    Adapter->>hc: bffClient.api.tax.upload.$post()
    hc->>BFF: HTTP POST /api/tax/upload
    BFF-->>hc: JSON Response
    hc-->>Adapter: Typed Response
    Adapter-->>Port: Domain Entity / Promise
    Port-->>UseCase: Success / Failure
    UseCase-->>Colada: Resolves mutation
    Colada-->>UI: Reactive status update (isPending)
```

**Architectural Rules for Data Flow:**
1. **Reads (Queries):** Simple read operations may bypass Use Cases and let the composables delegate directly to the injected Domain Port (acting as a Repository). This follows CQRS principles.
2. **Writes (Mutations):** All state-changing operations MUST be orchestrated through an explicit `UseCase` class in `src/core/application/use-cases/`.
3. **Ports:** All dependencies are injected via Vue's `provide`/`inject` system using strictly typed `InjectionKey`s (e.g., `VAULT_PORT_KEY`).

### Backend-for-Frontend as the Single Source of Truth

The Hexagonal Architecture ensures the frontend is agnostic to the actual network implementation. Mocks and network logic are managed exclusively at the BFF layer.

- **Frontend Consistency**: The frontend always injects and utilizes the `Rest*` adapters, which point to the BFF.
- **BFF Modes**: The BFF itself dictates whether it serves static mock data (`MODE=mock`) or proxies requests to a live backend (`MODE=prod`). This ensures the frontend consistently experiences network latency, asynchronous loading states, and identical payloads regardless of the environment.

## Anti-Corruption Layer (ACL)

To prevent external API changes from breaking the UI, all adapters must run data through Zod DTOs before instantiating Domain Entities.

```mermaid
flowchart TD
    A[External Source / BFF] -->|Raw JSON| B(Infrastructure Adapter)
    B -->|Zod safeParse| C{Validation}
    C -->|Success| D[Domain Entity Mapping]
    C -->|Fail| E[Global Error Bus]
    D --> F[Pinia Store / UI]
```
