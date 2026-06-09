## Why

This change introduces a crypto volatility heatmap (a 12x30 grid) to visualize daily return percentages for the overall portfolio or specific assets. It helps users easily spot seasonality, volatility clustering, and performance trends over time at a glance.

## What Changes

- Add a new `VolatilityHeatmap.vue` component constructed with pure Vue grid layouts matching the institutional design system. It will be wrapped in Shadcn UI `Card` primitives to ensure visual consistency.
- Update the `ICryptoMetricsPort` domain port to support `getVolatilityHeatmap(year: number)`.
- Introduce `HeatmapDaySchema` and `VolatilityHeatmapResponseSchema` via Zod in the infrastructure layer.
- Integrate the component into `PortfolioView.vue` under the `TabsContent value="metrics"` section.

## Capabilities

### New Capabilities
- `crypto-volatility-heatmap`: Specifies the rules, inputs, outputs, and UI interactions of the volatility heatmap grid.

### Modified Capabilities
- `portfolio-layout`: The metrics tab requirements change slightly to include the heatmap.

## Impact

- **UI**: `src/views/Portfolio/PortfolioView.vue` and new component `src/views/Portfolio/components/metrics/VolatilityHeatmap.vue`.
- **Domain**: `src/core/domain/ports/ICryptoMetricsPort.ts`
- **Infrastructure**: `src/core/infrastructure/dtos/CryptoMetricsSchemas.ts`
- **State Management**: Updating Pinia Colada queries in `src/composables/queries/useCryptoMetricsQueries.ts`.
