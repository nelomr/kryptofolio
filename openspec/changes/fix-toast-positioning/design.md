# Design — fix-toast-positioning

## Context

This is a one-import fix, and this document is deliberately short. It exists because the change is
*not* quite as decision-free as it looks: `vue-sonner@2.0.9`'s stylesheet is **unlayered** CSS, and
this frontend's utilities are emitted inside `@layer utilities` (Tailwind v4.3.0 via
`@tailwindcss/vite`). In the CSS cascade an unlayered normal declaration beats *any* layered normal
declaration regardless of specificity, so importing the vendor sheet naively fixes positioning and
simultaneously takes theming away from `components/ui/sonner/Sonner.vue`. Where and how the import
is written is therefore a real decision, not a formality.

Current state, verified in this repo:

- `apps/frontend/src/main.ts` imports only `./style.css`; `vue-sonner/style.css` is imported nowhere.
- `vue-sonner`'s `package.json` exports `"./style.css": "./lib/index.css"`; that file carries
  `[data-sonner-toaster] { position: fixed; z-index: 999999999; ... }` plus the `--offset-*`
  positioning variables. `Toaster.vue` does not `Teleport`; the CSS *is* the positioning mechanism.
- The built `dist/assets/index-*.css` contains `@layer theme`, `@layer base`, `@layer utilities`
  (and an empty `@layer components`) — confirming every Tailwind utility the wrapper uses is layered.
- `Sonner.vue` styles the toast with a mix of important utilities (`!p-4`, `!pr-12`, `!w-max`,
  `!max-w-[60vw]`) and non-important ones (`group-[.toaster]:bg-surface`, `border-border-soft`,
  `shadow-modal`, `rounded-xl`, `text-fg`). The vendor sheet's
  `[data-sonner-toast][data-styled='true']` block sets `background`, `border`, `color`,
  `border-radius`, `box-shadow`, `padding`, `width` — so the important ones survive and the
  non-important ones would be overridden. `data-styled` stays `true` here (the wrapper passes
  classes, not `unstyled`), so this collision is live, not hypothetical.

## Goals / Non-Goals

**Goals**

- Toasts render as a fixed overlay in the configured `top-right` corner, above page content, with no
  contribution to document height or scroll.
- Theming stays owned by `Sonner.vue` and `DESIGN.md` tokens — the vendor sheet supplies geometry,
  stacking and animation only.
- Use the library's own published stylesheet, unmodified and unvendored.

**Non-Goals**

- No change to `Toaster`'s mount in `App.vue:71`, or to any `toast()` call site. (`Sonner.vue` itself
  did end up changing — see D5 — once D1 exposed a real collision the initial framing missed.)
- No new Tailwind class, token, or design decision (`DESIGN.md` is unchanged).
- The inline `<Alert>` in `DataIngestionWizard.vue` stays inline — out of scope per the proposal.
- No dark-theme work: the vendor sheet's `[data-sonner-theme='dark']` rules are inert here because
  the wrapper's token classes govern color.

## Decisions

### D1 — Import via `style.css` inside a `vendor` cascade layer, not via `main.ts`

**Decision.** In `apps/frontend/src/style.css`, declare the layer order and import the vendor sheet
into a layer that sits *before* `utilities`:

```css
@layer theme, base, components, vendor, utilities;
@import "tailwindcss";
@import "vue-sonner/style.css" layer(vendor);
@import "./styles/theme.css";
@import "./styles/responsive-fixes.css";
```

The leading `@layer` statement establishes the order (the first statement to name a layer fixes its
position; Tailwind's own `@layer theme, base, components, utilities;` that follows is then a
consistent no-op re-declaration). Putting `vendor` before `utilities` means every Tailwind utility in
`Sonner.vue` outranks the vendor declarations for the same property, while the vendor sheet still
supplies everything the wrapper does not set — including `position: fixed` and `z-index`, which no
utility touches.

**Verified, not assumed.** Compiling exactly this CSS through `@tailwindcss/node@4.3.0` (the version
this repo resolves) with `base` set to `apps/frontend/src` produced output containing the declared
layer statement, an `@layer vendor { ... }` block, and all 28 `[data-sonner-toaster]` /
`[data-sonner-toast]` selector occurrences intact. Two sub-questions the proposal flagged are
answered by that run: Tailwind v4 resolves the bare `vue-sonner/style.css` specifier through package
`exports` itself, and it honours `layer(...)` on an `@import`.

**Alternatives considered.**

| Option | Why rejected |
|---|---|
| `import 'vue-sonner/style.css'` in `main.ts` | Simplest, and it does fix positioning — but a JS-side CSS import lands unlayered. Unlayered beats layered, so the wrapper's `bg-surface`/`border-border-soft`/`shadow-modal`/`rounded-xl` silently lose to the vendor's grey defaults. Import *order* cannot rescue this; layering outranks source order. |
| `main.ts` import + add `!` to the colliding utilities in `Sonner.vue` | Works, and matches a pattern already in that file, but it spreads `!important` as a cascade workaround and leaves the next vendor upgrade one new property away from the same fight. Fixing the layer once is the structural fix (rule 8). |
| Hand-written `[data-sonner-toaster] { position: fixed; ... }` override | The workaround rule 8 forbids: duplicates the library's offset/stacking variables and drifts on every upgrade. Explicitly rejected in the proposal. |
| Copy `lib/index.css` into `src/styles/` | Vendoring a dependency's stylesheet; same drift, plus it stops tracking `vue-sonner` upgrades. |

### D2 — No purge or tree-shaking guard is needed

