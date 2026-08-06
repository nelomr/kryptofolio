# @kryptofolio/core-domain

## 1.1.4

### Patch Changes

- [`8fd1422`](https://github.com/nelomr/kryptofolio/commit/8fd1422791d7a8acdde3f5a40d9eff2c020d7e44) Thanks [@nelomr](https://github.com/nelomr)! - - **FIFO Engine & Traceability Pipeline**: Replaced legacy single-account event processing with a robust, multi-account custody model that correctly traces `WITHDRAWAL` and `DEPOSIT` movements without consuming the original lot cost basis.
  - **Source Format Profiles**: Deployed a complete ingestion pipeline redesign. All exchange idiosyncrasies (e.g., Bit2Me row collapse) are now abstracted behind Source Profiles, allowing precise control over trade direction, fee denomination, convention, and precision behind the boundary.
  - **Data Quality & Fidelity**: Implemented a comprehensive fidelity net. Added explicit data quality flags (`MISSING_PRICE`, `CUSTODY_RESIDUAL`, `NEGATIVE_COST_BASIS`) independent of legacy rules. Nullable fiat magnitudes are now correctly handled, and unresolved income rows are explicitly counted rather than silently dropped.
  - **Automatic Rebuild & Manual Overrides**: Introduced automatic portfolio rebuilding mechanics and the foundation for manual fiscal overrides to correct or override lot valuations.
  - **Schema & Migrations**: Applied migrations 004, 005, and 006, wiping legacy derived tables (`spot_transactions`, `tax_lots`) in favor of `lot_custody_entries` and tracking FX conversion provenance. Existing IRPF figures are superseded.
  - **Tax Report UI Enhancements**: Realigned frontend DTOs to standard lot statuses (`OPEN`, `PARTIAL`, `CLOSED`). The UI now renders canonical lot status, full custody history, pending reviews, and correctly surfaces both exclusion counts.
  - **Database Stability**: Resolved an issue where DuckDB's ATTACH could orphan the SQLite WAL, and coerced DuckDB numeric booleans to prevent frontend parsing errors.
- Updated dependencies [[`8fd1422`](https://github.com/nelomr/kryptofolio/commit/8fd1422791d7a8acdde3f5a40d9eff2c020d7e44)]:
  - @kryptofolio/shared-types@1.1.4

## 1.1.3

### Patch Changes

- Updated dependencies [[`a616b45`](https://github.com/nelomr/kryptofolio/commit/a616b4590a32b80555b789e701cec9a0bcbded4f)]:
  - @kryptofolio/shared-types@1.1.3

## 1.1.2

### Patch Changes

- [`0ed1e59`](https://github.com/nelomr/kryptofolio/commit/0ed1e59c96a7b676630212a60760ba4eb62e42f0) Thanks [@nelomr](https://github.com/nelomr)! - feat(phase1): implement SQLite OLTP ledger architecture, data ingestion pipelines, and deterministic UUID hashing

- Updated dependencies [[`0ed1e59`](https://github.com/nelomr/kryptofolio/commit/0ed1e59c96a7b676630212a60760ba4eb62e42f0)]:
  - @kryptofolio/shared-types@1.1.2

## 1.1.1

### Patch Changes

- [`e56018d`](https://github.com/nelomr/kryptofolio/commit/e56018dfe7173ba24ad0af653ac6ebe5603c764c) Thanks [@nelomr](https://github.com/nelomr)! - feat(domain): phase 0 domain conditioning - implement Money VO, strict financial precision, and eradicate multi-tenancy

- Updated dependencies [[`e56018d`](https://github.com/nelomr/kryptofolio/commit/e56018dfe7173ba24ad0af653ac6ebe5603c764c)]:
  - @kryptofolio/shared-types@1.1.1

## 1.1.0

### Minor Changes

- [`92580da`](https://github.com/nelomr/kryptofolio/commit/92580dad4761bbf18cfcbdc18cd2af967e87b9ae) Thanks [@nelomr](https://github.com/nelomr)! - Market Data Fiat Normalization and Backend Re-architecture:
  - **Domain & Types**: Introduced `Money`, `Currency`, and `ExchangeRate` value objects. Added `CurrencyConverter` using `decimal.js` to ensure absolute precision and prevent floating-point errors.
  - **Backend Sync**: Created `FetchAndStoreExchangeRatesUC` and a dedicated `ExchangeRateSyncJob` to sync daily fiat rates automatically from the European Central Bank (ECB) XML feed.
  - **Data Normalization**: Implemented `StreamNormalizedMarketDataUC` to intercept raw websocket ticks and normalize prices to the user's active fiat base currency in real-time.
  - **Backend Refactor**: Resolved the "God Object" anti-pattern by splitting `index.ts` into `app.ts` (pure Hono routing) and `index.ts` (DB initialization, jobs, and orchestration). Extracted mock routes into isolated modules.
  - **Frontend Settings**: Added a new `CurrencySettings` component in the UI to allow users to select their base currency (USD, EUR, GBP) and trigger manual rate synchronizations.

### Patch Changes

- Updated dependencies [[`92580da`](https://github.com/nelomr/kryptofolio/commit/92580dad4761bbf18cfcbdc18cd2af967e87b9ae)]:
  - @kryptofolio/shared-types@1.1.0

## 1.0.3

### Patch Changes

- [`2775b42`](https://github.com/nelomr/kryptofolio/commit/2775b4230e3cd2ed64da627bf152617dcd7d428a) Thanks [@nelomr](https://github.com/nelomr)! - ci: unified vitest workspace to fix test report summary logs

- Updated dependencies [[`2775b42`](https://github.com/nelomr/kryptofolio/commit/2775b4230e3cd2ed64da627bf152617dcd7d428a)]:
  - @kryptofolio/shared-types@1.0.3

## 1.0.2

### Patch Changes

- Updated dependencies [[`18e7028`](https://github.com/nelomr/kryptofolio/commit/18e70285a5b89a564ef31578a537f90afc6589aa)]:
  - @kryptofolio/shared-types@1.0.2

## 1.0.1

### Patch Changes

- 5005c43: Refactor: Migration to PNPM Workspaces monorepo architecture with decoupled packages, PNPM Catalogs, and strict architectural boundaries.
- Updated dependencies [5005c43]
  - @kryptofolio/shared-types@1.0.1
