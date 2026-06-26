---
"@kryptofolio/backend": patch
"@kryptofolio/shared-types": patch
---

Refactored all market data adapters (Kraken, CoinGecko, Binance, Coinbase, Bit2Me) to strictly use Zod schemas and emit validation and network errors to the orchestrator via a new onError callback for complete observability.