Tailwind v4 scans *source files* for utility candidates; it does not purge hand-written or imported
CSS, which it inlines verbatim into the output (confirmed by the compile above — the sonner selectors
survive untouched). The sheet is CSS reached through a static `@import`, so no JS tree-shaking path
applies either; the `manualChunks` rule that routes `vue-sonner` into `ui-vendor` concerns its JS and
does not detach the stylesheet, which is emitted into the entry CSS asset. Nothing extra to configure
in `vite.config.ts`.

### D3 — Verification is manual and visual, by design

Cascade and layout are not observable in `happy-dom`: it does not compute the cascade across layers
and reports no layout geometry, so a `vitest` assertion on toast position would be exactly the
vacuous pass CLAUDE.md rule 3 warns about. Verification is therefore:

1. `pnpm --filter @kryptofolio/frontend dev`, trigger a save toast (Settings) and an error toast.
2. Confirm the toast floats top-right above content, and that page height and scroll position are
   unchanged with the toast visible versus dismissed.
3. Confirm theming is still the wrapper's: surface background, soft border, `shadow-modal`, `rounded-xl`,
   `text-fg` title, `text-muted` description — not sonner's default white/grey card.
4. Confirm the deliberate-break equivalent: temporarily remove the new `@import` line and see the
   toast fall back into flow, then restore it. This is the "prove it can fail" step for a change with
   no unit test.
5. `pnpm --filter @kryptofolio/frontend build` and grep the emitted CSS for `@layer vendor` and
   `data-sonner-toaster` to confirm the sheet ships and is layered as intended.

### D4 — Project rules touched

Rules 1–7 are genuinely not engaged and are recorded here only so the omission is deliberate, not an
oversight: no TypeScript is added, so no `any` and no boolean-plus-optional-payload shape arises
(rules 1, 5); no layer boundary is crossed, so hexagonal layering and domain purity are untouched
(rules 2, 3); no monetary value is read, formatted, or converted, so no `PreciseAmount`/`Money`
boundary exists in this change (rule 4); no FIFO view, ledger query, or custody path is involved, so
the global per-asset FIFO / per-account custody separation is untouched (rule 6); no source
convention is read or written, so `sourceProfile/profiles.ts` is not involved (rule 7). Rule 8 is the
one that binds, and D1 is the decision it drives.

### D5 — Removed the hardcoded `relative` class from `Sonner.vue`'s toast (found during verification)

**Symptom.** After D1 shipped, the toast floated (`position: fixed` on `[data-sonner-toaster]`), but
individual toast items still overflowed past the toaster's right edge — width visibly exceeding its
container.

**Cause.** `Sonner.vue`'s `classes.toast` string hardcoded the Tailwind utility `relative` on the
toast `<li>` — added, evidently, back when the vendor stylesheet was never imported and the li had no
`position` at all, so the close button (`!absolute !right-4 !top-4`) needed *some* positioned ancestor.
Vue-sonner's own CSS sets `[data-sonner-toast]{position:absolute}` inside `@layer vendor`; Tailwind
emits `.relative{position:relative}` inside `@layer utilities`. Per D1's layer order (`vendor` before
`utilities`), and since neither declaration is `!important`, the plain `.relative` utility beats the
plain vendor `position:absolute` for the same element. That knocks the li out of absolute positioning
and back into normal in-flow layout inside the fixed `<ol>`, where its `!w-max !max-w-[60vw]` width
(both `!important`, so unaffected by layering) overflows the `<ol>`'s box to the right instead of being
positioned/clipped by it.

**Decision.** Remove `relative` from `Sonner.vue`'s `classes.toast` string. `position: absolute` alone
already establishes a valid CSS containing block for the close button's `!absolute` positioning, so
nothing else needs to compensate. Verified live in the running app.

**Why this belongs in the same change, not a new one.** It is a direct, previously-invisible
consequence of D1: the vendor stylesheet was never live before, so this specific cascade collision
(unimportant `.relative` utility vs. unimportant vendor `position:absolute`) never had a chance to
manifest. Same root symptom (toast layout wrong), same fix vector (stop a local override from fighting
the vendor sheet now that it's active), same file family.

## Risks / Trade-offs

- **A vendor declaration the wrapper does not set slips through and looks wrong** (e.g. font-family on
  `[data-sonner-toaster]`, or the `max-width: 600px` mobile block) → The wrapper already sets
  `font-sans` and `!w-max !max-w-[60vw]`, both of which now win under D1. Verification step 3 and a
  narrow-viewport check catch the remainder.
- **Layer-order statement is load-bearing and easy to delete** → It sits on line 1 of `style.css`
  immediately above the two imports it governs; if it is ever dropped, `vendor` would be appended
  after `utilities` and theming would regress visibly at the next toast, which step 3 catches.
- **A future `vue-sonner` upgrade changes selector or variable names** → Contained: the failure mode
  is a visual regression in one component, and the fix stays "import the library's stylesheet",
  never a local override.
- **Global stylesheet cascade side effects outside toasts** → All added rules are scoped to
  `[data-sonner-toaster]` / `[data-sonner-toast]` and their descendants, plus one
  `html[dir='ltr']/[dir='rtl']` pairing that only sets sonner's own `--offset-*` custom properties.
  Now additionally confined to a cascade layer below `utilities`.

## Migration Plan

Two edits: `apps/frontend/src/style.css` (D1, two added lines) and `apps/frontend/src/components/ui/sonner/Sonner.vue`
(D5, one removed class). No data, schema, API, or config migration. Rollback is reverting both. Nothing
persists and no other package is affected.

## Open Questions

None. The one question the proposal left open — whether the vendor stylesheet overrides the wrapper's
themed classes — is answered (it would, unlayered) and resolved by D1.
