/**
 * usePortfolioQueries — Composable description.
 */

import { inject } from "vue";
import { useQuery, useMutation, useQueryCache } from "@pinia/colada";
import { PORTFOLIO_PORT_KEY } from "@/core/injectionKeys";
import type { ICryptoPortfolioPort } from "@/core/domain/ports/ICryptoPortfolioPort";
import type { PortfolioSummaryEntity } from "@/core/domain/models/PortfolioEntities";
import { GetPortfolioSummaryUseCase } from "@/core/application/use-cases/GetPortfolioSummaryUseCase";
import { GetTokenHistoryUseCase } from "@/core/application/use-cases/GetTokenHistoryUseCase";
import { TriggerRebuildUseCase } from "@/core/application/use-cases/TriggerRebuildUseCase";

/**
 * Helper to securely inject the portfolio port.
 */
export function usePortfolioPort(): ICryptoPortfolioPort {
  const port = inject(PORTFOLIO_PORT_KEY);
  if (!port) {
    throw new Error(
      "[usePortfolioQueries] ICryptoPortfolioPort not provided. " +
        "Ensure main.ts calls pinia.use() to inject ports.",
    );
  }
  return port;
}

/**
 * usePortfolioSummaryQuery
 * Fetches the global portfolio summary via the injected adapter and caches it.
 */
export function usePortfolioSummaryQuery() {
  const port = usePortfolioPort();
  const useCase = new GetPortfolioSummaryUseCase(port);

  return useQuery<PortfolioSummaryEntity>({
    key: ["portfolio-summary"],
    query: () => useCase.execute(),
    // Colada handles deduplication, caching, and state out of the box
  });
}

/**
 * useTokenHistoryQuery
 * Fetches the specific lot and event history for a given symbol.
 */
export function useTokenHistoryQuery(symbol: import("vue").Ref<string>) {
  const port = usePortfolioPort();

  const useCase = new GetTokenHistoryUseCase(port);

  return useQuery({
    key: () => ["token-history", symbol.value],
    query: () => useCase.execute(symbol.value),
    enabled: () => !!symbol.value,
  });
}

/**
 * useRebuildMutation
 * Triggers a manual re-sync/rebuild of the portfolio and invalidates the summary query cache upon success.
 */
export function useRebuildMutation() {
  const port = usePortfolioPort();
  const queryCache = useQueryCache();
  const useCase = new TriggerRebuildUseCase(port);

  return useMutation({
    mutation: () => useCase.execute(),
    onSuccess: () => {
      // Invalidate cache to force a background refetch across all components using the query
      queryCache.invalidateQueries({ key: ["portfolio-summary"] });
    },
  });
}
