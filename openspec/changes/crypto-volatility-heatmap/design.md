## Context

The portfolio metrics tab currently includes basic performance history and asset allocation. To better visualize seasonality, volatility clustering, and return distribution, we are introducing a volatility heatmap grid. Due to the exact institutional styling requirements (strict colors, monospace fonts, 1px borders), a pure Vue grid using `v-for` is preferred over heavy canvas-based libraries like `vue-chartjs` or `echarts` for this specific visualization.

## Goals / Non-Goals

**Goals:**
- Implement a 12x30 (or similar localized calendar matrix) volatility heatmap.
- Apply semantic tokens (`--profit`, `--loss`, `--surface-3`) based on return percentage.
- Expand domain port (`ICryptoMetricsPort`) and DTO schemas to support fetching this new data structure.

**Non-Goals:**
- Interactive timeframe selection beyond pre-determined buckets (for now).
- Complex canvas rendering for the heatmap.

## Decisions

- **Vue Native Grid vs Chart.js**: We decided to use a pure Vue grid constructed with CSS Grid (`grid-cols-12`, etc.) and `div` elements instead of `vue-chartjs`. Rationale: Native DOM elements are easier to style with our exact CSS variables, provide better a11y out of the box, and support custom tooltips via Radix Vue much more reliably.
- **UI Architecture**: The component will be strictly wrapped in Shadcn-Vue primitives (`Card`, `CardHeader`, `CardTitle`, `CardContent`) to align with dashboard standards, and will use `<Skeleton>` for its loading state. It will use `useI18n()` for any text strings (no hardcoded literals).
- **Pinia Colada**: We will leverage the existing query architecture (Pinia Colada) to fetch the volatility data from the repository, ensuring consistency with existing caching and loading states.
- **Color Mapping Strategy**: Color tokens will be resolved via a Vue `computed` property that maps ranges (e.g. `> +5%`, `0 to +5%`) directly to utility classes corresponding to `var(--profit)`, `var(--profit-medium)`, etc.

## Risks / Trade-offs

- [Risk] Hardcoded 12x30 dimension doesn't perfectly match actual calendar days (some months have 31, 28).
  → Mitigation: The grid will dynamically build standard months and fill missing days with empty cells (e.g. `opacity-0` or standard `--surface-3` empty style).
