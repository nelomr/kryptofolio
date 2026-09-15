## ADDED Requirements

### Requirement: Server Data Is Fetched Through Pinia Colada

All server data SHALL be fetched with Pinia Colada `useQuery` and mutated with `useMutation`, wrapping the injected port adapters. No global Pinia store SHALL hold server data, and the data-fetching composables SHALL call port methods rather than an HTTP client directly.

#### Scenario: Portfolio summary is fetched by a query

- **WHEN** the dashboard mounts with an empty cache
- **THEN** `useQuery` MUST set `isLoading` to `true`, call the injected `ICryptoPortfolioPort`, populate the cache, and set `isLoading` to `false`
- **AND** the composable MUST NOT import an HTTP client or a store holding the same server data

#### Scenario: Rebuild is a mutation that invalidates its queries

- **WHEN** the user triggers the portfolio rebuild
- **THEN** it MUST run through `useMutation`, with the spinner derived from `isPending`
- **AND** on success the affected query keys MUST be invalidated so their queries refetch without a manual reload

### Requirement: The Display Currency Is Part of Every Currency-Dependent Query Key

Any query whose response depends on the display currency SHALL include that currency as its own segment of the query key — at minimum `crypto-metrics-kpis`, `portfolio-summary`, `crypto-asset-allocation` and `crypto-risk-metrics`. A key that omits it is a cache bug: switching currency serves the previous currency's cached payload.

#### Scenario: Switching currency refetches instead of serving the previous payload

- **WHEN** the display currency changes from EUR to USD
- **THEN** each currency-dependent query MUST resolve to a different key and issue a request for the new currency
- **AND** the rendered figures MUST NOT be the EUR payload

#### Scenario: Both currencies stay cached independently

- **WHEN** the user switches to USD and back to EUR
- **THEN** the EUR entry MUST still be addressable under its own key
- **AND** neither entry MUST have overwritten the other

#### Scenario: Every currency-dependent key is audited

- **WHEN** the query keys declared in `useCryptoMetricsQueries.ts` and `usePortfolioQueries.ts` are enumerated
- **THEN** every query whose request carries a currency parameter MUST include that currency in its key

### Requirement: Every Server-Data Query Declares an Explicit `staleTime`

Every `useQuery` in `useCryptoMetricsQueries.ts` and `usePortfolioQueries.ts` SHALL declare an explicit `staleTime` (60 s) rather than inheriting Pinia Colada's 5 s default. Freshness SHALL come from explicit invalidation by the mutations that dirty the ledger — ingestion and override edits — not from a short default silently re-firing the dashboard's request fan-out.

#### Scenario: Navigation does not re-fire the fan-out

- **WHEN** the user navigates away from the dashboard and back within the declared `staleTime`
- **THEN** the cached data MUST be served
- **AND** no new request MUST be issued for those queries

#### Scenario: A ledger-dirtying mutation invalidates the affected queries

- **WHEN** an ingestion or an override edit completes successfully
- **THEN** the portfolio and metrics query keys MUST be invalidated
- **AND** the next render MUST reflect the rebuilt figures

#### Scenario: No query relies on the default

- **WHEN** the `useQuery` calls in the two composable files are enumerated
- **THEN** each MUST pass an explicit `staleTime`
