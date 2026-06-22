# @kryptofolio/shared-types

## 1.1.1

### Patch Changes

- [`e56018d`](https://github.com/nelomr/kryptofolio/commit/e56018dfe7173ba24ad0af653ac6ebe5603c764c) Thanks [@nelomr](https://github.com/nelomr)! - feat(domain): phase 0 domain conditioning - implement Money VO, strict financial precision, and eradicate multi-tenancy

## 1.1.0

### Minor Changes

- [`92580da`](https://github.com/nelomr/kryptofolio/commit/92580dad4761bbf18cfcbdc18cd2af967e87b9ae) Thanks [@nelomr](https://github.com/nelomr)! - Market Data Fiat Normalization and Backend Re-architecture:
  - **Domain & Types**: Introduced `Money`, `Currency`, and `ExchangeRate` value objects. Added `CurrencyConverter` using `decimal.js` to ensure absolute precision and prevent floating-point errors.
  - **Backend Sync**: Created `FetchAndStoreExchangeRatesUC` and a dedicated `ExchangeRateSyncJob` to sync daily fiat rates automatically from the European Central Bank (ECB) XML feed.
  - **Data Normalization**: Implemented `StreamNormalizedMarketDataUC` to intercept raw websocket ticks and normalize prices to the user's active fiat base currency in real-time.
  - **Backend Refactor**: Resolved the "God Object" anti-pattern by splitting `index.ts` into `app.ts` (pure Hono routing) and `index.ts` (DB initialization, jobs, and orchestration). Extracted mock routes into isolated modules.
  - **Frontend Settings**: Added a new `CurrencySettings` component in the UI to allow users to select their base currency (USD, EUR, GBP) and trigger manual rate synchronizations.

## 1.0.3

### Patch Changes

- [`2775b42`](https://github.com/nelomr/kryptofolio/commit/2775b4230e3cd2ed64da627bf152617dcd7d428a) Thanks [@nelomr](https://github.com/nelomr)! - ci: unified vitest workspace to fix test report summary logs

## 1.0.2

### Patch Changes

- [`18e7028`](https://github.com/nelomr/kryptofolio/commit/18e70285a5b89a564ef31578a537f90afc6589aa) Thanks [@nelomr](https://github.com/nelomr)! - feat: implement real-time market data providers orchestration

  - Added SSE and REST endpoints for live market data and historical prices
  - Added CoinGecko, Kraken, Binance, Coinbase, and Bit2Me provider adapters
  - Implemented DuckDB and InMemory price history caching
  - Integrated Vue composables and UI elements to switch active market providers from the Vault

## 1.0.1

### Patch Changes

- 5005c43: Refactor: Migration to PNPM Workspaces monorepo architecture with decoupled packages, PNPM Catalogs, and strict architectural boundaries.
