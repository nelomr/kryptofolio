# @kryptofolio/database

## 0.0.9

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

## 0.0.8

### Patch Changes

- [`a616b45`](https://github.com/nelomr/kryptofolio/commit/a616b4590a32b80555b789e701cec9a0bcbded4f) Thanks [@nelomr](https://github.com/nelomr)! - - **Phase 2B Analytics & Time Series Engine**: Added DuckDB-powered OLAP queries for daily valuation, 30d annualized volatility, ATH drawdowns, and risk metrics (Sharpe Ratio, Alpha, Beta, Win Rate, Best/Worst Assets) with Hono RPC endpoints and Vue 3 UI widgets.
  - **Domain Layer Isolation & PreciseAmount Value Objects**: Removed direct `decimal.js` dependencies from domain ports (`ILedgerPort`, `IPriceProviderPort`) using branded string value objects (`PreciseAmount`), and enforced strict CSV transaction ingestion constraints.
  - **Portfolio Rebuild Sync & Base Currency Configuration**: Fixed `FifoMaterializerService` synchronization across SQLite ledgers and DuckDB analytical views, and aligned metric adapters with user-configured base currency (`userSettingsPort`).

## 0.0.7

### Patch Changes

- [`3a2a413`](https://github.com/nelomr/kryptofolio/commit/3a2a4136471afeb50f815bba77c619688cb202df) Thanks [@nelomr](https://github.com/nelomr)! - Implement local-first analytical time-series database architecture leveraging DuckDB and Apache Parquet format.

  Key Changes:

  - **DuckDB Parquet Ingestion:** Developed `DuckDbParquetPriceAdapter` implementing a strict, partition-safe write strategy. New records are merged with existing Parquet partition data and deduplicated (using a `QUALIFY ROW_NUMBER() OVER (...)` SQL pattern) before executing the atomic `COPY` operation, preventing accidental directory/partition overrides.
  - **Strict Money Precision:** Configured all pricing, volume, and currency exchange schema definitions to leverage `DECIMAL(38,18)` internally, preventing floating-point inaccuracies in financial calculations.
  - **Daemon Ingestion Use Case:** Implemented `IngestDailyPricesUseCase` using a Clean Architecture "Functional Sandwich" design. Pure logical calculations determine date gaps, while impuro side effects handle domain port inputs/outputs.
  - **Seeding Pipelines:** Created automated, environment-aware seed scripts (`seed_historical_parquet.ts` and `seed_ecb_rates.ts`) for bootstrapping historical exchange rates and daily token prices from Kraken and CoinGecko fallback models.
  - **Architecture Docs:** Documented the new time-series design in `docs/architecture/duckdb-parquet-time-series.md`.

## 0.0.6

### Patch Changes

- [`87563e7`](https://github.com/nelomr/kryptofolio/commit/87563e73af84378293398ee1daef2d5564982b55) Thanks [@nelomr](https://github.com/nelomr)! - feat: Update CI to V6

  Update CI to V6

## 0.0.5

### Patch Changes

- [`0ed1e59`](https://github.com/nelomr/kryptofolio/commit/0ed1e59c96a7b676630212a60760ba4eb62e42f0) Thanks [@nelomr](https://github.com/nelomr)! - feat(phase1): implement SQLite OLTP ledger architecture, data ingestion pipelines, and deterministic UUID hashing

## 0.0.4

### Patch Changes

- [`2775b42`](https://github.com/nelomr/kryptofolio/commit/2775b4230e3cd2ed64da627bf152617dcd7d428a) Thanks [@nelomr](https://github.com/nelomr)! - ci: unified vitest workspace to fix test report summary logs

## 0.0.3

### Patch Changes

- [`18e7028`](https://github.com/nelomr/kryptofolio/commit/18e70285a5b89a564ef31578a537f90afc6589aa) Thanks [@nelomr](https://github.com/nelomr)! - feat: implement real-time market data providers orchestration

  - Added SSE and REST endpoints for live market data and historical prices
  - Added CoinGecko, Kraken, Binance, Coinbase, and Bit2Me provider adapters
  - Implemented DuckDB and InMemory price history caching
  - Integrated Vue composables and UI elements to switch active market providers from the Vault

## 0.0.2

### Patch Changes

- [`bf6dae7`](https://github.com/nelomr/kryptofolio/commit/bf6dae7ff782928b2035649d7b5c53c92ea8dfdd) Thanks [@nelomr](https://github.com/nelomr)! - Implement backend consolidation: decouple database logic into packages/database, implement DuckDB adapter, and configure Hono RPC with unified environment variables. Update configuration and documentation across the workspace.
