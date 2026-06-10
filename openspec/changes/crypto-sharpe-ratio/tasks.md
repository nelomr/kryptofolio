## 1. Domain & Infrastructure Setup

- [x] 1.1 Add `RiskMetrics` interface to `src/core/domain/ports/ICryptoMetricsPort.ts`
- [x] 1.2 Add `getRiskMetrics` method to `ICryptoMetricsPort`
- [x] 1.3 Create `RiskMetricsSchema` in `src/core/infrastructure/dtos/RiskMetricsSchema.ts`
- [x] 1.4 Update existing infrastructure implementation of `ICryptoMetricsPort` to fetch and parse data using `RiskMetricsSchema`

## 2. UI Components Implementation

- [x] 2.1 Create `RiskMetricItem.vue` component to display individual metrics (Sharpe, Sortino, Alpha, Beta) with proper `text-profit`/`text-loss` color coding logic
- [x] 2.2 Create `RiskMetricsCard.vue` wrapper using shadcn-vue `Card` and layout standard
- [x] 2.3 Implement the Rolling Sharpe SVG/CSS visual gauge inside `RiskMetricsCard.vue` replicating the `.design/crypto.html` reference
- [x] 2.4 Use `@pinia/colada` `useQuery` inside the composable or setup block of `RiskMetricsCard.vue` to fetch the domain model

## 3. Integration & Testing

- [x] 3.1 Integrate `RiskMetricsCard.vue` into `src/views/Portfolio/PortfolioView.vue` under `<TabsContent value="metrics">`. Wrap `VolatilityHeatmap` and `RiskMetricsCard` inside a `<div class="grid lg:grid-cols-2 gap-6 lg:gap-8">`.
- [x] 3.2 Add unit tests for `RiskMetricsSchema` DTO validation
- [x] 3.3 Add component tests for `RiskMetricsCard.vue` checking rendering of threshold colors
- [x] 3.4 Visually verify layout and typography classes (`val-hero`, `num`, `kicker`)
