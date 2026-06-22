# Kryptofolio - Complete Professional Database Design Strategy (Single-User Local-First)

**Version**: 3.0 - Exhaustive Execution Plan  
**Date**: June 22, 2026  
**Objective**: Provide a flawless, technical, and highly detailed roadmap to implement a production-grade database architecture in Kryptofolio. This respects the existing Hexagonal/Clean Architecture, repository mocks/fixtures, and the strict local-first (single-user) approach.

This document serves as the absolute technical blueprint. The phases are designed to be strictly independent, allowing for correct and incremental execution without ballooning into giant, unmanageable change scopes.

---

## 🏛️ Fundamental Architectural Principles (Single-User)

- **Single-User Paradigm**: There is no `user_id` or multi-tenancy. Everything belongs strictly to the local user.
- **Immutable Ledger**: Transactions represent a historical ledger. Only insertions and soft-deletes are allowed to ensure auditability.
- **Extreme Financial Precision**: Floating-point math (`REAL`/`FLOAT`) is strictly forbidden to avoid IEEE-754 rounding errors.
  - **SQLite**: All monetary columns (`amount`, `fiat_value_eur`, `fee_amount`, `remaining_amount`, `acquisition_cost_eur`) MUST be defined as `TEXT`.
  - **TypeScript**: Hydration in the repository layer must use `decimal.js` or `big.js`.
  - **DuckDB**: During federated queries, strings will be dynamically cast using `CAST(column AS DECIMAL(38,18))`.
- **Dual Architecture (OLTP + OLAP + Series)**:
  - **SQLite**: OLTP - ACID transactional persistence. The immutable ledger.
  - **DuckDB**: OLAP - In-memory analytical calculations (FIFO, PNL, TTWROR, IRR, Tax Reports) via Zero-Copy integration.
  - **Apache Parquet**: Columnar storage for historical prices with Hive partitioning (`year=YYYY/month=MM/`).
- **Naming Conventions**: English, `snake_case`, plural table names.
- **Soft Delete**: `deleted_at timestamptz` on main tables.

---

## 📊 Database Schema (DBML)

```dbml
Table assets {
  id uuid [pk, default: gen_random_uuid()]
  symbol varchar(20) [unique, not null]
  name varchar(100)
  type varchar(20) [not null, check: type IN ('crypto', 'stock', 'fiat', 'etf')]
  decimals integer [default: 8]
  coingecko_id varchar(100)
  is_active boolean [default: true]
  created_at timestamptz [default: now()]
}

Table accounts {
  id uuid [pk, default: gen_random_uuid()]
  name varchar(100) [not null]
  type varchar(30) [not null, check: type IN ('exchange', 'wallet', 'broker', 'manual')]
  exchange varchar(50)
  is_foreign boolean [default: false] /* Crucial for Modelo 721 compliance */
  country_code varchar(2)
  metadata jsonb
  created_at timestamptz [default: now()]
}

Table transactions {
  id uuid [pk, default: gen_random_uuid()]
  id_hash varchar(64) [unique, not null] /* Deterministic hash from frontend for idempotency */
  account_id uuid [ref: > accounts.id]
  asset_id uuid [ref: > assets.id]
  asset_symbol varchar(20) /* Denormalized to optimize Parquet JOINs */
  tx_type varchar(30) [not null]  /* BUY, SELL, SWAP_IN, SWAP_OUT, TRANSFER_IN, TRANSFER_OUT, FEE, STAKING_REWARD, AIRDROP */
  amount text [not null] /* Stored as TEXT for Decimal.js precision */
  fiat_value_eur text  /* Value in EUR fixed at the exact moment of transaction */
  fee_amount text [default: '0']
  fee_asset_id uuid [ref: > assets.id]
  related_tx_id uuid [ref: > transactions.id]  /* Links SWAP_IN and SWAP_OUT */
  timestamp timestamptz [not null]
  tx_hash varchar(100)
  source varchar(50)  /* csv_import, manual, api */
  notes text
  created_at timestamptz [default: now()]
  deleted_at timestamptz
}

Table tax_lots {
  id uuid [pk, default: gen_random_uuid()]
  transaction_id uuid [ref: > transactions.id]
  asset_id uuid [ref: > assets.id]
  remaining_amount text [not null] /* Stored as TEXT */
  acquisition_cost_eur text [not null] /* Stored as TEXT */
  acquisition_timestamp timestamptz [not null]
  is_closed boolean [default: false]
}

Table tax_carryforward {
  id uuid [pk, default: gen_random_uuid()]
  year integer [not null] /* Year the loss was generated */
  amount_eur text [not null] /* Loss amount to be carried forward */
  expiration_year integer [not null] /* Typically year + 4 in Spain */
  is_consumed boolean [default: false]
}

Table audit_log {
  id uuid [pk, default: gen_random_uuid()]
  action varchar(50)
  entity_type varchar(50)
  entity_id uuid
  changes jsonb
  timestamp timestamptz [default: now()]
}
```

