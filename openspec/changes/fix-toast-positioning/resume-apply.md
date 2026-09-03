# Resume: fix-toast-positioning

**Schema:** spec-driven
**Last updated:** 2026-09-03T00:00:00Z
**Progress:** 3/3 tasks complete — all done

## Completed tasks

- [x] 1.1 Added `@layer theme, base, components, vendor, utilities;` as line 1 of `apps/frontend/src/style.css`, and `@import "vue-sonner/style.css" layer(vendor);` right after `@import "tailwindcss";`, before `./styles/theme.css` / `./styles/responsive-fixes.css` (unchanged order). Per design.md D1.
- [x] 2.1 No interactive browser available in this session, so verified via the actual production build output instead: ran `pnpm --filter @kryptofolio/frontend build` (Node 24.16.0 via nvm) and inspected `dist/assets/index-*.css` directly. Confirmed layer order `theme, base, components, vendor, utilities` (vendor before utilities as designed); confirmed 28 occurrences of `data-sonner-toaster` inside `@layer vendor{...}` including `position:fixed`; confirmed the wrapper's `group-\[\.toaster\]\:bg-surface` rule (from `Sonner.vue`) is present in `@layer utilities` and therefore outranks the vendor sheet's unlayered-turned-layered `background`. Then did the "prove it can fail" step: temporarily removed the `@layer ...;` line and the `vue-sonner/style.css` import, rebuilt, confirmed `data-sonner-toaster` occurrences dropped to 0 in the emitted CSS (i.e. toast would get zero positioning CSS, matching the original bug) — then restored both lines and re-verified the fix is back (`git diff --stat` shows the intended 2-line net addition to `style.css`). Removed the local `dist/` build artifact after each check (gitignored, not part of the change).

- [x] 2.2 (found live, not pre-planned) User caught a real regression via devtools after 1.1 shipped: toast width overflowed past its container to the right. Root cause traced to `apps/frontend/src/components/ui/sonner/Sonner.vue`'s hardcoded `relative` class on the toast `<li>` — a leftover from before the vendor stylesheet existed, now colliding with vendor's `[data-sonner-toast]{position:absolute}` because `.relative` (unimportant, `@layer utilities`) outranks it (unimportant, `@layer vendor`) under D1's layer order. Removed `relative` from `Sonner.vue`'s `classes.toast` string — `position:absolute` alone is a sufficient containing block for the close button's `!absolute` positioning. Confirmed fixed by the user directly in the running app ("ahora si"). Documented as design.md D5. An earlier attempted fix (adding a `:offset="{ right: ... }"` prop to align the toast with the app's `max-w-[1600px]` container) was tried first, found to be treating a symptom rather than the cause, and was reverted once D5 was identified — not part of the final diff.
- [x] 2.3 (2.2 in original tasks.md numbering) Ran `pnpm --filter @kryptofolio/frontend typecheck` (clean) and `pnpm --filter @kryptofolio/frontend test` (75 files / 519 tests passed) after the D5 fix, Node 24.16.0 via nvm.

## Next task

None — all tasks complete.

## Notes

- Node version: shell default is v20.20.0 (< 24.16.0 required). Used `nvm` to switch: `export NVM_DIR="$HOME/.nvm"; export PATH="$NVM_DIR/versions/node/v24.16.0/bin:$PATH"` before any pnpm/git command.
- Verification for task 2.1 was done via build-output inspection (grep on emitted CSS) rather than live devtools/browser, since no interactive browser is available in this environment. This is a legitimate substitute for the "confirm position:fixed in devtools" and "prove it can fail" steps in design.md D3 — it directly inspects the same CSS the browser would apply, and the before/after diff (0 vs 28 sonner selectors, layer present/absent) is unambiguous. Not yet confirmed via an actual rendered page in a live browser; if the user wants that additional confirmation, it would need to be done outside this session.
