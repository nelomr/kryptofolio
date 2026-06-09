# Kryptofolio — Design System

Design system for a crypto and stock portfolio dashboard. Designed to feel like a **modern institutional terminal**: high-contrast dark typography on pure white, all numbers in monospace, and a single accent palette (institutional indigo) with two semantic colors (green/red) for profit/loss.

> **Mode:** Strict `light`. There is no dark variant — backgrounds never leave the off-white family.

---

## 1. Color Tokens

### 1.1 Surfaces (whites)

| Token             | Hex       | OKLch                | Usage                                          |
|-------------------|-----------|----------------------|------------------------------------------------|
| `--bg`            | `#ffffff` | `oklch(100% 0 0)`    | Global canvas                                  |
| `--surface`       | `#ffffff` | `oklch(100% 0 0)`    | Cards                                          |
| `--surface-2`     | `#fafbfc` | `oklch(98.5% 0.003 240)` | Alternating rows, background bands           |
| `--surface-3`     | `#f4f6f8` | `oklch(96% 0.005 240)` | Active filter buttons, subtle hovers         |

### 1.2 Text and borders

| Token             | Hex       | OKLch                | Usage                                          |
|-------------------|-----------|----------------------|------------------------------------------------|
| `--fg`            | `#0a0f1c` | `oklch(18% 0.025 250)` | Main text (high contrast)                    |
| `--fg-2`          | `#1f2937` | `oklch(28% 0.018 250)` | Subtitles, highlighted values                |
| `--muted`         | `#6b7280` | `oklch(54% 0.012 250)` | Auxiliary text, labels                       |
| `--muted-2`       | `#9ca3af` | `oklch(70% 0.008 250)` | Disabled labels                              |
| `--border`        | `#e5e7eb` | `oklch(92% 0.004 250)` | Thin borders                                 |
| `--border-soft`   | `rgba(10, 14, 26, 0.06)` | —           | Ultra-subtle borders, dividers               |
| `--border-medium` | `rgba(10, 14, 26, 0.10)` | —           | Hover borders, focus                         |

### 1.3 Institutional brand

Deep indigo as the sole brand color. A single saturation layer, never a gradient.

| Variable          | Value     | OKLCH                 | Context                                      |
| ----------------- | --------- | --------------------- | -------------------------------------------- |
| `--brand`         | `#1e3a8a` | `oklch(32% 0.13 264)` | Primary buttons, focuses, main lines         |
| `--brand-hover`   | `#1d4ed8` | `oklch(45% 0.18 264)` | Hover, input focus                           |
| `--brand-soft`    | `rgba(30, 58, 138, 0.08)` | —           | Tinted backgrounds, soft badges              |
| `--brand-medium`  | `rgba(30, 58, 138, 0.14)` | —           | Active pills                                 |

### 1.4 Semantic (profit / loss / warning / info)

| Token             | Hex       | OKLch                | Usage                                          |
|-------------------|-----------|----------------------|------------------------------------------------|
| `--profit`        | `#00875a` | `oklch(54% 0.13 162)` | Gains, positive values                        |
| `--profit-soft`   | `rgba(0, 135, 90, 0.10)` | —           | Profit badges                                  |
| `--profit-medium` | `rgba(0, 135, 90, 0.18)` | —           | Bullish area fills                             |
| `--loss`          | `#d14343` | `oklch(58% 0.18 25)`  | Losses, negative values                        |
| `--loss-soft`     | `rgba(209, 67, 67, 0.10)` | —           | Loss badges                                    |
| `--loss-medium`   | `rgba(209, 67, 67, 0.18)` | —           | Bearish area fills                             |
| `--warning`       | `#b45309` | `oklch(54% 0.13 60)`  | Alerts, over-exposure                          |
| `--warning-soft`  | `rgba(180, 83, 9, 0.10)` | —           | Alert badge backgrounds                        |
| `--info`          | `#1d4ed8` | `oklch(48% 0.18 264)` | Neutral info, tax agency information           |
| `--info-soft`     | `rgba(29, 78, 216, 0.08)` | —           | Info badge backgrounds                         |

