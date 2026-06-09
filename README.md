# 📊 Kryptofolio

[![Release](https://img.shields.io/github/v/release/nelomr/kryptofolio?style=flat-square&logo=github&label=version)](https://github.com/nelomr/kryptofolio/releases/latest)
[![CI](https://img.shields.io/github/actions/workflow/status/nelomr/kryptofolio/ci.yml?branch=main&style=flat-square&logo=github-actions&label=CI)](https://github.com/nelomr/kryptofolio/actions/workflows/ci.yml)
[![Changelog](https://img.shields.io/badge/changelog-CHANGELOG.md-blue?style=flat-square)](./CHANGELOG.md)

> 🌍 **Read this in:** [English](README.md) | [Español](README.es.md)

![Kryptofolio Banner](docs/assets/banner.png)

> **Kryptofolio** is an open-source crypto portfolio tracker built with Vue 3 and strict Hexagonal Architecture (Ports and Adapters). Designed as a pure visualization platform utilizing a strict FIFO system for data presentation, and technically primed for seamless integration with AI Agents (Vercel AI SDK + Mastra).

## ✨ Key Features

- **📊 FIFO-Based Data Presentation:** Accurate and reliable transaction and balance reporting using a First-In-First-Out (FIFO) methodology to structure the display logic.
- **🏛️ Fiscal & Tax Compliance:** A dedicated Tax Report view to audit operations, detect integrity issues (e.g., missing cost bases or negative balances), and provide structured data for AEAT-compliant reporting.
- **🤖 AI Agent Ready:** The frontend data models are decoupled and specifically designed to be queried by a future AI Agent integration (using Vercel AI SDK and Mastra). You will be able to ask natural language questions about your portfolio in real-time.
- **🛡️ Privacy First:** Fully self-hosted. The backend utilizes a local SQLite database (`fiscal.db`), ensuring your keys and transaction history never leave your machine.
- **🏗️ Hexagonal Architecture:** Strict separation of concerns (Ports & Adapters). The UI layer is completely decoupled from data fetching, enabling high testability and robust runtime validation via Zod.

## 🛠️ Tech Stack & Monorepo

- **Framework**: Vue 3 (Composition API + `<script setup>`)
- **State Management**: [Pinia](https://pinia.vuejs.org/) + [Pinia Colada](https://pinia-colada.esm.dev/)
- **Styling**: TailwindCSS 4
- **Charts**: Lightweight Charts (TradingView) & vue-chartjs (Chart.js)
- **Testing**: Vitest
- **Workspace**: pnpm workspaces (Monorepo)

The repository is structured as a monorepo to support decoupled packages:
- `apps/frontend/`: The main Vue 3 application.
- `packages/api-gateway/`: The Hono-based Backend For Frontend (BFF) providing E2E type safety.
- `packages/`: Shared logic, contracts, and configurations (future).
- `docs/`: Technical documentation covering Architecture, API Integrations, and Extensibility.

## 🎨 Institutional Design System

Kryptofolio implements a strict **Institutional Light** design system (Tailwind v4). You can read the full specifications in [DESIGN.md](DESIGN.md).

**Key Rules & Usage:**
- **Strict Light Mode:** The interface is exclusively light mode to maintain a high-contrast, institutional appearance. Do not use `dark:` classes.
- **Tabular Data:** All numerical data (prices, percentages, dates, IDs) MUST use the `.num` utility class (which applies `font-mono` from JetBrains Mono and `tabular-nums`) to ensure perfect vertical alignment in tables and widgets.
- **Semantic Coloring:** We do not use generic Tailwind colors (`blue-500`, `slate-100`). Use semantic tokens:
  - **Surfaces:** `bg-surface`, `bg-surface-2`, `bg-surface-3`
  - **Text:** `text-fg`, `text-muted`, `text-muted-2`
  - **Financial:** `text-profit`, `text-loss`, `text-warning`, `text-info`
  - **Interactions:** `--color-accent` is a deep institutional indigo. For subtle hovers in ghost buttons or selects, ALWAYS use `hover:bg-accent-soft hover:text-accent-2`.

## 🚀 Quick Start

### Environment Configuration

```bash
# For development
cp .env.example .env

# For production
cp .env.production.example .env.production
```

**Key Variables:**
- `MODE`: (BFF Level) Set to `mock` to serve static JSON data, or `prod` to act as an RPC proxy.
- `PROD_API_URL`: (BFF Level) The URL of the production backend the BFF proxies to in `prod` mode.
- `SECRET_API_KEY`: (BFF Level) Token injected by the BFF when proxying requests in `prod` mode.
- `VITE_API_BASE_URL`: The URL of the BFF from the frontend's perspective (e.g., `http://localhost:8787`).
- `VITE_APP_LANG`: The language for the interface. Valid options are currently `es` or `en`.

### 🌍 Internationalization (i18n)

Kryptofolio uses a zero-dependency, environment-based translation system.

**To choose a language:**
Set `VITE_APP_LANG=en` (English) or `VITE_APP_LANG=es` (Spanish) in your `.env` file and restart the development server. If the variable is missing or invalid, it defaults to English.

**To add a new language (e.g., French `fr`):**
1. Create a new file `src/i18n/dictionaries/fr.ts`.
2. Copy the structure from `en.ts` and translate the values. Ensure the object satisfies the `I18nDictionary` interface.
3. Open `src/core/infrastructure/i18n/EnvI18nAdapter.ts`.
4. Import the new dictionary: `import { fr } from '@/i18n/dictionaries/fr'`
5. Add it to the `dictionaries` map inside the adapter:
   ```typescript
   const dictionaries: Record<string, I18nDictionary> = { en, es, fr }
   ```
6. Set `VITE_APP_LANG=fr` in your `.env` file.

### Local Development

Ensure you have [pnpm](https://pnpm.io/) installed.

```bash
# 1. Clone the repository
git clone https://github.com/nelomr/portfolio-dashboard.git
cd portfolio-dashboard

# 2. Install dependencies at the workspace root
pnpm install

# 3. Start the development environment
# To run the frontend with real APIs:
pnpm dev

# OR, to run the frontend along with the local Backend-for-Frontend (BFF) Mock server:
pnpm run dev:mock
```

> **Note:** The `dev:mock` command concurrently spins up the Vite frontend and the Hono API Gateway, allowing the frontend to consume strictly validated mock data via RPC.

## 🏗️ Architecture: Hexagonal (Ports & Adapters)

This project strictly adheres to **Hexagonal Architecture** (Ports and Adapters) to ensure the UI is completely decoupled from data fetching, API contracts, and external dependencies.

### 🏛️ Architectural Layers

1. **Domain Layer (`src/core/domain/`)**
   The heart of the application. **Total Isolation**: It has absolutely zero external framework dependencies (no Vue, Axios, or Zod imports).
   - **Entities & Value Objects (`models/`)**: Defined using pure TypeScript interfaces. We heavily utilize **Branded Types** (e.g. `AssetId` or `LotId`) to avoid primitive obsession and guarantee type-safety across identifiers.
   - **Ports (`ports/`)**: Interfaces defining the contract for data operations. The domain dictates *what* it needs, not *how* to get it. Note: There is NO `repositories` folder; repository interfaces are outgoing ports.

2. **Application Layer (`src/core/application/`)**
   - **Use Cases (`use-cases/`)**: Pure TypeScript classes that coordinate the Domain Ports. They contain the business orchestration logic without any Vue reactivity or framework imports.

3. **Infrastructure Layer (`src/core/infrastructure/`)**
   The outer edge that communicates with the real world and protects the domain.
   - **Adapters (`adapters/`)**: Concrete implementations of the Domain Ports (e.g. `RestCryptoAdapter`). Must be suffixed with `Adapter`. Note: Mocks are now managed exclusively at the BFF layer.
   - **DTOs & Anti-Corruption Layer (`dtos/`)**: Strict Zod validation schemas (`ExternalTaxSchemas.ts`). These map raw API data (e.g. snake_case or timestamps) to pure Entities and validate payload integrity *before* it ever touches the domain.
   - **Dependency Injection (`di/`)**: The "Composition Root". It instantiates the REST adapters and wires them into Vue (via provide/inject) and Pinia (via a store plugin).

3. **Application & UI Layer (`src/composables/` & `src/views/`)**
   - We utilize `@pinia/colada` to declaratively manage asynchronous server state fetching.
   - **Structural Note**: In this project, **there is no global `src/stores/` or `src/types/` folder**. Types belong to their respective domains, and application state is delegated entirely to Pinia Colada (Server State) and local Composables (UI State). Main views orchestrate using pure injected dependencies.

### 🛡️ Absolute Type Safety & Strict Policies
- **No `any` Policy**: The production source code is 100% statically typed, with no exceptions. It is rigorously compiled using `vue-tsc --noEmit`.
- **Global Error Bus**: If a Zod schema in the Anti-Corruption Layer fails, a controlled error is emitted to the `errorBus`, preventing silent runtime crashes and allowing the UI to react gracefully.

## 🔖 Versioning

This project follows [Semantic Versioning](https://semver.org) (`MAJOR.MINOR.PATCH`) and uses [Conventional Commits](https://www.conventionalcommits.org) to automate releases.

| Commit type | Version bump | Example |
|-------------|-------------|---------|
| `feat: ...` | **minor** `0.x.0` | New feature added |
| `fix: ...` | **patch** `0.0.x` | Bug fix |
| `feat!: ...` or `BREAKING CHANGE:` | **major** `x.0.0` | Breaking change |
| `docs: / test: / chore: / perf: / refactor:` | **none** | Docs, tests, maintenance, performance, code refactoring |

> ⚠️ **Release Pacing Rule:** To avoid excessive version bumps for minor technical changes, **only `feat` (minor) and `fix` (patch) commits will trigger a new version release**. Commits of type `docs`, `refactor`, `test`, and `perf` will be tracked in git but will *not* force a version bump in `package.json` nor create a new GitHub release.

Every push to `main` triggers the CI pipeline. If releasable commits (`feat` or `fix`) are detected, `semantic-release` automatically:
1. Bumps the version in `package.json` and commits the file back to the repository.
2. Updates `CHANGELOG.md` (using the title "Kriptofolio").
3. Creates a GitHub Release with generated notes.
4. Tags the commit (`vX.Y.Z`).

See all releases → [GitHub Releases](https://github.com/nelomr/portfolio-dashboard/releases)
See full history → [CHANGELOG.md](./CHANGELOG.md)

## 📄 License

This project is open-source under the [MIT License](LICENSE).
