# @kryptofolio/shared-types

## 1.1.5

### Patch Changes

- [`884e48b`](https://github.com/nelomr/kryptofolio/commit/884e48bef58ca316cb3999110469ed9799725958) Thanks [@nelomr](https://github.com/nelomr)! - - **Display currency becomes arithmetic, not a label**: `base_currency` previously reached the read model as a string echoed back beside unconverted figures, so the same ledger returned identical numbers under two different currency labels. Every monetary figure is now multiplied by a resolved FX rate before it leaves DuckDB, or returned as explicitly native.
  - **Each figure converts at its own date**: a cost basis at its acquisition date, a realized gain and every per-event disposal figure at its disposal date, present value at the latest rate, and each point of a daily series at that point's own date. Unrealized PnL is derived by subtracting two already-converted terms rather than converted a third time. The rate-date rule is a pure function in `core-domain`; adapters apply a basis and never choose one.
  - **`v_fx_daily`**: one view now owns dated rate resolution — direct ECB quotes preferred over synthesised reciprocals, resolution strictly backward-looking. The DuckDB-local `user_settings` table and its `'USD'` seed are **removed**; a derived cache must not hold a second source of truth that survives no rebuild.
  - **Unconvertible figures are reported, never guessed**: a figure no stored rate can express keeps its native amount and says so, instead of entering a total at a factor of one. Two real defects fixed: 500 EUR was being summed into a USD total as 500 USD, and a non-zero cost basis below the destination scale landed on `0` — a phantom 100% gain with no signal attached.
  - **Decimal precision repaired end to end**: gratuitous `DOUBLE` money expressions in the analytics and metrics adapters now stay `DECIMAL`, with operand scales allocated from measurement of the real exchange exports rather than inherited. A unit price of `9.18695e-10` and a cost basis past `1e8` both survive the aggregations.
  - **FX ledger gap detection and backfill**: gaps are computed as an anti-join against ECB _publication_ dates taken from the ECB history document itself, never from a weekday rule, so a covered weekend or holiday is not a gap. Missing dates are filled from the ECB archive on first ingestion and on boot, with document choice an efficiency decision that never bounds coverage. Historical retrieval gets its own parse path: the previous single-date expression silently returned only the newest of 7,068 dates.
  - **The tax report states the currency of its figures**: header and export both carry the display currency and the conversion basis, and a period containing an event no rate could reach reports itself incomplete and names the affected events rather than omitting them. Also fixes an unreachable export endpoint — `/report/download` was shadowed by `/report/:year` and had been returning a 500.
  - **Per-event figures carry their own conversion outcome**: `sale_price_eur` / `gain_loss_eur` are renamed to `sale_price` / `gain_loss` carrying `ConvertedAmount` across both read paths, so the audit trail's rows and the declared base agree. The renderer now distinguishes four states — unresolved, unconvertible, gain, loss — where an unguarded sign comparison reported a failed conversion as a loss the user never had.
  - **The read that materialises stays native by contract**, fixed by test: converting there would persist display-converted figures into `lot_history_events`, indistinguishable from natively-denominated ones.
  - **The AEAT summary states no currency in its field names, and is no longer float money**: `capital_gains_eur` and its five siblings are derived from bases already converted to the display currency, so in a USD report a field named for euros held dollars. They are now `capital_gains`, `capital_losses`, `savings_base_yields`, `general_base_airdrops`, `net_patrimonial_result` and `estimated_irpf`, carried as exact decimal strings and computed with `Decimal` — the 19% IRPF estimate was a float multiplication whose result a user files with a tax authority. The frontend also stops accepting nineteen optional aliases that each defaulted to `0`, and stops computing an entire summary when the field is absent: both turned a missing figure into a declared tax base of zero that no engine produced.

## 1.1.4

### Patch Changes

- [`8fd1422`](https://github.com/nelomr/kryptofolio/commit/8fd1422791d7a8acdde3f5a40d9eff2c020d7e44) Thanks [@nelomr](https://github.com/nelomr)! - - **FIFO Engine & Traceability Pipeline**: Replaced legacy single-account event processing with a robust, multi-account custody model that correctly traces `WITHDRAWAL` and `DEPOSIT` movements without consuming the original lot cost basis.
  - **Source Format Profiles**: Deployed a complete ingestion pipeline redesign. All exchange idiosyncrasies (e.g., Bit2Me row collapse) are now abstracted behind Source Profiles, allowing precise control over trade direction, fee denomination, convention, and precision behind the boundary.
  - **Data Quality & Fidelity**: Implemented a comprehensive fidelity net. Added explicit data quality flags (`MISSING_PRICE`, `CUSTODY_RESIDUAL`, `NEGATIVE_COST_BASIS`) independent of legacy rules. Nullable fiat magnitudes are now correctly handled, and unresolved income rows are explicitly counted rather than silently dropped.
  - **Automatic Rebuild & Manual Overrides**: Introduced automatic portfolio rebuilding mechanics and the foundation for manual fiscal overrides to correct or override lot valuations.
  - **Schema & Migrations**: Applied migrations 004, 005, and 006, wiping legacy derived tables (`spot_transactions`, `tax_lots`) in favor of `lot_custody_entries` and tracking FX conversion provenance. Existing IRPF figures are superseded.
  - **Tax Report UI Enhancements**: Realigned frontend DTOs to standard lot statuses (`OPEN`, `PARTIAL`, `CLOSED`). The UI now renders canonical lot status, full custody history, pending reviews, and correctly surfaces both exclusion counts.
  - **Database Stability**: Resolved an issue where DuckDB's ATTACH could orphan the SQLite WAL, and coerced DuckDB numeric booleans to prevent frontend parsing errors.

## 1.1.3

### Patch Changes

- [`a616b45`](https://github.com/nelomr/kryptofolio/commit/a616b4590a32b80555b789e701cec9a0bcbded4f) Thanks [@nelomr](https://github.com/nelomr)! - - **Phase 2B Analytics & Time Series Engine**: Added DuckDB-powered OLAP queries for daily valuation, 30d annualized volatility, ATH drawdowns, and risk metrics (Sharpe Ratio, Alpha, Beta, Win Rate, Best/Worst Assets) with Hono RPC endpoints and Vue 3 UI widgets.
  - **Domain Layer Isolation & PreciseAmount Value Objects**: Removed direct `decimal.js` dependencies from domain ports (`ILedgerPort`, `IPriceProviderPort`) using branded string value objects (`PreciseAmount`), and enforced strict CSV transaction ingestion constraints.
  - **Portfolio Rebuild Sync & Base Currency Configuration**: Fixed `FifoMaterializerService` synchronization across SQLite ledgers and DuckDB analytical views, and aligned metric adapters with user-configured base currency (`userSettingsPort`).

## 1.1.2

### Patch Changes

- [`0ed1e59`](https://github.com/nelomr/kryptofolio/commit/0ed1e59c96a7b676630212a60760ba4eb62e42f0) Thanks [@nelomr](https://github.com/nelomr)! - feat(phase1): implement SQLite OLTP ledger architecture, data ingestion pipelines, and deterministic UUID hashing

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