> **Note on Shadcn Mapping:** These tokens map to standard Shadcn variable patterns: `background` follows `--bg`, `foreground` follows `--fg`, `primary` maps to `--brand`, and `muted` maps to our secondary text tokens. Semantic profit/loss states should be mapped to custom color extensions in `tailwind.config.js` to ensure easy utility class access like `text-profit`.

---

## 2. Typography

Two families. Inter for general text, **JetBrains Mono for ALL numeric data** (amounts, percentages, ratios, timestamps, identifiers).

```css
--font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
--font-mono: 'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace;
```

### 2.1 Weights

| Weight  | Value | Usage                                     |
|---------|-------|-------------------------------------------|
| Regular | 400   | Paragraph text, secondary values          |
| Medium  | 500   | Labels, medium KPIs                       |
| Semibold| 600   | Card titles, highlighted numbers          |
| Bold    | 700   | Page headlines, hero values               |

### 2.2 Scale (px)

| Token           | Size   | Usage                                                |
|-----------------|--------|------------------------------------------------------|
| `text-xs`       | 11     | Micro-copies (kickers, units, timestamps)            |
| `text-sm`       | 13     | Labels, table values, captions                       |
| `text-base`     | 14     | Paragraph text                                       |
| `text-lg`       | 18     | Subtitles, secondary card values                     |
| `text-xl`       | 24     | Card titles                                          |
| `text-2xl`      | 32     | Highlighted KPIs                                     |
| `text-3xl`      | 44     | Main headlines                                       |
| `text-display`  | 56     | Page header display                                  |

### 2.3 Composition Rules

- **Tracking**: `letter-spacing: 0.18em` in uppercase micro-copies (kickers), `-0.02em` in display.
- **Tabular numerals**: `font-variant-numeric: tabular-nums` in any container with dense numeric values.
- **Mandatory Mono** for: prices, percentages, ratios, dates and times, transaction IDs, hashes.
- **Mono exceptions**: none. If the data is numeric, it must be mono.

---

## 3. Spacing

4 px scale. All gaps, paddings, and margins consume these tokens.

| Token    | px  |
|----------|-----|
| `space-1`  | 4   |
| `space-2`  | 8   |
| `space-3`  | 12  |
| `space-4`  | 16  |
| `space-5`  | 20  |
| `space-6`  | 24  |
| `space-8`  | 32  |
| `space-10` | 40  |
| `space-12` | 48  |
| `space-16` | 64  |

Rules:

- Internal cards: `padding: space-6` (24 px), with `gap: space-6` between children.
- Chart grids: `gap: space-6`.
- Page header: `padding: space-10 space-8` with `space-12` between sections.

---

## 4. Radii

| Token          | px  | Usage                                |
|----------------|-----|--------------------------------------|
| `--radius-sm`  | 6   | Small pills, filter buttons          |
| `--radius`     | 10  | Inputs, controls                     |
| `--radius-lg`  | 14  | Small cards, KPIs                    |
| `--radius-xl`  | 20  | Medium cards                         |
| `--radius-2xl` | 24  | Large cards (charts, hero)           |
| `--radius-full`| 9999 | Avatars, circular badges, live dot   |

---

## 5. Shadows

| Token              | Definition                                                                   | Usage                        |
|--------------------|------------------------------------------------------------------------------|------------------------------|
| `--shadow-soft`    | `0 1px 2px rgba(10,14,26,.04), 0 2px 6px rgba(10,14,26,.03)`                  | Cards at rest                |
| `--shadow-card`    | `0 1px 2px rgba(10,14,26,.04), 0 8px 24px rgba(10,14,26,.04)`                 | Elevated cards (hover, KPI)  |
| `--shadow-modal`   | `0 4px 12px rgba(10,14,26,.06), 0 24px 48px rgba(10,14,26,.08)`               | Modals, drawers              |

Shadows are **very soft**. This is the `shadow-soft` shadow the original brief referred to. Never in saturated black.

---

## 6. Components

### 6.1 Card

```css
.card {
  background: var(--surface);
  border: 1px solid var(--border-soft);   /* ≈ border-border/40 in Tailwind */
  border-radius: var(--radius-2xl);
  box-shadow: var(--shadow-soft);
  padding: var(--space-6);
}
```

