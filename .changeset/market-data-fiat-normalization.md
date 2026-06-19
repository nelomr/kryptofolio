---
"@kryptofolio/backend": minor
"@kryptofolio/frontend": minor
"@kryptofolio/core-domain": minor
"@kryptofolio/shared-types": minor
---

Market Data Fiat Normalization and Backend Re-architecture:
- **Domain & Types**: Introduced `Money`, `Currency`, and `ExchangeRate` value objects. Added `CurrencyConverter` using `decimal.js` to ensure absolute precision and prevent floating-point errors.
- **Backend Sync**: Created `FetchAndStoreExchangeRatesUC` and a dedicated `ExchangeRateSyncJob` to sync daily fiat rates automatically from the European Central Bank (ECB) XML feed.
- **Data Normalization**: Implemented `StreamNormalizedMarketDataUC` to intercept raw websocket ticks and normalize prices to the user's active fiat base currency in real-time.
- **Backend Refactor**: Resolved the "God Object" anti-pattern by splitting `index.ts` into `app.ts` (pure Hono routing) and `index.ts` (DB initialization, jobs, and orchestration). Extracted mock routes into isolated modules.
- **Frontend Settings**: Added a new `CurrencySettings` component in the UI to allow users to select their base currency (USD, EUR, GBP) and trigger manual rate synchronizations.
