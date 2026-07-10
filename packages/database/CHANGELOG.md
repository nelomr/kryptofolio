# @kryptofolio/database

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
