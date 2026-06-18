---
"@kryptofolio/frontend": patch
"@kryptofolio/backend": patch
"@kryptofolio/database": patch
"@kryptofolio/shared-types": patch
---

feat: implement real-time market data providers orchestration

- Added SSE and REST endpoints for live market data and historical prices
- Added CoinGecko, Kraken, Binance, Coinbase, and Bit2Me provider adapters
- Implemented DuckDB and InMemory price history caching
- Integrated Vue composables and UI elements to switch active market providers from the Vault
