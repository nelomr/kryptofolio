---
"@kryptofolio/backend": patch
"@kryptofolio/database": patch
---

Implement local-first analytical time-series database architecture leveraging DuckDB and Apache Parquet format.

Key Changes:
- **DuckDB Parquet Ingestion:** Developed `DuckDbParquetPriceAdapter` implementing a strict, partition-safe write strategy. New records are merged with existing Parquet partition data and deduplicated (using a `QUALIFY ROW_NUMBER() OVER (...)` SQL pattern) before executing the atomic `COPY` operation, preventing accidental directory/partition overrides.
- **Strict Money Precision:** Configured all pricing, volume, and currency exchange schema definitions to leverage `DECIMAL(38,18)` internally, preventing floating-point inaccuracies in financial calculations.
- **Daemon Ingestion Use Case:** Implemented `IngestDailyPricesUseCase` using a Clean Architecture "Functional Sandwich" design. Pure logical calculations determine date gaps, while impuro side effects handle domain port inputs/outputs.
- **Seeding Pipelines:** Created automated, environment-aware seed scripts (`seed_historical_parquet.ts` and `seed_ecb_rates.ts`) for bootstrapping historical exchange rates and daily token prices from Kraken and CoinGecko fallback models.
- **Architecture Docs:** Documented the new time-series design in `docs/architecture/duckdb-parquet-time-series.md`.
