## 1. Domain & Infrastructure Updates

- [x] 1.1 Add `getVolatilityHeatmap(year: number)` to the `ICryptoMetricsPort` domain interface in `src/core/domain/ports/ICryptoMetricsPort.ts`.
- [x] 1.2 Add `HeatmapDaySchema` and `VolatilityHeatmapResponseSchema` to `src/core/infrastructure/dtos/CryptoMetricsSchemas.ts`.

## 2. API & Data Layer Updates

- [x] 2.1 Update the mock repository to return simulated volatility heatmap data.
- [x] 2.2 Add the Pinia Colada query logic for the heatmap inside `src/composables/queries/useCryptoMetricsQueries.ts`.

## 3. UI Component Creation

- [x] 3.1 Create the `VolatilityHeatmap.vue` component inside `src/views/Portfolio/components/metrics/`, using `<script setup lang="ts">`.
- [x] 3.2 Wrap the component in Shadcn `Card`, `CardHeader`, and `CardContent` components.
- [x] 3.3 Add proper loading state using Shadcn `<Skeleton>` components that geometrically match the final layout.
- [x] 3.4 Implement the native CSS grid logic to construct the 12x30 monthly matrix.
- [x] 3.5 Add computed properties to map return percentages to semantic tokens (`bg-profit`, `bg-loss-medium`, etc.).
- [x] 3.6 Add tooltip functionality via Radix Vue components to display exact dates and returns on hover.
- [x] 3.7 Add translation keys to `src/i18n/dictionaries/es.ts` and `en.ts` and implement `useI18n()`.

## 4. Integration

- [x] 4.1 Update `src/views/Portfolio/PortfolioView.vue` to render `<VolatilityHeatmap />` under `TabsContent value="metrics"`.
- [x] 4.2 Verify color rendering, font choices (monospace for numbers), and tooltip behavior against `DESIGN.md`.
