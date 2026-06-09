/**
 * usePortfolioQueries — Composable description.
 */

import { inject } from 'vue'
import { useQuery, useMutation, useQueryCache } from '@pinia/colada'
import { PORTFOLIO_REPO_KEY } from '@/core/injectionKeys'
import type { ICryptoPortfolioPort } from '@/core/domain/ports/ICryptoPortfolioPort'
import type { PortfolioSummaryEntity } from '@/core/domain/models/PortfolioEntities'
import { GetPortfolioSummaryUseCase } from '@/core/application/use-cases/GetPortfolioSummaryUseCase'
import { GetTokenHistoryUseCase } from '@/core/application/use-cases/GetTokenHistoryUseCase'
import { TriggerRebuildUseCase } from '@/core/application/use-cases/TriggerRebuildUseCase'

/**
 * Helper to securely inject the portfolio repository.
 */
export function usePortfolioRepo(): ICryptoPortfolioPort {
  const repo = inject(PORTFOLIO_REPO_KEY)
  if (!repo) {
    throw new Error(
      '[usePortfolioQueries] ICryptoPortfolioPort not provided. ' +
      'Ensure main.ts calls pinia.use() to inject repositories.'
    )
  }
  return repo
}

/**
 * usePortfolioSummaryQuery
 * Fetches the global portfolio summary via the injected adapter and caches it.
 */
export function usePortfolioSummaryQuery() {
  const repo = usePortfolioRepo()
  const useCase = new GetPortfolioSummaryUseCase(repo)

  return useQuery<PortfolioSummaryEntity>({
    key: ['portfolio-summary'],
    query: () => useCase.execute(),
    // Colada handles deduplication, caching, and state out of the box
  })
}

/**
 * useTokenHistoryQuery
 * Fetches the specific lot and event history for a given symbol.
 */
export function useTokenHistoryQuery(symbol: import('vue').Ref<string>) {
  const repo = usePortfolioRepo()

  const useCase = new GetTokenHistoryUseCase(repo)

  return useQuery({
    key: () => ['token-history', symbol.value],
    query: () => useCase.execute(symbol.value),
    enabled: () => !!symbol.value,
  })
}

/**
 * useRebuildMutation
 * Triggers a manual re-sync/rebuild of the portfolio and invalidates the summary query cache upon success.
 */
export function useRebuildMutation() {
  const repo = usePortfolioRepo()
  const queryCache = useQueryCache()
  const useCase = new TriggerRebuildUseCase(repo)

  return useMutation({
    mutation: () => useCase.execute(),
    onSuccess: () => {
      // Invalidate cache to force a background refetch across all components using the query
      queryCache.invalidateQueries({ key: ['portfolio-summary'] })
    },
  })
}
