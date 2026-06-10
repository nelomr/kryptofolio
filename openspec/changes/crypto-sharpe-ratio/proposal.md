## Why

A dedicated card or dashboard segment is needed to display advanced risk-adjusted performance metrics, enabling users to evaluate the Sharpe Ratio, Sortino Ratio, Beta compared to Bitcoin, and Alpha.

## What Changes

- Add a minimalist `Card` component for displaying risk metrics.
- Show metric headers and values using the Kryptofolio design system classes (`var(--muted)`, `val-hero`, `text-profit`, etc.).
- Add a linear horizontal gauge to visually place the Sharpe ratio on a spectrum from bad to excellent.
- Implement domain models `RiskMetrics` and update `ICryptoMetricsPort`.
- Implement a Zod schema `RiskMetricsSchema` in the infrastructure layer to act as the Anti-Corruption Layer.
- Create `RiskMetricsCard.vue` and `RiskMetricItem.vue` and integrate via `@pinia/colada` into `PortfolioView.vue` under `<TabsContent value="metrics">` alongside `VolatilityHeatmap`.

## Capabilities

### New Capabilities
- `crypto-risk-metrics`: Display advanced risk-adjusted performance metrics including Sharpe Ratio, Sortino Ratio, Beta vs BTC, and Alpha.

### Modified Capabilities

## Impact

- `src/core/domain/ports/ICryptoMetricsPort.ts`
- `src/core/infrastructure/dtos/RiskMetricsSchema.ts`
- `src/views/Portfolio/components/metrics/RiskMetricsCard.vue`
- `src/views/Portfolio/components/metrics/RiskMetricItem.vue`
- `src/views/Portfolio/PortfolioView.vue`