**Key Indexes**:
```sql
CREATE INDEX IF NOT EXISTS idx_transactions_asset_time ON transactions(asset_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_transactions_timestamp ON transactions(timestamp);
CREATE INDEX IF NOT EXISTS idx_tax_lots_asset_acq ON tax_lots(asset_id, acquisition_timestamp);
CREATE INDEX IF NOT EXISTS idx_transactions_asset_symbol ON transactions(asset_symbol);
```

---

## 📑 Index of Execution Phases

- [Phase 0: Domain Conditioning & Business Rules](#phase-0-domain-conditioning--business-rules)
- [Phase 1: Deployment of Transactional Layer (SQLite OLTP)](#phase-1-deployment-of-transactional-layer-sqlite-oltp)
- [Phase 2: Instantiation of Analytical Engine (DuckDB)](#phase-2-instantiation-of-analytical-engine-duckdb)
- [Phase 3: Columnar Integration & Historical Data (Parquet)](#phase-3-columnar-integration--historical-data-parquet)
- [Phase 4: Backup, Migrations, and Maintenance](#phase-4-backup-migrations-and-maintenance)
- [Phase 5: Tax Reporting & Wealth Auditing](#phase-5-tax-reporting--wealth-auditing)

---

## 🚀 Detailed Execution Phases

### Phase 0: Domain Conditioning & Business Rules
**Objective**: Prepare the TypeScript domain layer for extreme precision and single-user isolation.
- **Processes & Creations**:
  - Audit `packages/core-domain/src/entities/` and strictly remove all multi-tenancy properties (`user_id`, `owner_id`).
  - Implement `decimal.js` or `big.js` across the entire Domain and Application layer. All balances, amounts, and fees MUST be instantiated using these classes instead of native JS `number`.
- **Routes & Locations**: `packages/core-domain/src/entities/`, `packages/core-domain/src/use-cases/`.
- **Schemas & Validations**: Update Zod schemas in `packages/shared-types` to validate strings representing valid decimal numbers (`z.string().regex(/^-?\d+(\.\d+)?$/)`).
- **TDD / Testing**: Update existing fixtures in `packages/database/tests/` to use string-based decimals. Add edge case tests for dust amounts.

### Phase 1: Deployment of Transactional Layer (SQLite OLTP)
**Objective**: Establish the immutable, ACID-compliant ledger.
- **Processes & Creations**:
  - Generate the SQL migration using `STRICT` mode.
  - Configure `TEXT` types for all financial columns.
  - Implement database `CHECK` constraints to prevent malformed text (e.g., `CHECK (amount GLOB '[-0-9.]*')`).
  - Implement `deleted_at` logical deletion (soft-delete) and `updated_at` triggers.
- **Routes & Locations**: `packages/database/migrations/sqlite/002_ledger_schema.sql`, `packages/infrastructure/src/adapters/SQLiteLedgerAdapter.ts`.
- **Schemas & Validations**: Data Mappers in the infrastructure layer must intercept SQLite `TEXT` reads and hydrate them back into Domain `Decimal` objects.
- **TDD / Testing**: Write repository tests validating that precision is perfectly maintained after a save/load cycle of a number with 18 decimal places.

### Phase 2: Instantiation of Analytical Engine (DuckDB)
**Objective**: Create the in-memory engine capable of running complex financial algorithms like FIFO without blocking the Node.js event loop.
- **Processes & Creations**:
  - Establish the ephemeral DuckDB connection (`:memory:`).
  - Execute zero-copy `ATTACH 'kryptofolio_ledger.db' AS ledger (TYPE SQLITE);`.
  - Develop the SQL views utilizing Window Functions (`SUM() OVER`) for the asynchronous FIFO tax lot matching algorithm.
- **Routes & Locations**: `packages/infrastructure/src/analytics/DuckDbTaxCalculator.ts`.
- **Schemas & Validations**: DuckDB must perform explicit casts when reading SQLite text columns: `CAST(amount AS DECIMAL(38,18))`.
- **TDD / Testing**: Create specific DuckDB integration tests validating FIFO consumption. Ensure partial sells correctly decrement `remaining_amount` and map to multiple tax lots.

### Phase 3: Columnar Integration & Historical Data (Parquet)
**Objective**: Federate historical price data to allow instantaneous ROI, TTWROR, and IRR calculations.
- **Processes & Creations**:
  - Build a background worker/daemon in TypeScript to download historical data (CoinGecko/Binance).
  - Use DuckDB `COPY` to persist data into Hive-partitioned directories (`year=2026/month=01/`).
  - Implement the Advanced Federated Query utilizing `COALESCE` for mathematical fallbacks if a daily price is missing.
- **Routes & Locations**: `data/historical/prices/`, `packages/infrastructure/src/workers/PriceIngestionWorker.ts`.
- **Schemas & Validations**: Restrict DuckDB memory footprint using `PRAGMA memory_limit='1GB'` to protect the user's OS.
- **TDD / Testing**: Provide small `mock_prices_2025.parquet` fixtures. Test the `LEFT JOIN` federation to ensure the query succeeds and correctly applies the fallback logic.

### Phase 4: Backup, Migrations, and Maintenance
**Objective**: Protect the local user's data lifecycle.
- **Processes & Creations**:
  - Implement an automated routine to clone `kryptofolio_ledger.db` before major migrations or large CSV ingestions.
  - Schedule `VACUUM` commands in SQLite to defragment the disk after massive soft-deletes.
- **Routes & Locations**: `packages/infrastructure/src/maintenance/BackupService.ts`.
- **TDD / Testing**: Test backup restoration processes, verify data integrity post-VACUUM, and assert CSV import idempotency.

### Phase 5: Tax Reporting & Wealth Auditing
**Objective**: Align system outputs with AEAT (Spanish Tax Agency) requirements for 2025/2026.
- **Processes & Creations**:
  - **Wealth Tax (Modelo 714)**: Query live balances at exactly 23:59:59 on Dec 31st against Parquet pricing. Trigger UI alerts if the total exceeds the Valencian threshold of €1,000,000.
  - **Foreign Assets (Modelo 721)**: Group balances by `accounts.is_foreign = true`. If the sum exceeds €50,000, enable CSV/PDF export with exact public keys and fiat values.
  - **Income Tax (IRPF)**: Differentiate `STAKING_REWARD` (Savings Base) from `AIRDROP` (General Base). Apply tax carryforward logic for previous losses up to 4 years.
- **Routes & Locations**: `packages/infrastructure/src/analytics/AEATReportingService.ts`.
- **TDD / Testing**: Simulate an account with €49,999 vs €50,001 in foreign exchanges and verify the Modelo 721 trigger. Mock multi-year carryforward overlaps to assert chronological loss expiration.
