import { ref, onScopeDispose } from 'vue';
import { useQuery } from '@pinia/colada';
import type { AssetPrice, GlobalMarketMetrics } from '@kryptofolio/shared-types';
import { BffMarketDataAdapter } from '@/core/infrastructure/adapters/BffMarketDataAdapter';
import { GetMarketDataUseCase } from '@/core/application/use-cases/GetMarketDataUseCase';

// ── Global Singleton State ───────────────────────────────────────────────
// We keep a single SSE connection active across the app to prevent opening
// multiple connections if multiple components call this composable.
const latestPrices = ref<Map<string, AssetPrice>>(new Map());
let activeSubscribers = 0;
let globalUnsubscribe: (() => void) | null = null;

// Instantiate the use case (adapter is created inline — DI via function args in future)
const adapter = new BffMarketDataAdapter();
const useCase = new GetMarketDataUseCase(adapter);

const onPrice = (price: AssetPrice) => {
  latestPrices.value = new Map(latestPrices.value).set(price.symbol, price);
};

/**
 * useMarketDataFeed — Composable for real-time market data consumption.
 *
 * Architectural rules followed:
 *  - Shared singleton state: `latestPrices` is a global ref to share SSE data.
 *  - Ref-counting: connection is closed only when 0 components are using it.
 *  - Server state: globalMetrics are handled via Pinia Colada (useQuery).
 */
export function useMarketDataFeed() {
  activeSubscribers++;

  if (activeSubscribers === 1 && !globalUnsubscribe) {
    globalUnsubscribe = useCase.subscribeToStream(onPrice);
  }

  // Clean up the SSE connection when the last component is destroyed
  onScopeDispose(() => {
    activeSubscribers--;
    if (activeSubscribers === 0 && globalUnsubscribe) {
      globalUnsubscribe();
      globalUnsubscribe = null;
    }
  });

  // ── Pinia Colada query for GlobalMarketMetrics ─────────────────────────
  // useQuery handles: caching, background refetch, loading/error states.
  // staleTime: 60 s — mirrors the CoinGecko polling interval on the backend.
  const {
    data: globalMetrics,
    isLoading: isGlobalLoading,
    error: globalError,
  } = useQuery<GlobalMarketMetrics>({
    key: ['market', 'global'],
    query: () => useCase.getGlobalMetrics(),
    staleTime: 60_000,
  });

  return {
    /** Map of symbol → latest AssetPrice from the SSE stream */
    latestPrices,
    /** Global market metrics (total market cap, Fear & Greed index, top assets) */
    globalMetrics,
    /** True while the global metrics query is loading */
    isGlobalLoading,
    /** Error from the global metrics query, if any */
    globalError,
  };
}
