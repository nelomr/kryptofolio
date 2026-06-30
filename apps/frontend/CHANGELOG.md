# @kryptofolio/frontend

## 1.16.3

### Patch Changes

- [`87563e7`](https://github.com/nelomr/kryptofolio/commit/87563e73af84378293398ee1daef2d5564982b55) Thanks [@nelomr](https://github.com/nelomr)! - feat: Update CI to V6

  Update CI to V6

## 1.16.2

### Patch Changes

- [`0ed1e59`](https://github.com/nelomr/kryptofolio/commit/0ed1e59c96a7b676630212a60760ba4eb62e42f0) Thanks [@nelomr](https://github.com/nelomr)! - feat(phase1): implement SQLite OLTP ledger architecture, data ingestion pipelines, and deterministic UUID hashing

- Updated dependencies [[`0ed1e59`](https://github.com/nelomr/kryptofolio/commit/0ed1e59c96a7b676630212a60760ba4eb62e42f0)]:
  - @kryptofolio/core-domain@1.1.2
  - @kryptofolio/shared-types@1.1.2

## 1.16.1

### Patch Changes

- [`e56018d`](https://github.com/nelomr/kryptofolio/commit/e56018dfe7173ba24ad0af653ac6ebe5603c764c) Thanks [@nelomr](https://github.com/nelomr)! - feat(domain): phase 0 domain conditioning - implement Money VO, strict financial precision, and eradicate multi-tenancy

- Updated dependencies [[`e56018d`](https://github.com/nelomr/kryptofolio/commit/e56018dfe7173ba24ad0af653ac6ebe5603c764c)]:
  - @kryptofolio/core-domain@1.1.1
  - @kryptofolio/shared-types@1.1.1

## 1.16.0

### Minor Changes

- [`92580da`](https://github.com/nelomr/kryptofolio/commit/92580dad4761bbf18cfcbdc18cd2af967e87b9ae) Thanks [@nelomr](https://github.com/nelomr)! - Market Data Fiat Normalization and Backend Re-architecture:
  - **Domain & Types**: Introduced `Money`, `Currency`, and `ExchangeRate` value objects. Added `CurrencyConverter` using `decimal.js` to ensure absolute precision and prevent floating-point errors.
  - **Backend Sync**: Created `FetchAndStoreExchangeRatesUC` and a dedicated `ExchangeRateSyncJob` to sync daily fiat rates automatically from the European Central Bank (ECB) XML feed.
  - **Data Normalization**: Implemented `StreamNormalizedMarketDataUC` to intercept raw websocket ticks and normalize prices to the user's active fiat base currency in real-time.
  - **Backend Refactor**: Resolved the "God Object" anti-pattern by splitting `index.ts` into `app.ts` (pure Hono routing) and `index.ts` (DB initialization, jobs, and orchestration). Extracted mock routes into isolated modules.
  - **Frontend Settings**: Added a new `CurrencySettings` component in the UI to allow users to select their base currency (USD, EUR, GBP) and trigger manual rate synchronizations.

### Patch Changes

- Updated dependencies [[`92580da`](https://github.com/nelomr/kryptofolio/commit/92580dad4761bbf18cfcbdc18cd2af967e87b9ae)]:
  - @kryptofolio/core-domain@1.1.0
  - @kryptofolio/shared-types@1.1.0

## 1.15.12

### Patch Changes

- [`ca6ca05`](https://github.com/nelomr/kryptofolio/commit/ca6ca055b8feb1e848ebad1d2ee98b6e9d1342dd) Thanks [@nelomr](https://github.com/nelomr)! - chore: force pipeline to run release process with updated github action

## 1.15.11

### Patch Changes

- [`e53e978`](https://github.com/nelomr/kryptofolio/commit/e53e9783a8e9224dedd02654ae7ff80001bae348) Thanks [@nelomr](https://github.com/nelomr)! - chore: align frontend package version with historical global tag

## 1.14.4

### Patch Changes

- [`2775b42`](https://github.com/nelomr/kryptofolio/commit/2775b4230e3cd2ed64da627bf152617dcd7d428a) Thanks [@nelomr](https://github.com/nelomr)! - ci: unified vitest workspace to fix test report summary logs

- Updated dependencies [[`2775b42`](https://github.com/nelomr/kryptofolio/commit/2775b4230e3cd2ed64da627bf152617dcd7d428a)]:
  - @kryptofolio/core-domain@1.0.3
  - @kryptofolio/shared-types@1.0.3

## 1.14.3

### Patch Changes

- [`18e7028`](https://github.com/nelomr/kryptofolio/commit/18e70285a5b89a564ef31578a537f90afc6589aa) Thanks [@nelomr](https://github.com/nelomr)! - feat: implement real-time market data providers orchestration

  - Added SSE and REST endpoints for live market data and historical prices
  - Added CoinGecko, Kraken, Binance, Coinbase, and Bit2Me provider adapters
  - Implemented DuckDB and InMemory price history caching
  - Integrated Vue composables and UI elements to switch active market providers from the Vault

- Updated dependencies [[`18e7028`](https://github.com/nelomr/kryptofolio/commit/18e70285a5b89a564ef31578a537f90afc6589aa)]:
  - @kryptofolio/shared-types@1.0.2
  - @kryptofolio/core-domain@1.0.2

## 1.14.2

### Patch Changes

- [`bf6dae7`](https://github.com/nelomr/kryptofolio/commit/bf6dae7ff782928b2035649d7b5c53c92ea8dfdd) Thanks [@nelomr](https://github.com/nelomr)! - Implement backend consolidation: decouple database logic into packages/database, implement DuckDB adapter, and configure Hono RPC with unified environment variables. Update configuration and documentation across the workspace.

## 1.14.1

### Patch Changes

- 5005c43: Refactor: Migration to PNPM Workspaces monorepo architecture with decoupled packages, PNPM Catalogs, and strict architectural boundaries.
- Updated dependencies [5005c43]
  - @kryptofolio/core-domain@1.0.1
  - @kryptofolio/shared-types@1.0.1
