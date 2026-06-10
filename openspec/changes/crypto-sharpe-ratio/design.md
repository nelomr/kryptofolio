## Context

The Kryptofolio dashboard requires advanced risk-adjusted performance metrics to help evaluate portfolio efficiency. Currently, these metrics are either missing or not prominent. We need to implement a display for the Sharpe Ratio, Sortino Ratio, Alpha, and Beta vs BTC.

## Goals / Non-Goals

**Goals:**
- Present risk metrics (Sharpe, Sortino, Alpha, Beta vs BTC) in a clean `Card` component.
- Implement strict Domain Models (`RiskMetrics`) and Ports (`ICryptoMetricsPort`).
- Adhere strictly to the Kryptofolio UI guidelines (Tailwind v4 semantic variables, `shadcn-vue` components).
- Ensure safe data parsing using an Anti-Corruption Layer (Zod DTOs).
- Provide visual context for the Sharpe Ratio using an SVG/CSS gauge or chart, modeled after the `.design/crypto.html` design.

**Non-Goals:**
- Migrating existing dashboard components to new state management.
- Backend implementation of the metrics calculation (assuming data is served).

## Decisions

- **Domain Purity**: A `RiskMetrics` interface will be added to the domain layer. No dependencies (Zod, Axios, etc.) will be allowed in this layer.
- **Data Validation**: A `RiskMetricsSchema` Zod DTO will be created in `src/core/infrastructure/dtos/` to act as an Anti-Corruption Layer, ensuring any payload format is parsed into the pure domain model.
- **State Management**: Following architectural guidelines, server state will be managed via `@pinia/colada` `useQuery` inside the UI composables, explicitly avoiding global Pinia stores.
- **UI Structure**: The implementation will use `shadcn-vue` `Card` wrappers. We will create `RiskMetricsCard.vue` for the main widget and rely on standard `.num` font-mono styling for data presentation, leveraging colors like `--profit` and `--loss`.
- **Layout Integration**: The `RiskMetricsCard` will be integrated into `src/views/Portfolio/PortfolioView.vue` under `<TabsContent value="metrics">`. It will be displayed alongside `VolatilityHeatmap` within a `<div class="grid lg:grid-cols-2 gap-6 lg:gap-8">`.

## Risks / Trade-offs

- [Zod Validation Failures on API Change] → Use `safeParse` or `parseOrFail` with proper error routing to the `errorBus` so UI degrades gracefully instead of hard crashing.
- [Chart Complexity] → Relying on pure SVG/CSS for the rolling Sharpe chart per the `crypto.html` design may require precise scaling. We will extract this into a specific subcomponent to keep the card body clean.
