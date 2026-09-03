## Why

Toast notifications — the app's only channel for save-success and error feedback — do not float above
the page. They render in the normal document flow, get pushed below `<main>`, stretch the root layout's
height and introduce page scroll. A user who just saved a setting or hit a validation error may never see
the confirmation, because it is parked off-screen at the bottom of a page they now have to scroll.

The cause is a single missing stylesheet import: `vue-sonner@2.0.9` ships its positioning as CSS
(`[data-sonner-toaster] { position: fixed; z-index: 999999999; … }`) exported as `vue-sonner/style.css`,
and its `Toaster.vue` deliberately does **not** use `Teleport` — the CSS is the whole mechanism. That
stylesheet is imported nowhere in the repo (grep for `vue-sonner/style.css` returns zero matches), so the
toast container falls back to static, in-flow rendering.

## What Changes

- Import `vue-sonner/style.css` in the frontend entry (`apps/frontend/src/main.ts`, or equivalently as an
  `@import` in `apps/frontend/src/style.css` alongside the existing theme/responsive imports), so the
  library's own positioning, stacking and offset custom properties actually apply.
- Toast notifications consequently render as a fixed overlay in the configured `top-right` corner, above
  page content, without contributing to document height or creating scroll.
- No change to the `Toaster`'s mount point (`apps/frontend/src/App.vue:71`) or to any call site of
  `toast()`. The dependency is already correctly configured; the stylesheet wiring was the only piece
  missing.
- One follow-up change to the `Toaster` wrapper (`apps/frontend/src/components/ui/sonner/Sonner.vue`,
  see design.md D5): a hardcoded `relative` class on the toast item, added when no vendor CSS applied,
  collided with the vendor sheet's `position: absolute` once restored and caused the toast to overflow
  its container's width. Removed — `position: absolute` alone is a sufficient positioning context for
  the close button.
- Not breaking. No API, DTO, port, or domain change.

Explicitly out of scope: the inline `<Alert>` banner for CSV parse errors in
`apps/frontend/src/modules/data-ingestion/components/DataIngestionWizard.vue`. It was investigated and is
intentionally inline — contextual to the wizard step, not a toast, and not a defect.

## Capabilities

### New Capabilities

None. This restores intended behavior of an existing capability; it introduces no new one.

### Modified Capabilities

- `global-error-handling`: the existing requirement states only that a global Toast "is displayed". Add
  the presentation guarantee that has been implicitly assumed and is currently violated — the toast
  container renders as a fixed-position overlay above page content, does not participate in document
  flow, and does not alter page height or scroll.

## Impact

- **Code**: `apps/frontend/src/main.ts` (or `apps/frontend/src/style.css`) — one import line. Visual
  effect on every view that raises a toast (Settings save, adapter validation failures via
  `global-error-handling`, ingestion feedback).
- **Dependencies**: none added. `vue-sonner@2.0.9` is already a direct dependency; only its published
  `./style.css` export is newly consumed.
- **Non-negotiable rules** (CLAUDE.md): this change is deliberately narrow and brushes against few.
  - Rule 8 (long-term solutions, no patches): the fix is the library's own supported wiring, not a local
    CSS override forcing `position: fixed` on `[data-sonner-toaster]`. Hand-written positioning CSS would
    be exactly the workaround rule 8 forbids and would drift from the library's offset variables.
  - `domain-uiux` / `DESIGN.md`: no new Tailwind class or token is introduced — the styling comes from the
    vendored stylesheet, and the existing themed wrapper in `components/ui/sonner/` keeps ownership of
    color tokens. Verify the vendor stylesheet does not override the wrapper's themed classes.
  - Rules 1-7 (no `any`, hexagonal layering, domain purity, `PreciseAmount`, discriminated unions, FIFO
    vs. custody ordering, `sourceProfile` conventions): untouched. No TypeScript type, backend route,
    database view, or tax/custody path is involved.
- **Risk**: low. Main risk is a global stylesheet introducing unexpected cascade effects; scoped to
  `[data-sonner-toaster]`/`[data-sonner-toast]` selectors, so it should be confirmed visually rather than
  assumed.