- Header with kicker (eyebrow) + title + subtitle + actions.
- Body with content.
- Optional footer with a summary or link.

### 6.2 KPI Card (premium)

- Uppercase tracking-widest kicker (mono, 11 px).
- Hero value (display, mono, 32–44 px) with optional semantic color.
- Secondary delta (mono, 13 px) and a 7-day SVG sparkline.

### 6.3 Time filter (1D / 1W / 1M / 1Y / ALL)

```css
.time-filter button {
  font: 500 12px/1 var(--font-mono);
  letter-spacing: .12em;
  padding: 6px 10px;
  border-radius: var(--radius-sm);
  color: var(--muted);
  background: transparent;
  border: 1px solid transparent;
}
.time-filter button.active {
  background: var(--surface-3);
  color: var(--fg);
}
```

### 6.4 Status pill / badge

- Background `var(--profit-soft)` or `var(--loss-soft)` or `var(--warning-soft)` or `var(--brand-soft)`.
- Text in full saturation semantic color.
- Padding `2px 8px`, radius `--radius-sm`, mono 11 px.

### 6.5 Live indicator

- 8 px dot with `background: var(--profit)` and `box-shadow: 0 0 0 4px var(--profit-soft)`.
- `pulse` animation 1.8 s ease-in-out infinite (transform: scale + opacity).

### 6.6 Chart card

- Header: kicker + title + (filter or control).
- Body: SVG `viewBox` with `preserveAspectRatio="xMidYMid meet"`, `width: 100%`, `height: auto`.
- Footer: 2–3 inline mini-metrics with kicker + value.

---

## 7. Charts — Style Vocabulary

| Type            | Line                           | Fill                                  | Axis       |
|-----------------|--------------------------------|---------------------------------------|------------|
| Timeline        | `2px` stroke, `--brand` color | `var(--brand-soft)` area             | Hairlines  |
| Area            | `2px` stroke, `var(--profit)`  | Gradient `var(--profit-soft)` -> `0`  | No grid    |
| Line            | `2px` stroke, `var(--loss)`    | None                                  | No grid    |
| Bar             | `var(--info)` or `var(--muted)`| None                                  | Hairlines  |
| Scatter         | `4px` dot, `var(--brand)`      | `4px` `var(--brand-soft)` halo        | Thin axes  |

Common rules:

- Grid: 1 px in `var(--border-soft)`, no secondary grid.
- Axis labels: 10–11 px, `var(--muted)`, mono.
- Crosshair on hover: 1 px dashed `var(--muted-2)`.
- Floating tooltip with `var(--surface)` + `--shadow-card` + `--border-soft`.

---

## 8. Equivalent Tailwind config

```css
/* src/style.css — paste in project entrypoint */
@import "tailwindcss";

@theme inline {
  --color-bg: #ffffff;
  --color-surface: #ffffff;
  --color-surface-2: #fafbfc;
  --color-surface-3: #f4f6f8;
  
  --color-fg: #0a0f1c;
  --color-fg-2: #1f2937;
  --color-muted: #6b7280;
  --color-muted-2: #9ca3af;
  --color-border: #e5e7eb;
  --color-border-soft: rgba(10, 14, 26, 0.06);
  --color-border-medium: rgba(10, 14, 26, 0.10);

  --color-brand: #1e3a8a;
  --color-brand-hover: #1d4ed8;
  --color-brand-soft: rgba(30, 58, 138, 0.08);
  --color-brand-medium: rgba(30, 58, 138, 0.14);

  --color-profit: #00875a;
  --color-profit-soft: rgba(0, 135, 90, 0.10);
  --color-profit-medium: rgba(0, 135, 90, 0.18);
  
  --color-loss: #d14343;
  --color-loss-soft: rgba(209, 67, 67, 0.10);
  --color-loss-medium: rgba(209, 67, 67, 0.18);
  
  --color-warning: #b45309;
  --color-warning-soft: rgba(180, 83, 9, 0.10);
  
  --color-info: #1d4ed8;
  --color-info-soft: rgba(29, 78, 216, 0.08);

  --font-sans: "Inter", ui-sans-serif, system-ui, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, "SFMono-Regular", Menlo, monospace;

  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 14px;
  --radius-xl: 20px;
  --radius-2xl: 24px;
  --radius-full: 9999px;

  --shadow-sm: 0 1px 2px rgba(10,14,26,.04), 0 2px 6px rgba(10,14,26,.03);
  --shadow-md: 0 1px 2px rgba(10,14,26,.04), 0 8px 24px rgba(10,14,26,.04);
  --shadow-lg: 0 4px 12px rgba(10,14,26,.06), 0 24px 48px rgba(10,14,26,.08);
  --shadow-soft: var(--shadow-sm);
  --shadow-card: var(--shadow-md);
  --shadow-modal: var(--shadow-lg);

  --tracking-widest-2: 0.18em;
}
```

