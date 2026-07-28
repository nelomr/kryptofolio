---
"@kryptofolio/frontend": patch
"@kryptofolio/backend": patch
"@kryptofolio/database": patch
"@kryptofolio/shared-types": patch
---

- **Phase 2B Analytics & Time Series Engine**: Added DuckDB-powered OLAP queries for daily valuation, 30d annualized volatility, ATH drawdowns, and risk metrics (Sharpe Ratio, Alpha, Beta, Win Rate, Best/Worst Assets) with Hono RPC endpoints and Vue 3 UI widgets.
- **Domain Layer Isolation & PreciseAmount Value Objects**: Removed direct `decimal.js` dependencies from domain ports (`ILedgerPort`, `IPriceProviderPort`) using branded string value objects (`PreciseAmount`), and enforced strict CSV transaction ingestion constraints.
- **Portfolio Rebuild Sync & Base Currency Configuration**: Fixed `FifoMaterializerService` synchronization across SQLite ledgers and DuckDB analytical views, and aligned metric adapters with user-configured base currency (`userSettingsPort`).
