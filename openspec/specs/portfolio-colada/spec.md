# Specifications: Pinia Colada Migration

## Requirements
1. **Data Fetching via Colada**: `useQuery` must be used to fetch the Portfolio Summary. The query must automatically handle `isLoading`, `error`, and caching.
2. **Mutations via Colada**: Rebuilding the index (`triggerRebuild`) must be handled by `useMutation`.
3. **Cache Invalidation**: Upon a successful rebuild mutation, the portfolio summary cache must be automatically invalidated so the `useQuery` refetches the fresh data without manual reloading.
4. **Hexagonal Architecture Compliance**: Data fetching logic still relies on the injected `ICryptoPortfolioPort` adapter. `useQuery` simply wraps the repository methods.
5. **No Regression**: The UI must behave identically. The loading states, rebuild spin animations, and data displays must map directly to Colada's `isLoading`/`isPending` states.

## Scenarios
- **Initial Load**: User opens the dashboard. `useQuery` detects empty cache, sets `isLoading = true`, calls the repository, populates cache, and sets `isLoading = false`.
- **Rebuild Index**: User clicks "Sincronizar Portfolio". `useMutation` executes. While executing, the UI shows the spinner (derived from `isPending`). When done, Colada invalidates the `['portfolio-summary']` query key, triggering a background refetch. UI updates reactively.
