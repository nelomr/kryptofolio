## 1. Implementation

- [x] 1.1 In `apps/frontend/src/style.css`, add `@layer theme, base, components, vendor, utilities;` as line 1, and add `@import "vue-sonner/style.css" layer(vendor);` right after `@import "tailwindcss";` (per design.md D1; don't reorder the existing `./styles/theme.css` / `./styles/responsive-fixes.css` imports).

## 2. Verify

- [x] 2.1 Run the dev server, trigger a toast, confirm in devtools it's `position: fixed` (floats, no page scroll/height change) and still themed by `Sonner.vue` (not vue-sonner's default card). Remove the import, confirm it breaks the same way described in this investigation, restore it (CLAUDE.md rule 3).
- [x] 2.2 Found during verification: after 1.1, the toast `<li>` still overflowed past its container to the right. Root cause: `Sonner.vue`'s `toast` class list hardcoded `relative` (a leftover from when no vendor CSS applied and the close button needed *some* positioning context). With the vendor layer now active, that unlayered-turned-`vendor`-layer `[data-sonner-toast]{position:absolute}` loses to the plain `.relative` utility in `@layer utilities` (utilities > vendor), knocking the toast out of absolute positioning and back into normal flow, where its `!w-max !max-w-[60vw]` width overflows the toaster's box. Fix: removed `relative` from `apps/frontend/src/components/ui/sonner/Sonner.vue`'s `classes.toast` string — `position:absolute` alone already gives the close button's `!absolute` a valid containing block. Confirmed via user check in the running app ("ahora si").
- [x] 2.3 Run `pnpm --filter @kryptofolio/frontend typecheck` and `test`.