Typical usage:

```html
<div class="bg-card border border-border/40 rounded-2xl shadow-soft p-6">
  <p class="font-sans uppercase tracking-widest text-xs text-muted">TOTAL ROI</p>
  <p class="font-mono text-2xl font-semibold text-profit">+145.20%</p>
</div>
```

---

## 9. Golden Rules

1. **Light only.** The background is never dark. Not even for emphasis — emphasis is gained through size and weight.
2. **Mono is law.** If the character is a digit, it uses `font-mono`. No exceptions.
3. **Budgeted brand.** The brand color is used a maximum of twice per view. The rest of the color comes from profit/loss/neutral.
4. **One idea per card.** Cards are not stacked: each has a single headline and a single message.
5. **Data over decoration.** Charts always display real numbers from the brief; never generic placeholders.
6. **Breathing spacing.** No value less than `space-4` (16 px) from the edge of its card. Density is achieved through typography and color, not padding.
7. **No UI emoji.** Icons are simple SVGs (up/down arrow, live dot, alert). No 🚀 📈.
8. **No beige, no peach, no pink.** The canvas is white. Tinted badges are in `*-soft` (≤ 10% saturation).

---

## 10. Component Implementation Architecture

To ensure the design system remains unified and maintainable across the entire codebase, all components (especially those generated by AI) MUST adhere to the following architectural implementation rules:

### 10.1. UI Components (Shadcn-Vue)
- **Use Shadcn CLI:** NEVER write base primitive components (Card, Button, Dialog) from scratch. Always use the `shadcn-vue` CLI (`pnpm dlx shadcn-vue@latest add <component> -y`).
- **Standardized Wrappers:** All dashboard widgets must be wrapped in standard Shadcn layout components (`<Card>`, `<CardHeader>`, `<CardTitle>`, `<CardContent>`) to inherit global border radii, padding, and border styles.

### 10.2. Loading States & Skeletons
- **No Raw Animations:** NEVER build custom loading animations using `animate-pulse` on raw `div`s.
- **Use Official Skeletons:** ALWAYS use Shadcn's `<Skeleton>` component (`@/components/ui/skeleton`).
- **Geometric Matching:** Skeletons must precisely match the geometric shape, layout, and size of the final loaded component (e.g., `<Skeleton class="w-[200px] h-[200px] rounded-full" />` for a Donut chart) to entirely prevent Cumulative Layout Shifts (CLS).

### 10.3. Chart Architecture
- **No Manual SVGs:** Do not write manual SVG calculations for data visualization.
- **Libraries:** Use `vue-chartjs` (`chart.js`) for structural and categorical charts (Donuts, Pies, Bars). Use `lightweight-charts` for financial time-series.
- **Composables Extraction:** All chart configuration (Options, Plugins, Data Mapping) MUST be extracted into a Vue Composable (e.g., `useAssetAllocationChart.ts` inside `src/components/charts/composables/`). The `.vue` component must only contain the layout and the chart tag.
- **Z-Index Tooltip Overlays:** When overlaying absolutely positioned HTML elements on top of a Chart.js `<canvas>` (like a center text inside a Doughnut chart), place the HTML text **behind** the canvas (`z-0`) and the canvas **in front** (`z-10`). Chart.js renders tooltips inside its canvas context; if the text is layered above the canvas, it will visually clip or hide the native tooltips.
