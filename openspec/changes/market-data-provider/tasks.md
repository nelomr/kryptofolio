## 1. Shared Contracts (`packages/shared-types`)

- [ ] 1.1 Create `AssetPrice`, `MarketCategory`, and `GlobalMarketMetrics` interfaces in `packages/shared-types/src/market-data/models.ts`
- [ ] 1.2 Create Zod DTO schemas for market data in `packages/shared-types/src/market-data/schemas.ts` and export them in the package entrypoint

## 2. Backend Domain & Ports (`apps/backend`)

- [ ] 2.1 Create `IMarketDataProvider` port interface in `apps/backend/src/core/domain/ports/IMarketDataProvider.ts`
- [ ] 2.2 Create `IPriceHistoryPort` port interface in `apps/backend/src/core/domain/ports/IPriceHistoryPort.ts`

## 3. Backend Orchestration (Application Layer)

- [ ] 3.1 Implement `MarketDataOrchestrator` service to manage active providers and category exclusivity in `apps/backend/src/core/application/services/MarketDataOrchestrator.ts`
- [ ] 3.2 Add unit tests for `MarketDataOrchestrator` to ensure safe toggling and provider isolation

## 4. Backend Adapters (Infrastructure Layer)

- [ ] 4.1 Implement `KrakenMarketDataAdapter` (WebSocket) in `apps/backend/src/core/infrastructure/adapters/KrakenMarketDataAdapter.ts`
- [ ] 4.2 Implement `CoinGeckoMarketDataAdapter` (REST polling) in `apps/backend/src/core/infrastructure/adapters/CoinGeckoMarketDataAdapter.ts`
- [ ] 4.3 Implement `InMemoryPriceHistoryAdapter` for caching in `apps/backend/src/core/infrastructure/adapters/InMemoryPriceHistoryAdapter.ts`
- [ ] 4.4 Scaffold `DuckDbPriceHistoryAdapter` skeleton in `apps/backend/src/core/infrastructure/adapters/DuckDbPriceHistoryAdapter.ts`
- [ ] 4.5 Write validation tests for the Zod DTOs (imported from `@kryptofolio/shared-types`) against mock Kraken and CoinGecko payloads

## 5. Backend API Endpoints

- [ ] 5.1 Create `/api/market/stream` SSE endpoint in `apps/backend/src/api/routes/market.ts`
- [ ] 5.2 Create `/api/market/global` REST endpoint in `apps/backend/src/api/routes/market.ts`

## 6. Frontend Domain & Application (`apps/frontend`)

- [ ] 6.1 Create `IMarketDataPort` in `apps/frontend/src/core/domain/ports/IMarketDataPort.ts`
- [ ] 6.2 Implement `ToggleVaultMarketProviderUseCase` in `apps/frontend/src/core/application/use-cases/ToggleVaultMarketProviderUseCase.ts`
- [ ] 6.3 Write unit tests for the use case to ensure correct port delegation

## 7. Frontend Infrastructure & UI

- [ ] 7.1 Implement `BffMarketDataAdapter` in `apps/frontend/src/core/infrastructure/adapters/BffMarketDataAdapter.ts` to connect to the SSE and REST APIs
- [ ] 7.2 Create `useMarketDataFeed` composable in `apps/frontend/src/composables/queries/useMarketDataFeed.ts` using Pinia Colada and Vue reactivity (importing types from `@kryptofolio/shared-types`)
- [ ] 7.3 Modify `apps/frontend/src/views/Settings/components/VaultConfig.vue` to include the provider UI toggle switch
